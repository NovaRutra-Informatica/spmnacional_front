import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@/lib/generated/prisma/client';
import type { SessionUser } from './auth';

type Scope = { mode: 'actor' | 'retention' | 'contact-mail' | 'public-contact' | 'generic-mail' | 'public-newsletter'; actorId: string; contactId: string; keyHash?: string; payloadHash?: string; subscriberId?: string; tokenHash?: string };
const scopes = new AsyncLocalStorage<Scope>();
const models = new Set(Object.values(Prisma.ModelName).map((name) => name[0].toLowerCase() + name.slice(1)));

/** The actor comes from the server session, never a form field or HTTP header.
 * Authorization is checked again against the active User and RolePermission by
 * PostgreSQL policies, including changes made after the session was loaded.
 */
export function withActorDatabaseScope<T>(actor: Pick<SessionUser, 'id'>, work: () => Promise<T>): Promise<T> {
    if (!actor?.id || actor.id.length > 256) throw new Error('Missing authenticated database actor');
    return scopes.run({ mode: 'actor', actorId: actor.id, contactId: '' }, work);
}

/** Server form validation/origin/rate limits precede this narrowly bounded scope. */
export function withPublicContactDatabaseScope<T>(work: () => Promise<T>, request?: { keyHash: string; payloadHash: string }): Promise<T> {
    if (request && ![request.keyHash, request.payloadHash].every(value => /^[a-f0-9]{64}$/.test(value)))
        throw new Error('Invalid hashed contact request');
    return scopes.run({ mode: 'public-contact', actorId: '', contactId: randomUUID(), ...request }, work);
}

/** Internal retention job only; the cron route authenticates its secret first. */
export function withRetentionDatabaseScope<T>(work: () => Promise<T>): Promise<T> {
    return scopes.run({ mode: 'retention', actorId: '', contactId: '' }, work);
}

/** Internal SMTP worker only; unlike retention, this cannot mutate message PII. */
export function withContactMailDatabaseScope<T>(work: () => Promise<T>): Promise<T> {
    return scopes.run({ mode: 'contact-mail', actorId: '', contactId: '' }, work);
}

export function withGenericMailDatabaseScope<T>(work: () => Promise<T>): Promise<T> {
    return scopes.run({ mode: 'generic-mail', actorId: '', contactId: '' }, work);
}

export function withPublicNewsletterDatabaseScope<T>(work: () => Promise<T>, request: { subscriberId: string; tokenHash: string }): Promise<T> {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(request.subscriberId) || !/^[a-f0-9]{64}$/.test(request.tokenHash))
        throw new Error('Invalid newsletter intent scope');
    return scopes.run({ mode: 'public-newsletter', actorId: '', contactId: '', ...request }, work);
}

async function applyScope(tx: Prisma.TransactionClient, scope: Scope): Promise<void> {
    // LOCAL values are reverted by COMMIT/ROLLBACK before this pooled connection
    // can serve another request. No connection-wide/session SET is allowed.
    await tx.$queryRaw`
        SELECT set_config('spm.scope', ${scope.mode}, true),
               set_config('spm.actor_id', ${scope.actorId}, true),
               set_config('spm.contact_id', ${scope.contactId}, true),
               set_config('spm.request_key', ${scope.keyHash ?? ''}, true),
               set_config('spm.request_payload', ${scope.payloadHash ?? ''}, true),
               set_config('spm.subscriber_id', ${scope.subscriberId ?? ''}, true),
               set_config('spm.subscriber_token', ${scope.tokenHash ?? ''}, true)
    `;
}

type Delegate = Record<string, (...args: unknown[]) => unknown>;

function newsletterArguments(scope: Scope, property: string, method: string, args: unknown[]): unknown[] {
    const input = args[0] as { data?: Record<string, unknown>; where?: Record<string, unknown> };
    if (property === 'newsletterSubscriber' && ['create', 'updateMany'].includes(method)) {
        const data = input.data;
        const allowed = new Set(['id', 'email', 'name', 'source', 'confirmTokenHash', 'confirmExpiresAt', 'confirmed', 'unsubscribedAt']);
        if (!data || Object.keys(data).some(key => !allowed.has(key)) || data.confirmTokenHash !== scope.tokenHash
            || (data.confirmed !== undefined && data.confirmed !== false) || data.unsubscribedAt != null
            || !(data.confirmExpiresAt instanceof Date) || !Number.isFinite(data.confirmExpiresAt.getTime())
            || data.confirmExpiresAt.getTime() <= Date.now() || data.confirmExpiresAt.getTime() > Date.now() + 86_460_000)
            throw new Error('Invalid public newsletter mutation');
        if (method === 'updateMany' && (data.id !== undefined || !input.where || input.where.id !== scope.subscriberId || input.where.confirmed !== false
            || Object.keys(input.where).some(key => !['id', 'confirmed', 'unsubscribedAt'].includes(key))))
            throw new Error('Newsletter subscriber is outside scope');
        return [{ ...input, ...(method === 'updateMany' ? { where: { ...input.where, id: scope.subscriberId, confirmed: false } } : {}),
            data: { ...data, ...(method === 'create' ? { id: scope.subscriberId } : {}), confirmed: false, unsubscribedAt: null } }];
    }
    if (property === 'genericEmailJob' && method === 'create') {
        const data = input.data;
        if (!data || data.kind !== 'NEWSLETTER_CONFIRMATION' || data.newsletterSubscriberId !== scope.subscriberId
            || data.versionHash !== scope.tokenHash || typeof data.payloadEncrypted !== 'string'
            || !/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(data.payloadEncrypted)
            || Buffer.byteLength(data.payloadEncrypted) > 16_384 || !(data.expiresAt instanceof Date)
            || !Number.isFinite(data.expiresAt.getTime()) || data.expiresAt.getTime() <= Date.now()
            || data.expiresAt.getTime() > Date.now() + 86_460_000)
            throw new Error('Invalid public newsletter email intent');
        return [{ data: { id: randomUUID(), kind: 'NEWSLETTER_CONFIRMATION', userId: null,
            newsletterSubscriberId: scope.subscriberId, versionHash: scope.tokenHash,
            payloadEncrypted: data.payloadEncrypted, expiresAt: data.expiresAt } }];
    }
    throw new Error('Public newsletter scope permits only its atomic subscriber and email intent');
}

function genericMailArguments(property: string, method: string, args: unknown[]): unknown[] {
    const input = args[0] as { where?: { id?: string }; select?: Record<string, unknown>; include?: unknown } | undefined;
    if (property === 'genericEmailJob' && ['findUnique', 'findMany', 'count', 'updateMany'].includes(method)) {
        if (input?.include || (input?.select && Object.values(input.select).some(value => typeof value !== 'boolean')))
            throw new Error('Mail worker does not expose nested relations');
        return args;
    }
    if (['user', 'newsletterSubscriber'].includes(property) && method === 'findUnique') {
        const fields = property === 'user' ? ['id', 'email', 'name', 'status', 'notificationVersion']
            : ['id', 'email', 'name', 'confirmed', 'confirmTokenHash', 'confirmExpiresAt', 'unsubscribedAt'];
        if (!input?.where?.id || !input.select || Object.keys(input).some(key => !['where', 'select'].includes(key))
            || Object.keys(input.where).some(key => key !== 'id')
            || Object.entries(input.select).some(([key, value]) => !fields.includes(key) || typeof value !== 'boolean'))
            throw new Error('Mail worker permits only a bounded source lookup');
        return [{ ...input, where: { id: input.where.id, emailJobs: { some: {} } } }];
    }
    throw new Error('Mail worker permits only job operations and bounded source lookups');
}

function restrictedServiceTransaction(tx: Prisma.TransactionClient, scope: Scope): Prisma.TransactionClient {
    return new Proxy(tx, { get(target, property) {
        if (typeof property !== 'string' || !models.has(property))
            throw new Error('Restricted service transaction does not permit raw SQL or other operations');
        const delegate = (target as unknown as Record<string, Delegate>)[property];
        return new Proxy(delegate, { get(model, method) {
            if (typeof method !== 'string' || typeof model[method] !== 'function') throw new Error('Invalid service operation');
            return (...args: unknown[]) => model[method](...(scope.mode === 'public-newsletter'
                ? newsletterArguments(scope, property, method, args) : genericMailArguments(property, method, args)));
        } });
    } });
}

function publicArguments(scope: Scope, property: string, method: string, args: unknown[]): unknown[] {
    if (property === 'contactMessage' && method === 'create') {
        const input = args[0] as { data: Record<string, unknown> };
        const allowed = new Set(['id', 'name', 'email', 'phone', 'city', 'subject', 'language', 'message', 'ip', 'userAgent', 'encryptedAt']);
        if (!input.data || Object.keys(input.data).some(key => !allowed.has(key))
            || (input.data.ip != null) || (input.data.userAgent != null))
            throw new Error('Invalid public contact creation fields');
        return [{ ...input, data: { ...input.data, id: scope.contactId } }];
    }
    if (scope.keyHash && property === 'idempotencyRequest' && ['findUnique', 'create'].includes(method)) {
        const input = args[0] as { where?: { keyHash?: string }; data?: Record<string, unknown> };
        if (method === 'findUnique') {
            if (input.where?.keyHash !== scope.keyHash) throw new Error('Contact replay key is outside scope');
            return args;
        }
        return [{ ...input, data: { keyHash: scope.keyHash, payloadHash: scope.payloadHash,
            expiresAt: new Date(Date.now() + 7 * 86_400_000) } }];
    }
    if (scope.keyHash && property === 'auditLog' && method === 'create') {
        // The public caller cannot choose an actor, target, log text or arbitrary
        // metadata. This fixed receipt commits alongside the message and claim.
        const input = args[0] as { data?: { action?: string } };
        if (input.data?.action !== 'Mensagem recebida pelo Fale Conosco')
            throw new Error('Invalid public contact audit receipt');
        return [{ data: { action: 'Mensagem recebida pelo Fale Conosco', actorLabel: 'site público',
            target: `Mensagem ${scope.contactId}`, userId: null, ip: null, userAgent: null,
            metadata: { contactMessageId: scope.contactId } } }];
    }
    if (scope.keyHash && property === 'contactEmailJob' && method === 'createMany') {
        const input = args[0] as { data?: Array<{ kind: string; contactMessageId: string }> };
        const rows = input.data;
        if (!Array.isArray(rows) || rows.length !== 2 || new Set(rows.map(row => row.kind)).size !== 2
            || rows.some(row => !['NOTIFICATION', 'ACKNOWLEDGEMENT'].includes(row.kind) || row.contactMessageId !== scope.contactId))
            throw new Error('Invalid public contact email jobs');
        return [{ data: rows.map(row => ({ id: randomUUID(), contactMessageId: scope.contactId, kind: row.kind })) }];
    }
    throw new Error('Public contact scope permits only creation and its exact replay key');
}

function restrictedPublicTransaction(tx: Prisma.TransactionClient, scope: Scope): Prisma.TransactionClient {
    return new Proxy(tx, { get(target, property) {
        if (typeof property !== 'string' || !['contactMessage', 'idempotencyRequest', 'auditLog', 'contactEmailJob'].includes(property))
            throw new Error('Public contact transaction permits only contact creation and its exact replay key');
        const delegate = (target as unknown as Record<string, Delegate>)[property];
        return new Proxy(delegate, { get(model, method) {
            if (typeof method !== 'string' || typeof model[method] !== 'function')
                throw new Error('Invalid public contact operation');
            return (...args: unknown[]) => model[method](...publicArguments(scope, property, method, args));
        } });
    } });
}

/** Scope each database operation, not the whole network-facing action. This
 * includes nested relations on other models, raw SQL and explicit transactions.
 * Callback transactions receive the real tx so row locks/mutations stay atomic.
 */
export function createScopedDatabase(client: PrismaClient): PrismaClient {
    const delegates = new Map<string, object>();
    return new Proxy(client, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof property !== 'string') return value;
            if (property === '$transaction') {
                return (work: unknown, options?: unknown) => {
                    const scope = scopes.getStore();
                    if (!scope) return target.$transaction(work as never, options as never);
                    if (scope.mode === 'public-contact' && !scope.keyHash) throw new Error('Public contact scope permits only creation');
                    if (typeof work !== 'function') throw new Error('Scoped transactions require a callback');
                    return target.$transaction(async (tx) => {
                        await applyScope(tx, scope);
                        return work(scope.mode === 'public-contact' ? restrictedPublicTransaction(tx, scope)
                            : ['public-newsletter', 'generic-mail'].includes(scope.mode) ? restrictedServiceTransaction(tx, scope) : tx);
                    }, options as never);
                };
            }
            if (['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe'].includes(property)) {
                return (...args: unknown[]) => {
                    const scope = scopes.getStore();
                    if (!scope) return (value as (...input: unknown[]) => unknown).apply(target, args);
                    if (scope.mode === 'public-contact') throw new Error('Public contact scope permits only creation');
                    if (scope.mode === 'public-newsletter') throw new Error('Public newsletter scope does not permit raw SQL');
                    if (scope.mode === 'generic-mail' && (property !== '$queryRaw' || !Array.isArray(args[0])
                        || args.length !== 1 || args[0].length !== 1 || args[0][0].trim() !== 'SELECT clock_timestamp() AS now'))
                        throw new Error('Mail worker permits only its database clock query');
                    return target.$transaction(async (tx) => {
                        await applyScope(tx, scope);
                        return (tx as unknown as Delegate)[property](...args);
                    });
                };
            }
            if (!models.has(property)) {
                if (typeof value === 'function') return (...args: unknown[]) => {
                    const scope = scopes.getStore();
                    if (scope && ['public-contact', 'public-newsletter', 'generic-mail'].includes(scope.mode))
                        throw new Error('Restricted database scope does not permit client extensions or lifecycle operations');
                    return value.apply(target, args);
                };
                if (scopes.getStore() && ['public-contact', 'public-newsletter', 'generic-mail'].includes(scopes.getStore()!.mode))
                    throw new Error('Restricted database scope does not expose client internals');
                return value;
            }
            if (!delegates.has(property)) delegates.set(property, new Proxy(value, {
                get(delegate, method) {
                    const operation = Reflect.get(delegate, method);
                    if (typeof operation !== 'function' || typeof method !== 'string') return operation;
                    return (...args: unknown[]) => {
                        const scope = scopes.getStore();
                        if (!scope) return operation.apply(delegate, args);
                        if (scope.mode === 'public-contact') {
                            args = publicArguments(scope, property, method, args);
                        }
                        if (scope.mode === 'public-newsletter') args = newsletterArguments(scope, property, method, args);
                        if (scope.mode === 'generic-mail') args = genericMailArguments(property, method, args);
                        return target.$transaction(async (tx) => {
                            await applyScope(tx, scope);
                            return (tx as unknown as Record<string, Delegate>)[property][method](...args);
                        });
                    };
                },
            }));
            return delegates.get(property);
        },
    });
}
