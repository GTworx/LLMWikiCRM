import YAML from 'yaml';

export type Data = Record<string, any>;

export function parseDoc(raw: string): { data: Data; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = YAML.parse(m[1]) ?? {};
  return { data: typeof data === 'object' && !Array.isArray(data) ? data : {}, body: m[2].replace(/^\r?\n/, '') };
}

export function stringifyDoc(data: Data, body: string): string {
  const yaml = YAML.stringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${(body || '').trim()}\n`;
}
