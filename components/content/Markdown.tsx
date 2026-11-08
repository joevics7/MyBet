import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders writer-produced markdown (no raw HTML) with theme-aware typography. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-display prose-headings:tracking-tight prose-a:text-brand prose-a:no-underline hover:prose-a:underline prose-table:text-sm prose-img:rounded-xl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: kids }) => {
            const external = !!href && /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {kids}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
