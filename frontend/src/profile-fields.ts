export const FAMILY_RELATIONSHIPS = [
  "Pai", "Mãe", "Filho", "Filha", "Avô", "Avó", "Tio", "Tia", "Primo", "Prima",
  "Cônjuge", "Irmão", "Irmã", "Outros",
] as const;

export function maskBirthDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isRealDate(day: number, month: number, year: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseBrazilianBirthDate(value: string, today = new Date()): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (year < 1900 || !isRealDate(day, month, year)) return null;
  const todayKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  if (year * 10000 + month * 100 + day > todayKey) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

export function formatBirthDate(isoDate?: string | null): string {
  if (!isoDate) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "";
  const [, year, month, day] = match;
  if (!isRealDate(Number(day), Number(month), Number(year))) return "";
  return `${day}/${month}/${year}`;
}

export function ageFromBirthDate(isoDate: string, today = new Date()): number | null {
  const brDate = formatBirthDate(isoDate);
  if (!brDate) return null;
  const parsed = parseBrazilianBirthDate(brDate, today);
  if (!parsed) return null;
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed)!;
  const birthdayNotReached = today.getMonth() + 1 < Number(month)
    || (today.getMonth() + 1 === Number(month) && today.getDate() < Number(day));
  return today.getFullYear() - Number(year) - (birthdayNotReached ? 1 : 0);
}
