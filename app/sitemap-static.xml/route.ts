// File: app/sitemap-static.xml/route.ts
// Accessible at: https://betmeter.com/sitemap-static.xml

import { NextResponse } from 'next/server';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';

export const revalidate = 86400;

const staticPages = [
  { url: '/',                          priority: 1.0, changefreq: 'weekly'  },
  { url: '/tools',                     priority: 0.9, changefreq: 'weekly'  },
  { url: '/tools/decoder',             priority: 0.9, changefreq: 'monthly' },
  { url: '/tools/converter',           priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/splitter',            priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/odds-comparison',     priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/vault',               priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/stake-calculator',    priority: 0.8, changefreq: 'monthly' },
  { url: '/predictor',                 priority: 0.8, changefreq: 'daily'   },
  { url: '/about',                     priority: 0.5, changefreq: 'monthly' },
  { url: '/contact',                   priority: 0.5, changefreq: 'monthly' },
  { url: '/faq',                       priority: 0.5, changefreq: 'monthly' },
  { url: '/privacy',                   priority: 0.4, changefreq: 'monthly' },
  { url: '/terms',                     priority: 0.4, changefreq: 'monthly' },
];

export async function GET() {
  const now = new Date().toISOString();

  const urls = staticPages
    .map(
      (page) => `
  <url>
    <loc>${siteUrl}${page.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `public, max-age=${revalidate}, stale-while-revalidate`,
    },
  });
}
