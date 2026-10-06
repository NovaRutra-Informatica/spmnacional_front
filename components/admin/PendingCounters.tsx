'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/** Counts only; no record identifiers or personal data are sent to the client. */
export default function PendingCounters({ messages, cases }: { messages: number; cases: number }) {
    const [counts, setCounts] = useState({ messages, cases });
    useEffect(() => {
        let stream: EventSource | undefined;
        let reconnect: ReturnType<typeof setTimeout> | undefined;
        let delay = 5000;
        let ended = false;
        const stop = () => { clearTimeout(reconnect); stream?.close(); stream = undefined; };
        function connect() {
            if (ended || document.hidden) return;
            stop();
            stream = new EventSource('/api/admin/pendencias/stream');
            stream.addEventListener('pending', event => {
                try {
                    const value = JSON.parse((event as MessageEvent).data);
                    if ([value.messages, value.cases].every(number => Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000_000)) {
                        setCounts({ messages: value.messages, cases: value.cases });
                        delay = 5000;
                    }
                } catch { /* Ignore malformed events without displaying their content. */ }
            });
            stream.addEventListener('session-ended', () => { ended = true; stop(); });
            stream.onerror = () => {
                stop();
                if (!ended && !document.hidden) {
                    reconnect = setTimeout(connect, delay);
                    delay = Math.min(30_000, delay * 2);
                }
            };
        }
        const visibility = () => { if (document.hidden) stop(); else connect(); };
        document.addEventListener('visibilitychange', visibility);
        connect();
        return () => { ended = true; stop(); document.removeEventListener('visibilitychange', visibility); };
    }, []);
    return <p className="admin-live-counters" aria-live="polite" aria-atomic="true">
        <Link href="/admin/mensagens">Mensagens novas: {counts.messages}</Link>
        {' · '}<Link href="/admin/atendimentos">Atendimentos em aberto: {counts.cases}</Link>
    </p>;
}
