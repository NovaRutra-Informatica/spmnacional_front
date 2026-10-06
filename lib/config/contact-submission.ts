const CONTACT_FIELDS = [
    'name',
    'email',
    'phone',
    'city',
    'subject',
    'language',
    'message',
] as const;

/** Used only in the current document; never stored or sent to analytics. */
export function contactAttemptFingerprint(data: FormData): string {
    return JSON.stringify(CONTACT_FIELDS.map((field) => String(data.get(field) ?? '').trim()));
}

export function newContactSubmissionKey(): string {
    return globalThis.crypto.randomUUID();
}
