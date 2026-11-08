import { MetadataRoute } from 'next';
import { listArticles } from '@/lib/services/content';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await listArticles();
  return [
    {
      url: `${siteUrl}/sitemap-static.xml`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    { url: `${siteUrl}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    ...articles.map((a) => ({
      url: `${siteUrl}/blog/${a.slug}`,
      lastModified: a.publishedAt ? new Date(a.publishedAt) : new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}

export const revalidate = 3600;
