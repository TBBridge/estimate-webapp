export const LOGIN_ID_MAX_LENGTH = 100;

export function normalizeLoginId(value: unknown): string {
  return String(value ?? "").trim();
}

export function isValidLoginId(value: unknown): boolean {
  const loginId = normalizeLoginId(value);
  return loginId.length > 0 && loginId.length <= LOGIN_ID_MAX_LENGTH && /^[!-~]+$/.test(loginId);
}
