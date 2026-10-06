import type { MetadataRoute } from 'next';
import { env } from '@/lib/server/env';
import { robotsPolicy } from '@/lib/seo';

// Depende de APP_URL, que só é conhecida em execução — não no `docker build`.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
    return robotsPolicy(env.appUrl);
}
