import type { Metadata } from 'next';
import { getToolContent } from '@/lib/services/content';

/** Uses the title/meta description from tool_translations when present, else the hardcoded fallback. */
export async function toolMetadata(slug: string, fallback: Metadata): Promise<Metadata> {
  const c = await getToolContent(slug);
  if (!c) return fallback;
  return {
    ...fallback,
    title: c.title || fallback.title,
    description: c.metaDescription || c.description || fallback.description,
  };
}
