// File: app/sitemap-static.xml/route.ts
// Accessible at: https://naira.autos/sitemap-static.xml

import { NextResponse } from 'next/server';

const siteUrl = 'https://www.naira.autos';

export const revalidate = 86400;

const staticPages = [
  { url: '/',                                   priority: 1.0, changefreq: 'weekly'  },
  { url: '/sell-for-me',                        priority: 0.9, changefreq: 'weekly'  },
  { url: '/evaluate-used-car',                  priority: 0.9, changefreq: 'weekly'  },
  { url: '/evaluate-car',                       priority: 0.9, changefreq: 'weekly'  },
  { url: '/blog',                               priority: 0.8, changefreq: 'daily'   },
  { url: '/vehicles',                           priority: 0.8, changefreq: 'weekly'  },
  { url: '/tools',                              priority: 0.9, changefreq: 'weekly'  },
  { url: '/tools/ai-mechanic',                  priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/auto-loan-calculator',         priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/import-duty-calculator',       priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/registration-fee-calculator',  priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/fuel-cost-calculator',         priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/road-trip-calculator',         priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/vin-checker',                  priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/vin-checker-global',            priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/chassis-number-check',         priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/vehicle-papers-checklist',     priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/insurance-calculator',         priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/best-car-for',                 priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/car-comparison',               priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/glossary',                     priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/document-generator',           priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/wiper-blade-size-finder',      priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/headlight-bulb-finder',        priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/fuel-economy-converter',       priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/rideshare-earnings-calculator', priority: 0.7, changefreq: 'monthly' },
  { url: '/tools/import-age-limit',             priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/import-age-limit/nigeria',     priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/vehicle-license',              priority: 0.8, changefreq: 'monthly' },
  { url: '/tools/vehicle-license/nigeria',      priority: 0.8, changefreq: 'monthly' },
  { url: '/documents',                          priority: 0.7, changefreq: 'weekly'  },
  { url: '/about',                              priority: 0.5, changefreq: 'monthly' },
  { url: '/contact',                            priority: 0.5, changefreq: 'monthly' },
  { url: '/faq',                                priority: 0.5, changefreq: 'monthly' },
  { url: '/privacy',                            priority: 0.4, changefreq: 'monthly' },
  { url: '/terms',                              priority: 0.4, changefreq: 'monthly' },
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