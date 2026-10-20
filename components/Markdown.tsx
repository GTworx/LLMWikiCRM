import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Raw HTML in markdown is not rendered (react-markdown default), so ingested content can't inject scripts.
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
