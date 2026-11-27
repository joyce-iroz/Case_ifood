// Números digitados no formato brasileiro. Puro; roda no navegador e no servidor.

const MILHAR = /^\d{1,3}(\.\d{3})+$/; // "2.000", "1.234.567"
const INTEIRO_OU_MILHAR = /^(\d+|\d{1,3}(\.\d{3})+)$/;

/**
 * "1200" → 1200 · "2.000" → 2000 · "2.400,00" → 2400 · "120,50" → 120.5 · "120.50" → 120.5.
 * Com vírgula: pontos são milhar (em grupos de três) e a vírgula é decimal.
 * Sem vírgula: pontos agrupados de três em três são milhar; um ponto seguido de
 * 1, 2 ou 4+ dígitos é decimal. Qualquer outra coisa devolve NaN, nunca um palpite.
 */
export function lerNumeroBR(entrada: string): number {
  const s = String(entrada ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (!s) return NaN;
  if (s.includes(",")) {
    const partes = s.split(",");
    if (partes.length !== 2) return NaN;
    const [int, dec] = partes;
    if (!INTEIRO_OU_MILHAR.test(int) || !/^\d*$/.test(dec)) return NaN;
    return Number(`${int.replace(/\./g, "")}.${dec || "0"}`);
  }
  if (MILHAR.test(s)) return Number(s.replace(/\./g, ""));
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return NaN;
}

/** 2400 → "2.400,00" (casas fixas) ou 20 → "20" (casas: [0, 2]). */
export function formatarNumeroBR(n: number, casas: number | [number, number] = 2): string {
  if (!Number.isFinite(n)) return "";
  const [min, max] = typeof casas === "number" ? [casas, casas] : casas;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
}

/** Para o servidor: aceita número JSON ou texto no formato brasileiro; null e lixo viram NaN. */
export function lerCampoNumero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "string") return lerNumeroBR(v);
  return NaN;
}
