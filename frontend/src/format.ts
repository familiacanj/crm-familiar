export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
export const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function brl(v: number) {
  const neg = v < 0;
  const [i, d] = Math.abs(v).toFixed(2).split(".");
  return `${neg ? "-" : ""}R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
}

/** Accepts "1250", "1250,50", "1.250,50", "R$ 1.250,50" */
export function parseMoney(s: string): number | null {
  let c = s.replace(/R\$|\s/g, "");
  if (!c) return null;
  if (c.includes(",")) c = c.replace(/\./g, "").replace(",", ".");
  const n = Number(c);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function toInput(v: number) {
  return v ? v.toFixed(2).replace(".", ",").replace(/,00$/, "") : "";
}
