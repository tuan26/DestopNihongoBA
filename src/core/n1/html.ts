/**
 * Minimal HTML sanitizer for imported question/explanation text.
 * Keeps only formatting tags (no attributes), drops script/style/iframe/img and their content, decodes nothing else.
 * Works without a DOM so it can run in tests and in the importer.
 */
const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'mark', 'span', 'div', 'ol', 'ul', 'li', 'ruby', 'rt', 'rp', 'sub', 'sup', 'small', 'table', 'tr', 'td', 'th', 'tbody', 'thead']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template)[\s\S]*?<\/\1\s*>/gi;

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input).replace(DROP_WITH_CONTENT, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    const closing = m.startsWith('</');
    if (t === 'br') return '<br>';
    return closing ? `</${t}>` : `<${t}>`;
  });
  // stray angle brackets that are not part of an allowed tag
  s = s.replace(/<(?!\/?(?:p|br|b|strong|i|em|u|mark|span|div|ol|ul|li|ruby|rt|rp|sub|sup|small|table|tr|td|th|tbody|thead)>)/gi, '&lt;');
  return s.trim();
}

/** Plain text, for converting multi-line text to HTML-safe paragraphs. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Treat text as HTML if it looks like markup, otherwise escape it and keep line breaks. */
export function toSafeHtml(text: string | null | undefined): string {
  if (!text) return '';
  if (/<\/?[a-z][^>]*>/i.test(text)) return sanitizeHtml(text);
  return escapeHtml(text.replace(/\r\n/g, '\n')).replace(/\n/g, '<br>');
}

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}
