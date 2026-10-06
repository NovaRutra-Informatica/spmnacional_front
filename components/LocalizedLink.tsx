'use client';

import Link from 'next/link';
import { forwardRef, type ComponentProps } from 'react';
import { isPrivatePath, localizeHref } from '@/lib/i18n/links';
import { usePublicTranslation } from './TranslationProvider';

const LocalizedLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(
    function LocalizedLink({ href, ...props }, ref) {
        const { locale } = usePublicTranslation();
        if (typeof href === 'string' && href.startsWith('/') && isPrivatePath(href.split(/[?#]/)[0])) {
            // A fresh document keeps optional public analytics out of login and admin pages.
            const anchorProps = { ...props };
            delete anchorProps.prefetch;
            delete anchorProps.replace;
            delete anchorProps.scroll;
            delete anchorProps.shallow;
            delete anchorProps.locale;
            delete anchorProps.onNavigate;
            return <a ref={ref} href={href} {...anchorProps} />;
        }
        return (
            <Link
                ref={ref}
                href={typeof href === 'string' ? localizeHref(href, locale) : href}
                {...props}
            />
        );
    },
);
export default LocalizedLink;
