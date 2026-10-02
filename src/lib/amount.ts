/* Amount input engine: live thousand separators, decimal comma, inline arithmetic. */

const OPS = '+-*/';

function groupThousands(intDigits: string): string {
  const clean = intDigits.replace(/^0+(?=\d)/, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Normalises typed characters: × x ÷ : → * / ; drops thousand dots and invalid chars. */
export function sanitizeAmount(raw: string): string {
  return raw
    .replace(/[\u2212\u2013\u2014]/g, '-') // tanda minus tipografis (−, –, —) → '-' agar tidak hilang diam-diam
    .replace(/[×xX]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/\./g, '')
    .replace(/[^0-9,+\-*/()]/g, '');
}

/** Formats a sanitised string: "1250000+25000,5" → "1.250.000 + 25.000,5" (without spaces). */
export function formatAmountString(sanitized: string): string {
  let out = '';
  let token = '';
  const flush = () => {
    if (!token) return;
    const [i, ...rest] = token.split(',');
    const dec = rest.join('').slice(0, 2);
    const hasComma = token.includes(',');
    out += groupThousands(i || (hasComma ? '0' : '')) + (hasComma ? ',' + dec : '');
    token = '';
  };
  for (const ch of sanitized) {
    if (/[0-9,]/.test(ch)) token += ch;
    else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

export function hasOperator(s: string): boolean {
  const t = s.replace(/^-/, '');
  return /[+\-*/()]/.test(t);
}

/** Safe recursive-descent evaluation (no eval). Returns null when invalid. */
export function evaluateAmount(display: string): number | null {
  const src = sanitizeAmount(display).replace(/,/g, '.');
  if (!src) return null;
  let i = 0;
  const peek = () => src[i];
  const num = (): number | null => {
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() === ')') i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      const v = num();
      return v === null ? null : -v;
    }
    let s = '';
    while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
    if (!s || s === '.') return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };
  const term = (): number | null => {
    let v = num();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const r = num();
      if (r === null) return v; // trailing operator: ignore
      v = op === '*' ? v * r : r === 0 ? null : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const r = term();
      if (r === null) return v;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

/** Number → display string for the input ("1.250.000" / "1.250,5"). */
export function amountToDisplay(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return '';
  const neg = n < 0;
  const v = Math.abs(Math.round(n * 100) / 100);
  const [i, d] = v.toFixed(2).split('.');
  const dec = d.replace(/0+$/, '');
  return (neg ? '-' : '') + groupThousands(i) + (dec ? ',' + dec : '');
}

/** Counts meaningful characters (not thousand dots) before caret. */
export function meaningfulCount(s: string, caret: number): number {
  let c = 0;
  for (let k = 0; k < Math.min(caret, s.length); k++) if (s[k] !== '.') c++;
  return c;
}

/** Position in formatted string after `count` meaningful characters. */
export function caretFromCount(s: string, count: number): number {
  if (count <= 0) return 0;
  let c = 0;
  for (let k = 0; k < s.length; k++) {
    if (s[k] !== '.') c++;
    if (c === count) return k + 1;
  }
  return s.length;
}

/**
 * Menormalkan teks nominal yang ditempel ke format Indonesia.
 * "1250000.50" / "1,250,000.50" (format Inggris) → "1250000,50"; "Rp 1.250.000" → "1.250.000".
 * Mengembalikan null bila tidak dikenali (biarkan perilaku tempel bawaan).
 */
export function normalizePasted(raw: string): string | null {
  const t = raw.replace(/\s|rp\.?|idr/gi, '');
  if (!t) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) return t.replace(/,/g, '').replace('.', ',');
  if (/^-?\d+\.\d{1,2}$/.test(t)) return t.replace('.', ',');
  if (/^-?[\d.,+\-*/()×x÷:]+$/i.test(t)) return t;
  return null;
}

export const AMOUNT_OPS = OPS;
