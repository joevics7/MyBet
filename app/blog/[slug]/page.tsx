import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import BlogMarkdownRenderer from '@/components/BlogMarkdownRenderer';

export const revalidate = 3600;

async function getPost(slug: string) {
  const { data } = await supabase
    .from('blog_posts')
    .select('*, countries(name, flag_emoji)')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  return (
    <article className="max-w-3xl mx-auto px-4 py-14">
      <nav className="text-xs text-muted-foreground mb-6 font-mono">
        <Link href="/blog" className="hover:text-[hsl(var(--verified))]">Guides</Link>
        <span> / </span>
        <span className="text-foreground">{post.title}</span>
      </nav>

      {post.countries && (
        <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
          {post.countries.flag_emoji} {post.countries.name}
        </p>
      )}
      <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight">{post.title}</h1>

      {post.last_reviewed_at && (
        <p className="mt-3 text-xs text-muted-foreground font-mono">
          Last reviewed {new Date(post.last_reviewed_at).toLocaleDateString()}
        </p>
      )}

      <div className="mt-8">
        <BlogMarkdownRenderer content={post.content_md ?? ''} />
      </div>
    </article>
  );
}
