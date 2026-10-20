export function money(v: unknown, currency = 'USD') {
  const n = Number(v);
  if (!Number.isFinite(n) || !n) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString('en-US')} ${currency}`;
  }
}

export const shortDate = (v: unknown) => (v ? String(v).slice(0, 10) : '—');

export const label = (s: unknown) => String(s || '').replace(/_/g, ' ');

export function sentimentClass(s: unknown) {
  return s === 'positive' ? 'good' : s === 'negative' ? 'bad' : s === 'mixed' ? 'warn' : '';
}

export function isOverdue(due?: string) {
  return !!due && due < new Date().toISOString().slice(0, 10);
}
