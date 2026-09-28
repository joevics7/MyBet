'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface BlogMarkdownRendererProps {
  content: string;
  className?: string;
}

export default function BlogMarkdownRenderer({ content, className = "" }: BlogMarkdownRendererProps) {
  return (
    <div className={`prose prose-lg max-w-none prose-headings:font-bold prose-h1:text-4xl prose-h1:mt-8 prose-h1:mb-6 prose-h2:text-3xl prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-2xl prose-h3:mt-6 prose-h3:mb-3 prose-h4:text-xl prose-h4:mt-4 prose-h4:mb-2 prose-p:text-gray-700 prose-p:leading-relaxed prose-p:my-4 prose-strong:text-gray-900 prose-em:text-gray-700 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-ul:my-6 prose-ol:my-6 prose-li:my-2 prose-table:my-6 prose-th:border prose-th:border-gray-200 prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-td:border prose-td:border-gray-200 prose-td:px-4 prose-td:py-2 prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600 prose-code:text-pink-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({node, ...props}) => <h1 className="text-4xl font-bold text-gray-900 mt-8 mb-6" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-3xl font-bold text-gray-900 mt-8 mb-4" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-2xl font-bold text-gray-900 mt-6 mb-3" {...props} />,
          h4: ({node, ...props}) => <h4 className="text-xl font-bold text-gray-900 mt-4 mb-2" {...props} />,
          p: ({node, ...props}) => <p className="text-gray-700 leading-relaxed my-4" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
          em: ({node, ...props}) => <em className="italic text-gray-700" {...props} />,
          a: ({node, href, children, ...props}) => (
            <a
              href={href}
              className="text-blue-600 hover:text-blue-700 underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          ul: ({node, ...props}) => <ul className="list-disc list-inside my-6 space-y-2" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal list-inside my-6 space-y-2" {...props} />,
          li: ({node, ...props}) => <li className="text-gray-700 my-2" {...props} />,
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 my-6" {...props} />
          ),
          table: ({node, ...props}) => (
            <div className="overflow-x-auto my-6">
              <table className="min-w-full border-collapse border border-gray-200" {...props} />
            </div>
          ),
          thead: ({node, ...props}) => <thead className="bg-gray-50" {...props} />,
          th: ({node, ...props}) => <th className="border border-gray-200 px-4 py-2 text-left font-semibold text-gray-900" {...props} />,
          td: ({node, ...props}) => <td className="border border-gray-200 px-4 py-2 text-gray-700" {...props} />,
          tr: ({node, ...props}) => <tr className="hover:bg-gray-50" {...props} />,
          code: ({node, className, children, ...props}: any) => {
            const isInline = !className || !className.includes('language-');
            return isInline ? (
              <code className="text-pink-600 bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            ) : (
              <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm" {...props}>
                {children}
              </code>
            );
          },
          pre: ({node, ...props}) => <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-6" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}