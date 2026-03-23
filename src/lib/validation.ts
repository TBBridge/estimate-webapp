/** 一般的なメール形式チェック（RFC 準拠の簡易版） */
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isValidEmail(value: string): boolean {
  const s = value.trim();
  if (!s) return true; // 空は必須チェック側で扱う
  if (s.length > 254) return false;
  return EMAIL_RE.test(s);
}
