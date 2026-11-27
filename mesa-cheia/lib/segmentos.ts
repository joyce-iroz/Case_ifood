// Segmentos de clientes em relação a uma janela (dia da semana + faixa de horas).
// Aritmética sobre o histórico de visitas. Puro.
import { diaDaSemana, somarDias } from "./dominio";

export const SEGMENTOS = [
  { id: "frequenta_janela", rotulo: "Já vem nesse horário" },
  { id: "frequenta_outras", rotulo: "Vem, mas em outros horários" },
  { id: "delivery_nunca_veio", rotulo: "Pede delivery e nunca veio ao salão" },
  { id: "sumiu_60_dias", rotulo: "Não aparece há mais de 60 dias" },
  { id: "cozinha_similar", rotulo: "Pede a mesma cozinha em outros restaurantes da região" },
] as const;

export type Segmento = (typeof SEGMENTOS)[number]["id"];
export const ehSegmento = (x: unknown): x is Segmento => SEGMENTOS.some((s) => s.id === x);
export const rotuloSegmento = (s: Segmento) => SEGMENTOS.find((x) => x.id === s)!.rotulo;

/** Janela de campanha em horas, meia hora como ,5: inicio=18.5, fim=20 é 18h30–20h. */
export type Janela = { dia: number; inicio: number; fim: number };

export type VisitaCliente = { data: string; hora: number };

/** delivery: pede deste restaurante · salao: já sentou aqui · regiao: cliente iFood de outros restaurantes. */
export type Origem = "delivery" | "salao" | "regiao";

/** Segmentos cujos clientes o restaurante só vê em número: o dado é da plataforma. */
export const segmentoAnonimo = (s: Segmento) => s === "cozinha_similar";

export const DIAS_RECENTES = 60;

const recente = (v: VisitaCliente, hoje: string) => v.data >= somarDias(hoje, -DIAS_RECENTES) && v.data <= hoje;
// Visita registrada na hora cheia h ocupa h até h+1; conta se essa hora encosta na janela.
const naJanela = (v: VisitaCliente, j: Janela) => diaDaSemana(v.data) === j.dia && v.hora + 1 > j.inicio && v.hora < j.fim;

/**
 * O cliente teve visita nos últimos 60 dias naquele dia da semana e faixa de hora?
 * É a mesma pergunta do segmento "frequenta_janela" e do campo `incremental` (negado).
 */
export function visitouNaJanela(visitas: VisitaCliente[], janela: Janela, hoje: string): boolean {
  return visitas.some((v) => recente(v, hoje) && naJanela(v, janela));
}

/** Segmento do cliente para a janela. Os quatro segmentos não se sobrepõem. */
export function classificarCliente(
  origem: Origem,
  visitas: VisitaCliente[],
  janela: Janela,
  hoje: string,
): Segmento | null {
  if (visitouNaJanela(visitas, janela, hoje)) return "frequenta_janela";
  if (visitas.some((v) => recente(v, hoje))) return "frequenta_outras";
  if (visitas.length > 0) return "sumiu_60_dias";
  if (origem === "delivery") return "delivery_nunca_veio";
  // Cliente iFood que pede a mesma cozinha em outros restaurantes perto e nunca veio aqui.
  // O critério (2+ pedidos em 60 dias, até 3 km) é aplicado na origem do dado.
  if (origem === "regiao") return "cozinha_similar";
  return null;
}
