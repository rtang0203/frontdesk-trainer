/** Mask a phone number to its last four digits, e.g. "•••• 1947". Null stays null. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.startsWith("••••")) return phone;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

/** Normalize a US number to E.164 (+1 and 10 digits), or null if it isn't one. */
export function normalizeUsPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && !digits.startsWith("1")) return null;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  // NANP: area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

/** "+14155550123" -> "(415) 555-0123" */
export function formatUsPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
