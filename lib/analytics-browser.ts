import {
    analyticsLocation,
    analyticsPermitted,
    type AnalyticsConsentChoice,
} from './config/analytics';

export interface AnalyticsPort {
    origin: string;
    signals: { globalPrivacyControl?: boolean; doNotTrack?: string | null };
    disable(value: boolean): void;
    command(...args: unknown[]): void;
    load(id: string, nonce?: string): void;
    clearCookies(): void;
}

/** Basic consent mode: no Google request is made before an affirmative decision. */
export function createAnalyticsController(id: string, port: AnalyticsPort, nonce?: string) {
    let loaded = false;
    let lastPage: string | undefined;
    const deny = () => {
        port.disable(true);
        if (loaded)
            port.command('consent', 'update', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
            });
        lastPage = undefined;
    };
    deny();
    return {
        update(choice: AnalyticsConsentChoice, path: string) {
            const location = analyticsLocation(port.origin, path);
            if (!location || !analyticsPermitted(id, choice, path, port.signals)) {
                deny();
                if (choice === 'denied') port.clearCookies();
                return;
            }
            port.disable(false);
            if (!loaded) {
                port.command('consent', 'default', {
                    analytics_storage: 'granted',
                    ad_storage: 'denied',
                    ad_user_data: 'denied',
                    ad_personalization: 'denied',
                });
                port.command('js', new Date());
                port.command('config', id, {
                    send_page_view: false,
                    cookie_domain: 'none',
                    allow_google_signals: false,
                    allow_ad_personalization_signals: false,
                    page_location: location,
                    page_referrer: '',
                });
                port.load(id, nonce);
                loaded = true;
            } else {
                port.command('consent', 'update', { analytics_storage: 'granted' });
            }
            if (lastPage !== location) {
                port.command('event', 'page_view', {
                    send_to: id,
                    page_location: location,
                    page_referrer: '',
                });
                lastPage = location;
            }
        },
        stop: deny,
    };
}

/** Only this adapter touches browser globals; it never reads forms or session cookies. */
export function browserAnalyticsPort(id: string): AnalyticsPort {
    const analyticsWindow = window as Window & {
        dataLayer?: unknown[];
        gtag?: (...args: unknown[]) => void;
    };
    const flags = analyticsWindow as unknown as Record<string, unknown>;
    return {
        origin: window.location.origin,
        signals: {
            globalPrivacyControl: (navigator as Navigator & { globalPrivacyControl?: boolean })
                .globalPrivacyControl,
            doNotTrack: navigator.doNotTrack,
        },
        disable(value) {
            flags[`ga-disable-${id}`] = value;
        },
        command(...args) {
            analyticsWindow.dataLayer ??= [];
            analyticsWindow.gtag ??= function () {
                // eslint-disable-next-line prefer-rest-params -- The gtag queue uses the Arguments protocol.
                analyticsWindow.dataLayer!.push(arguments);
            };
            analyticsWindow.gtag(...args);
        },
        load(measurementId, nonce) {
            const script = document.createElement('script');
            script.async = true;
            script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
            if (nonce) script.nonce = nonce;
            document.head.appendChild(script);
        },
        clearCookies() {
            for (const item of document.cookie.split(';')) {
                const name = item.split('=')[0]?.trim();
                if (name === '_ga' || name?.startsWith('_ga_')) {
                    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
                }
            }
        },
    };
}
