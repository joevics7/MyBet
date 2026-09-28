import { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://naira.autos';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/profile/',
        '/profile/*',
        '/requests/create',
        '/requests/view',
        '/add-listing',
        '/saved',
        '/*.json$',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
