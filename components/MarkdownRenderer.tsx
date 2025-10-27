import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const sanitizedHtml = useMemo(() => {
    const rawHtml = marked.parse(content || '');
    return DOMPurify.sanitize(rawHtml as string);
  }, [content]);

  return (
    <div
      className={`markdown-body ${className || ''} prose dark:prose-invert max-w-none`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default MarkdownRenderer;