import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Server-only readers for the blog + tool SEO content tables. These tables use
// the same structure as the Toolbase admin, so one writer serves both sites.
// The service-role client bypasses RLS, so "published" is enforced here.

const LOCALE = 'en';

export interface ArticleSummary {
  slug: string;
  category: string;
  publishedAt: string | null;
  title: string;
  excerpt: string | null;
  readingTime: number;
  image: string | null;
}

export interface Article extends ArticleSummary {
  content: string;
  metaDescription: string | null;
  relatedToolSlugs: string[];
}

export interface ToolContent {
  title: string | null;
  description: string | null;
  metaDescription: string | null;
  articleTitle: string | null;
  articleBody: string | null;
  contentAddition: string | null;
  faq: { question: string; answer: string }[];
  imageUrl: string | null;
  imageAlt: string | null;
  lastUpdated: string | null;
  reviewerName: string | null;
  sourceUrl: string | null;
}

type TranslationRow = {
  locale: string;
  title: string;
  excerpt: string | null;
  content?: string;
  meta_description?: string | null;
  og_image_url: string | null;
  reading_time_minutes: number;
};

function pickTranslation(rows: TranslationRow[] | null | undefined): TranslationRow | null {
  if (!rows || rows.length === 0) return null;
  return rows.find((r) => r.locale === LOCALE) ?? rows[0];
}

export async function listArticles(): Promise<ArticleSummary[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('articles')
      .select(
        'slug, category_slug, published_at, article_translations(locale, title, excerpt, og_image_url, reading_time_minutes)',
      )
      .eq('published', true)
      .order('published_at', { ascending: false });
    if (error || !data) return [];
    return data.flatMap((a: any) => {
      const t = pickTranslation(a.article_translations);
      if (!t) return [];
      return [
        {
          slug: a.slug,
          category: a.category_slug,
          publishedAt: a.published_at,
          title: t.title,
          excerpt: t.excerpt,
          readingTime: t.reading_time_minutes,
          image: t.og_image_url,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function getArticle(slug: string): Promise<Article | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('articles')
      .select(
        'slug, category_slug, published_at, related_tool_slugs, article_translations(locale, title, excerpt, content, meta_description, og_image_url, reading_time_minutes)',
      )
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();
    if (error || !data) return null;
    const t = pickTranslation((data as any).article_translations);
    if (!t) return null;
    return {
      slug: data.slug,
      category: data.category_slug,
      publishedAt: data.published_at,
      title: t.title,
      excerpt: t.excerpt,
      readingTime: t.reading_time_minutes,
      image: t.og_image_url,
      content: t.content ?? '',
      metaDescription: t.meta_description ?? null,
      relatedToolSlugs: (data as any).related_tool_slugs ?? [],
    };
  } catch {
    return null;
  }
}

export async function getToolContent(toolSlug: string): Promise<ToolContent | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('tool_translations')
      .select('*')
      .eq('tool_slug', toolSlug)
      .eq('locale', LOCALE)
      .maybeSingle();
    if (error || !data) return null;
    const faq = Array.isArray(data.faq)
      ? data.faq.filter((f: any) => f && f.question && f.answer)
      : [];
    return {
      title: data.title,
      description: data.description,
      metaDescription: data.meta_description,
      articleTitle: data.article_title,
      articleBody: data.article_body,
      contentAddition: data.content_addition,
      faq,
      imageUrl: data.image_url,
      imageAlt: data.image_alt,
      lastUpdated: data.last_updated,
      reviewerName: data.reviewer_name,
      sourceUrl: data.source_url,
    };
  } catch {
    return null;
  }
}
