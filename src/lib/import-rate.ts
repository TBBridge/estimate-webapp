/** CSV の仕切り率: 0.65 または 65 / 65% を 0〜1 の小数に */
export function parseMarginRateFromCsv(raw: string): number | null {
  const s = String(raw).replace(/%/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 1) return n / 100;
  return n;
}
