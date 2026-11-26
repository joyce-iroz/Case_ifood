// Segmentos de clientes em relação a uma janela (dia da semana + faixa de horas).
// Aritmética sobre o histórico de visitas. Puro.
import { diaDaSemana, somarDias } from "./dominio";

export const SEGMENTOS = [
  { id: "frequenta_janela", rotulo: "Já vem nesse horário" },
  { id: "frequenta_outras", rotulo: "Vem, mas em outros horários" },
  { id: "delivery_nunca_veio", rotulo: "Pede delivery e nunca veio ao salão" },
  { id: "sumiu_60_dias", rotulo: "Não aparece há mais de 60 dias" },
] as const;

export type Segmento = (typeof SEGMENTOS)[number]["id"];
export const ehSegmento = (x: unknown): x is Segmento => SEGMENTOS.some((s) => s.id === x);
export const rotuloSegmento = (s: Segmento) => SEGMENTOS.find((x) => x.id === s)!.rotulo;

/** Janela de campanha em horas cheias: inicio=18, fim=23 cobre 18h00 até 22h59. */
export type Janela = { dia: number; inicio: number; fim: number };

export type VisitaCliente = { data: string; hora: number };

export const DIAS_RECENTES = 60;

const recente = (v: VisitaCliente, hoje: string) => v.data >= somarDias(hoje, -DIAS_RECENTES) && v.data <= hoje;
const naJanela = (v: VisitaCliente, j: Janela) => diaDaSemana(v.data) === j.dia && v.hora >= j.inicio && v.hora < j.fim;

/**
 * O cliente teve visita nos últimos 60 dias naquele dia da semana e faixa de hora?
 * É a mesma pergunta do segmento "frequenta_janela" e do campo `incremental` (negado).
 */
export function visitouNaJanela(visitas: VisitaCliente[], janela: Janela, hoje: string): boolean {
  return visitas.some((v) => recente(v, hoje) && naJanela(v, janela));
}

/** Segmento do cliente para a janela. Os quatro segmentos não se sobrepõem. */
export function classificarCliente(
  origem: "delivery" | "salao",
  visitas: VisitaCliente[],
  janela: Janela,
  hoje: string,
): Segmento | null {
  if (visitouNaJanela(visitas, janela, hoje)) return "frequenta_janela";
  if (visitas.some((v) => recente(v, hoje))) return "frequenta_outras";
  if (visitas.length > 0) return "sumiu_60_dias";
  if (origem === "delivery") return "delivery_nunca_veio";
  return null;
}
