import Link from 'next/link';
import { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import { BlogPost } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Guides — Policy & Application Explainers',
  description: 'Plain-language explainers on how aggregates, loans, and admissions work, cited to the official policy each time.',
};

export const revalidate = 3600;

export default async function BlogIndexPage() {
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, language, published_at, countries(name, flag_emoji)')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  const list = (posts ?? []) as unknown as (BlogPost & { countries?: { name: string; flag_emoji: string } })[];

  return (
    <div className="max-w-4xl mx-auto px-4 py-14">
      <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
        Guides
      </p>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold">Policy & application guides</h1>
      <p className="mt-3 text-muted-foreground max-w-lg">
        How aggregates, loans, and admissions actually work — explained plainly and sourced to
        the official policy.
      </p>

      {list.length === 0 ? (
        <p className="mt-12 text-sm text-muted-foreground border-t border-border pt-8">
          Guides are being researched and verified against official sources before publishing —
          check back soon.
        </p>
      ) : (
        <div className="mt-10 divide-y divide-border border-t border-border">
          {list.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="block py-6 group">
              <p className="text-xs font-mono text-muted-foreground">
                {post.countries ? `${post.countries.flag_emoji} ${post.countries.name}` : 'Global'}
              </p>
              <h2 className="font-serif text-xl font-semibold mt-1 group-hover:text-[hsl(var(--verified))] transition-colors">
                {post.title}
              </h2>
              {post.excerpt && <p className="mt-1.5 text-sm text-muted-foreground">{post.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
