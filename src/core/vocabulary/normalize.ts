/** Duplicate-detection key: NFKC, strip all whitespace and common punctuation, lowercase latin. */
export function normalizeKey(japanese: string): string {
  return japanese
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。、．，,.!！?？「」『』()（）［］[\]・〜~]/g, '')
    .toLowerCase();
}

/** Convert katakana to hiragana (used so that searching ニンシキ finds にんしき). */
export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function normalizeSearch(s: string): string {
  return kataToHira(s.normalize('NFKC').trim().toLowerCase());
}

const KANA_RE = /^[぀-ゟ゠-ヿ・ー\s\u3000]+$/;
export const isKana = (s: string) => KANA_RE.test(s);
export const hasKanji = (s: string) => /[一-鿿㐀-䶿々]/.test(s);

/** Remove diacritics from Vietnamese for accent-insensitive matching. */
export function foldVietnamese(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
