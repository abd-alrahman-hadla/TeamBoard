'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/** Element styles for card descriptions (no typography plugin needed). */
const COMPONENTS: Components = {
  h1: ({ node: _node, ...props }) => (
    <h3 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />
  ),
  h2: ({ node: _node, ...props }) => <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  h3: ({ node: _node, ...props }) => <h5 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  p: ({ node: _node, ...props }) => <p className="my-1.5 leading-relaxed" {...props} />,
  ul: ({ node: _node, className, ...props }) => (
    <ul
      className={cn('my-1.5 list-disc pl-5', className?.includes('contains-task-list') && 'list-none pl-1')}
      {...props}
    />
  ),
  ol: ({ node: _node, ...props }) => <ol className="my-1.5 list-decimal pl-5" {...props} />,
  li: ({ node: _node, ...props }) => <li className="my-0.5 [&>input]:mr-1.5" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      className="text-primary underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  code: ({ node: _node, ...props }) => (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]" {...props} />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="bg-muted my-2 overflow-x-auto rounded-md p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="text-muted-foreground my-2 border-l-2 pl-3" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th className="border px-2 py-1 text-left font-semibold" {...props} />,
  td: ({ node: _node, ...props }) => <td className="border px-2 py-1" {...props} />,
  hr: () => <hr className="my-3" />,
};

/**
 * Renders card markdown (GitHub flavoured). react-markdown never renders raw HTML, so user
 * content can't inject markup or scripts; links open in a new tab without an opener.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('text-sm break-words', className)} data-testid="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
