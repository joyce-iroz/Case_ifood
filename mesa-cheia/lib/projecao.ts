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

/**
 * Sem histórico, a taxa padrão vale para um desconto de 10% do ticket médio.
 * Com histórico, vale para o desconto típico que aquelas campanhas deram.
 */
export const DESCONTO_REF_PADRAO_PCT = 10;
/**
 * Premissa de sensibilidade ao desconto: a taxa de resgate muda com a raiz da razão
 * entre o desconto proposto e o de referência. O dobro do desconto traz ~41% mais
 * resgates, metade traz ~29% menos. Conservadora de propósito; limitada entre metade
 * e o dobro da taxa de referência.
 */
export const ELASTICIDADE = 0.5;
/**
 * Premissa de duração: janela mais longa cabe na rotina de mais gente. A taxa acompanha
 * a raiz da razão entre a duração proposta e a de referência (a das campanhas do
 * histórico, ou 2h sem histórico), limitada entre metade e 1,5 vez.
 */
export const HORAS_REF_PADRAO = 2;

export type Taxa = {
  resgate: number;
  incremental: number;
  base: "historico" | "padrao";
  emitidos: number;
  descontoRef: number | null; // R$ por conta de ticket médio no histórico; null = padrão
  horasRef: number | null;    // duração média das janelas do histórico; null = padrão
};
export type Taxas = Record<Segmento, Taxa>;

export function calcularTaxas(
  encerradas: { segmento: Segmento; emitidos: number; resgates: number; incrementais: number; descontoTipico: number; horas: number }[],
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
      // Desconto de referência: média dos descontos típicos, pesada pelos emitidos.
      descontoRef: temHistorico ? r2(cs.reduce((a, c) => a + c.descontoTipico * c.emitidos, 0) / emitidos) : null,
      horasRef: temHistorico ? r2(cs.reduce((a, c) => a + c.horas * c.emitidos, 0) / emitidos) : null,
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
  taxaBase: number; // taxa de resgate de uma semana, já ajustada pelo desconto
  taxaReferencia: number; // taxa do histórico (ou padrão), no desconto e duração de referência
  descontoRef: number; // R$ por conta a que a taxa de referência corresponde
  horas: number; // duração da janela proposta
  horasRef: number; // duração a que a taxa de referência corresponde
  fatorDesconto: number;
  fatorDuracao: number;
  demanda: number; // resgates esperados se o teto não acabasse
  cabeNoTeto: number; // quantas vagas o teto paga
  valorVaga: number; // R$ que cada vaga separa do teto
  limitadoPeloTeto: boolean;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Desconto típico por resgate: o benefício aplicado a uma conta do tamanho do ticket médio. */
export function descontoTipico(
  tipo: TipoBeneficio,
  valor: number,
  ticket: number,
  descontoMaxPct: number,
  limitePorConta: number | null = null,
) {
  const limite = (ticket * descontoMaxPct) / 100;
  const nominal = tipo === "percentual" ? Math.min((ticket * valor) / 100, limitePorConta ?? Infinity) : valor;
  return r2(Math.min(nominal, limite));
}

/**
 * Quanto do teto uma vaga separa. É o desconto máximo que uma mesa pode levar, para a
 * vaga garantida nunca falhar: valor fixo = o valor; % com limite por conta = o limite.
 * % sem limite não tem máximo: separa o desconto numa conta de ticket médio, e uma conta
 * grande pode passar disso (por isso a tela sugere o limite).
 */
export function valorDaVaga(
  c: { tipo: TipoBeneficio; valor: number; limite_por_conta?: number | null },
  ticket: number,
  descontoMaxPct: number,
): number {
  if (c.tipo === "valor_fixo") return r2(c.valor);
  if (c.limite_por_conta) return r2(c.limite_por_conta);
  return descontoTipico(c.tipo, c.valor, ticket, descontoMaxPct);
}

/** Vagas do teto: total, livres (sem contar as garantidas) e quantas foram usadas. */
export function vagasDoTeto(teto: number, gasto: number, garantidas: number, vaga: number) {
  if (!(vaga > 0)) return { total: 0, livres: 0 };
  const total = Math.floor(teto / vaga + 1e-9);
  const livres = Math.max(0, Math.floor((teto - gasto - garantidas * vaga) / vaga + 1e-9));
  return { total, livres };
}

export function projetar(p: {
  emitidos: number;
  horas: number; // duração da janela (fim − início)
  semanas: number;
  tipo: TipoBeneficio;
  valor: number;
  limite?: number | null; // limite por conta (só %)
  teto: number;
  ticketMedio: number;
  descontoMax: number;
  taxa: Taxa;
}): Projecao {
  // Um benefício só pode ser resgatado uma vez, então mais semanas não multiplicam resgates;
  // dão mais chances. Premissa: cada semana extra soma metade da taxa da primeira, até dobrar.
  const descontoMedio = descontoTipico(p.tipo, p.valor, p.ticketMedio, p.descontoMax, p.limite ?? null);
  // Vagas do teto: o mesmo valor que o salão separa por mesa (lib/vagas.ts).
  const vaga = valorDaVaga({ tipo: p.tipo, valor: p.valor, limite_por_conta: p.limite ?? null }, p.ticketMedio, p.descontoMax);
  const descontoRef = p.taxa.descontoRef ?? r2((p.ticketMedio * DESCONTO_REF_PADRAO_PCT) / 100);
  const fatorDesconto =
    descontoRef > 0 && descontoMedio > 0 ? Math.min(2, Math.max(0.5, (descontoMedio / descontoRef) ** ELASTICIDADE)) : 1;
  const horasRef = p.taxa.horasRef ?? HORAS_REF_PADRAO;
  const fatorDuracao = p.horas > 0 && horasRef > 0 ? Math.min(1.5, Math.max(0.5, (p.horas / horasRef) ** 0.5)) : 1;
  const taxaBase = Math.min(1, p.taxa.resgate * fatorDesconto * fatorDuracao);
  const fatorSemanas = Math.min(2, 1 + 0.5 * (p.semanas - 1));
  const taxaResgate = Math.min(1, taxaBase * fatorSemanas);
  const demanda = Math.round(p.emitidos * taxaResgate);
  // O teto acaba: depois dele o salão aplica desconto zero, então ninguém mais resgata.
  const cabeNoTeto = vaga > 0 ? Math.floor(p.teto / vaga + 1e-9) : demanda;
  const resgates = Math.min(demanda, cabeNoTeto);
  const incrementais = Math.round(resgates * p.taxa.incremental);
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
    taxaBase,
    taxaReferencia: p.taxa.resgate,
    descontoRef,
    horas: p.horas,
    horasRef,
    fatorDesconto,
    fatorDuracao,
    demanda,
    cabeNoTeto,
    valorVaga: vaga,
    limitadoPeloTeto: demanda > cabeNoTeto,
  };
}

/**
 * O teto acabou quando o que sobra não paga um desconto inteiro numa conta de ticket
 * médio. Parar aí evita o pior caso: cliente que recebeu a oferta chega e o salão aplica
 * R$ 0 (ou meio desconto). Mesma conta de `cabeNoTeto` na projeção.
 */
export function tetoEsgotado(teto: number, gasto: number, descontoTipicoValor: number): boolean {
  return teto - gasto < Math.max(0.01, descontoTipicoValor) - 0.005;
}
