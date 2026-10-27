// Local date / number helpers. All dates use the device's local time so that
// "hoje" and "este mês" match what the driver sees on their phone.

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISODate(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, day || 1);
}

// Shift a "yyyy-mm-dd" date by N days (delta can be negative).
export function shiftDay(iso: string, delta: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function formatTimeHM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function timeStringToDate(t: string): Date {
  const d = new Date();
  const [h, m] = (t || "00:00").split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

// yyyy-mm
export function monthKey(iso: string): string {
  const [y, m] = iso.split("-");
  return `${y}-${m}`;
}

// yyyy-mm -> MM/AA
export function formatMonthLabel(mk: string): string {
  const [y, m] = mk.split("-");
  return `${m}/${y.slice(2)}`;
}

export function currentMonthKey(): string {
  return monthKey(todayISODate());
}

// Shift a "yyyy-mm" key by N months (delta can be negative).
export function shiftMonth(mk: string, delta: number): string {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// 12345 -> "12.345" (pt-BR thousands separator)
export function formatInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// 123.5 -> "123,5" (up to 2 decimals, pt-BR comma, trims trailing zeros)
export function formatDecimal(n: number): string {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return rounded.toString().replace(".", ",");
}

// Parse a user-typed number that may use comma as decimal separator.
export function parseNumberInput(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? NaN : n;
}

// 1234.5 -> "1.234,50" (pt-BR / EU money formatting, 2 decimals)
export function formatMoney(n: number): string {
  const fixed = (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  const [intPart, dec] = fixed.split(".");
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intFmt},${dec}`;
}

// ---------------------------------------------------------------------------
// App currency (display only) — chosen per user, no automatic conversion.
// ---------------------------------------------------------------------------
export const APP_CURRENCIES = [
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "BRL", symbol: "R$", label: "Real Brasileiro (R$)" },
  { code: "USD", symbol: "US$", label: "Dólar Americano (US$)" },
  { code: "GBP", symbol: "£", label: "Libra Esterlina (£)" },
  { code: "CHF", symbol: "CHF", label: "Franco Suíço (CHF)" },
] as const;

export function currencySymbolFor(code?: string): string {
  const found = APP_CURRENCIES.find((c) => c.code === code);
  return found ? found.symbol : "€";
}

// Module-level symbol updated by AuthContext when the user's setting loads.
let appCurrencySymbol = "€";
export function setAppCurrencySymbol(code?: string): void {
  appCurrencySymbol = currencySymbolFor(code);
}
export function getAppCurrencySymbol(): string {
  return appCurrencySymbol;
}
// Format a monetary value prefixed with the app currency symbol.
export function money(n: number): string {
  return `${appCurrencySymbol} ${formatMoney(n)}`;
}


// Progressively mask user typing into HH:mm.
export function maskTimeInput(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 4);
  let out = d.slice(0, 2);
  if (d.length > 2) out += ":" + d.slice(2, 4);
  return out;
}

// Parse a full HH:mm string to a Date (today's date), or null if invalid.
export function parseTimeInput(s: string): Date | null {
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const d = new Date();
  d.setHours(h, mi, 0, 0);
  return d;
}

// dd/MM/yy from a Date (for manual date typing fields)
export function formatDateInput(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

// Progressively mask user typing into dd/MM/yy.
export function maskDateInput(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 6);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "/" + d.slice(2, 4);
  if (d.length > 4) out += "/" + d.slice(4, 6);
  return out;
}

// Parse a full dd/MM/yy string to a Date (2-digit year -> 20xx), or null.
export function parseDateInput(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = Number(m[2]);
  const year = 2000 + Number(m[3]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(year, mon - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== mon - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
}

// dd/MM/yyyy from a Date (4-digit year, for birth-date style fields)
export function formatDateInput4(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Progressively mask user typing into dd/MM/yyyy.
export function maskDateInput4(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "/" + d.slice(2, 4);
  if (d.length > 4) out += "/" + d.slice(4, 8);
  return out;
}

// Parse a full dd/MM/yyyy string to a Date (year from 1900), or null.
export function parseDateInput4(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || mon < 1 || mon > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(year, mon - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== mon - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
}
