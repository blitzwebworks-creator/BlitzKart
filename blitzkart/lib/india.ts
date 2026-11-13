export const NEW_DELHI_CITY = "New Delhi";
export const DELHI_STATE = "Delhi";

export function isNewDelhiCity(value: string) {
  return /^(new\s+delhi|delhi)$/i.test(value.trim());
}

export function isDelhiState(value: string) {
  return /^(delhi|nct\s+of\s+delhi|national\s+capital\s+territory\s+of\s+delhi)$/i.test(value.trim());
}

export function normalizeIndianMobile(value: string) {
  const cleaned = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/\D/g, "");
  const national = digits.length === 10
    ? digits
    : digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : "";
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}
