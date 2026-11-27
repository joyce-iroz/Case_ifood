// Projeção de retorno de uma campanha antes de aprovar. Aritmética sobre o histórico
// de campanhas encerradas do restaurante; sem histórico suficiente, valores padrão
// declarados aqui. Nunca um modelo. Puro.
import type { TipoBeneficio } from "./campanha";
import { SEGMENTOS, type Segmento } from "./segmentos";

/** Sem histórico: 8% dos benefícios viram resgate. */
export const TAXA_RESGATE_PADRAO = 0.08;
/** Mínimos para confiar no histórico de um segmento. */
const MIN_EMITIDOS = 20;
const MIN_RESGATES = 3;

/**
 * Sem histórico, a fração de resgates incrementais segue a definição do segmento:
 * quem já vem na janela nunca é incremental; os outros segmentos são, por construção,
 * clientes sem visita naquela janela nos últimos 60 dias.
 */
const incrementalPadrao = (s: Segmento) => (s === "frequenta_janela" ? 0 : 1);

export type Taxa = { resgate: number; incremental: number; base: "historico" | "padrao"; emitidos: number };
export type Taxas = Record<Segmento, Taxa>;

export function calcularTaxas(
  encerradas: { segmento: Segmento; emitidos: number; resgates: number; incrementais: number }[],
): Taxas {
  const t = {} as Taxas;
  for (const { id } of SEGMENTOS) {
    const cs = encerradas.filter((c) => c.segmento === id);
    const emitidos = cs.reduce((a, c) => a + c.emitidos, 0);
    const resgates = cs.reduce((a, c) => a + c.resgates, 0);
    const inc = cs.reduce((a, c) => a + c.incrementais, 0);
    const temHistorico = emitidos >= MIN_EMITIDOS;
    t[id] = {
      resgate: temHistorico ? resgates / emitidos : TAXA_RESGATE_PADRAO,
      incremental: resgates >= MIN_RESGATES ? inc / resgates : incrementalPadrao(id),
      base: temHistorico ? "historico" : "padrao",
      emitidos,
    };
  }
  return t;
}

export type Projecao = {
  emitidos: number;
  resgates: number;
  incrementais: number;
  descontoMedio: number;
  custo: number;
  receitaIncremental: number;
  custoPorIncremental: number | null;
  base: Taxa["base"];
  taxaResgate: number;
  taxaIncremental: number;
  semanas: number;
  taxaBase: number; // taxa de resgate de uma semana, antes da premissa das semanas extras
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Desconto típico por resgate: o benefício aplicado a uma conta do tamanho do ticket médio. */
export function descontoTipico(tipo: TipoBeneficio, valor: number, ticket: number, descontoMaxPct: number) {
  const limite = (ticket * descontoMaxPct) / 100;
  return r2(Math.min(tipo === "percentual" ? (ticket * valor) / 100 : valor, limite));
}

export function projetar(p: {
  emitidos: number;
  semanas: number;
  tipo: TipoBeneficio;
  valor: number;
  teto: number;
  ticketMedio: number;
  descontoMax: number;
  taxa: Taxa;
}): Projecao {
  // Um benefício só pode ser resgatado uma vez, então mais semanas não multiplicam resgates;
  // dão mais chances. Premissa: cada semana extra soma metade da taxa da primeira, até dobrar.
  const fatorSemanas = Math.min(2, 1 + 0.5 * (p.semanas - 1));
  const taxaResgate = Math.min(1, p.taxa.resgate * fatorSemanas);
  const resgates = Math.round(p.emitidos * taxaResgate);
  const incrementais = Math.round(resgates * p.taxa.incremental);
  const descontoMedio = descontoTipico(p.tipo, p.valor, p.ticketMedio, p.descontoMax);
  const custo = r2(Math.min(p.teto, resgates * descontoMedio));
  // Receita nova = contas dos incrementais menos o desconto dado a eles.
  const custoUnit = resgates ? custo / resgates : 0;
  const receitaIncremental = r2(incrementais * (p.ticketMedio - custoUnit));
  return {
    emitidos: p.emitidos,
    resgates,
    incrementais,
    descontoMedio,
    custo,
    receitaIncremental,
    custoPorIncremental: incrementais ? r2(custo / incrementais) : null,
    base: p.taxa.base,
    taxaResgate,
    taxaIncremental: p.taxa.incremental,
    semanas: p.semanas,
    taxaBase: p.taxa.resgate,
  };
}
