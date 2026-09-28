// File: app/sitemap.ts

import { MetadataRoute } from 'next';

const siteUrl = 'https://www.naira.autos';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/sitemap-static.xml`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    // sitemap-listings.xml disabled: the route is app/_sitemap-listings.xml
    // (underscore prefix = excluded from Next.js routing), part of the
    // listings/marketplace feature being paused sitewide. This was
    // returning a 404 to Google on every sitemap-index crawl. Restore by
    // renaming the route folder (drop the underscore) and un-commenting.
    // {
    //   url: `${siteUrl}/sitemap-listings.xml`,
    //   lastModified: new Date(),
    //   changeFrequency: 'hourly',
    //   priority: 1,
    // },
    // sitemap-search.xml temporarily disabled
    // {
    //   url: `${siteUrl}/sitemap-search.xml`,
    //   lastModified: new Date(),
    //   changeFrequency: 'daily',
    //   priority: 0.9,
    // },
    // sitemap-sellers.xml disabled: same issue as sitemap-listings.xml above
    // — the route is app/_sitemap-sellers.xml, excluded from routing.
    // {
    //   url: `${siteUrl}/sitemap-sellers.xml`,
    //   lastModified: new Date(),
    //   changeFrequency: 'daily',
    //   priority: 0.8,
    // },
    {
      url: `${siteUrl}/sitemap-blogs.xml`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      // NOTE: this route already existed but was never linked from this index,
      // meaning search engines couldn't discover it unless submitted manually.
      url: `${siteUrl}/sitemap-vehicles.xml`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/sitemap-obd-codes.xml`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/sitemap-documents.xml`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}

export const revalidate = 3600;