import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'LLM Wiki CRM', description: 'AI-first CRM backed by a markdown wiki' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
