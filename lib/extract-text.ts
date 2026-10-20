import fs from 'node:fs/promises';
import path from 'node:path';

export interface Extracted {
  text: string;
  date?: string; // ISO, when the source carries one (e.g. email Date header)
  kindHint?: 'email' | 'call' | 'meeting' | 'document' | 'note';
}

export const SUPPORTED = ['.txt', '.md', '.csv', '.json', '.log', '.eml', '.pdf', '.docx', '.vtt', '.srt', '.html', '.htm'];
const MAX_CHARS = 60_000;

function clip(s: string) {
  s = s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length <= MAX_CHARS) return s;
  const half = MAX_CHARS / 2;
  return `${s.slice(0, half)}\n\n[... ${s.length - MAX_CHARS} characters omitted ...]\n\n${s.slice(-half)}`;
}

const stripHtml = (h: string) =>
  h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

export async function extractText(file: string): Promise<Extracted> {
  const ext = path.extname(file).toLowerCase();
  const buf = await fs.readFile(file);
  switch (ext) {
    case '.txt':
    case '.md':
    case '.csv':
    case '.json':
    case '.log':
      return { text: clip(buf.toString('utf8')) };
    case '.html':
    case '.htm':
      return { text: clip(stripHtml(buf.toString('utf8'))), kindHint: 'document' };
    case '.vtt':
    case '.srt':
      return {
        text: clip(
          buf
            .toString('utf8')
            .split('\n')
            .filter((l) => !/^\s*(\d+|WEBVTT.*|NOTE.*|[\d:.,]+\s*-->\s*[\d:.,]+.*)\s*$/.test(l))
            .join('\n'),
        ),
        kindHint: 'meeting',
      };
    case '.eml': {
      const { simpleParser } = await import('mailparser');
      const m = await simpleParser(buf);
      const addr = (a: any) => (Array.isArray(a) ? a.map((x) => x.text).join(', ') : a?.text || '');
      const header = [`From: ${addr(m.from)}`, `To: ${addr(m.to)}`, m.cc ? `Cc: ${addr(m.cc)}` : '', `Date: ${m.date?.toISOString() || ''}`, `Subject: ${m.subject || ''}`]
        .filter(Boolean)
        .join('\n');
      const body = m.text || (m.html ? stripHtml(m.html) : '');
      const att = m.attachments?.length ? `\n\nAttachments: ${m.attachments.map((a) => a.filename).join(', ')}` : '';
      return { text: clip(`${header}\n\n${body}${att}`), date: m.date?.toISOString(), kindHint: 'email' };
    }
    case '.pdf': {
      const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await pdfText(pdf, { mergePages: true });
      return { text: clip(String(text)), kindHint: 'document' };
    }
    case '.docx': {
      const mammoth = await import('mammoth');
      const { value } = await (mammoth.default || mammoth).extractRawText({ buffer: buf });
      return { text: clip(value), kindHint: 'document' };
    }
    default:
      throw new Error(`Unsupported file type "${ext}". Supported: ${SUPPORTED.join(' ')}`);
  }
}
