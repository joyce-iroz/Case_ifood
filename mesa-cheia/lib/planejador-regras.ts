// Planejador: tudo o que é número ou regra fica aqui, em código. Puro.
// O modelo recebe um cardápio já calculado e só escolhe itens dele; a resposta
// volta para `validarSaida`, e depois ainda passa por `avaliarProposta`.
import { limiteValorFixo, type PropostaCampanha, type Regras } from "./campanha";
import { formatarHora, type Restaurante } from "./dominio";
import type { JanelaCandidata } from "./janelas";
import { SEGMENTOS, ehSegmento, type Segmento } from "./segmentos";

export const MAX_TENTATIVAS = 3;
export const JANELAS_NO_CARDAPIO = 12;
export const VALOR_FALLBACK = 10; // % na regra fixa

export const DIAS_TEXTO = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
const TIPOS_SAIDA = { desconto_percentual: "percentual", desconto_valor: "valor_fixo" } as const;
type TipoSaida = keyof typeof TIPOS_SAIDA;

/** 18.5 → "18:30" */
export const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
/** "18:30" → 18.5; só hora cheia ou meia hora. */
export function lerHHMM(s: unknown): number | null {
  const m = typeof s === "string" ? s.trim().match(/^(\d{1,2}):(00|30)$/) : null;
  return m ? Number(m[1]) + (m[2] === "30" ? 0.5 : 0) : null;
}

/** Valores de desconto permitidos, calculados das regras. */
export function opcoesValor(regras: Regras, r: Restaurante) {
  const max = regras.desconto_max;
  const pct = [5, 10, 15, 20, 25, 30, 40, 50].filter((v) => v <= max);
  if (max > 0 && !pct.includes(max) && max < 50) pct.push(max);
  const limite = limiteValorFixo(regras, r);
  const fixo = [5, 10, 15, 20, 25, 30].filter((v) => v <= limite);
  return { desconto_percentual: pct.sort((a, b) => a - b), desconto_valor: fixo };
}

/** Tetos de campanha permitidos: degraus fixos que cabem no saldo do mês. */
export function opcoesTeto(saldo: number): number[] {
  const degraus = [50, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000];
  const cabem = degraus.filter((v) => v <= saldo);
  return cabem.length ? cabem : saldo >= 1 ? [Math.floor(saldo)] : [];
}

export type JanelaCardapio = {
  dia_semana: (typeof DIAS_TEXTO)[number];
  hora_inicio: string;
  hora_fim: string;
  ocupacao_media_pct: number;
  cadeiras_hora_vazias: number;
  validade: string;
  saldo_teto_mes: number;
  custos_maximos_permitidos: number[];
  segmentos: Record<Segmento, { elegiveis: number }>;
};

export type Cardapio = {
  restaurante: { nome: string; capacidade: number; ticket_medio: number };
  regras: Regras;
  segmentos_descricao: Record<Segmento, string>;
  valores_permitidos: { desconto_percentual: number[]; desconto_valor: number[] };
  janelas_candidatas: JanelaCardapio[];
};

export function montarCardapio(
  r: Restaurante,
  regras: Regras,
  janelas: { candidata: JanelaCandidata; elegiveis: Record<Segmento, number>; saldo: number; validade: string }[],
): Cardapio {
  return {
    restaurante: { nome: r.nome, capacidade: r.capacidade, ticket_medio: r.ticket_medio },
    regras,
    segmentos_descricao: Object.fromEntries(SEGMENTOS.map((s) => [s.id, s.rotulo])) as Record<Segmento, string>,
    valores_permitidos: opcoesValor(regras, r),
    janelas_candidatas: janelas.map(({ candidata: c, elegiveis, saldo, validade }) => ({
      dia_semana: DIAS_TEXTO[c.dia],
      hora_inicio: hhmm(c.inicio),
      hora_fim: hhmm(c.fim),
      ocupacao_media_pct: c.ocupacaoMedia,
      cadeiras_hora_vazias: c.cadeirasVazias,
      validade,
      saldo_teto_mes: saldo,
      custos_maximos_permitidos: opcoesTeto(saldo),
      segmentos: Object.fromEntries(SEGMENTOS.map((s) => [s.id, { elegiveis: elegiveis[s.id] }])) as Record<
        Segmento,
        { elegiveis: number }
      >,
    })),
  };
}

export type SaidaModelo = {
  dia_semana: string;
  hora_inicio: string;
  hora_fim: string;
  segmento: Segmento;
  tipo: TipoSaida;
  valor: number;
  clientes_alvo: number;
  custo_maximo: number;
  justificativa: string;
};

export type Validacao =
  | { ok: true; saida: SaidaModelo; proposta: PropostaCampanha; janela: JanelaCardapio }
  | { ok: false; erros: string[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Tira cercas de código e lê o JSON. */
export function lerJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(limpo);
}

/**
 * Confere a resposta do modelo contra o cardápio. Cada erro vira uma frase que
 * volta ao modelo na próxima tentativa e fica no registro de auditoria.
 */
export function validarSaida(texto: string, cardapio: Cardapio): Validacao {
  let bruto: unknown;
  try {
    bruto = lerJson(texto);
  } catch {
    return { ok: false, erros: ["a resposta não é um JSON válido"] };
  }
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto))
    return { ok: false, erros: ["a resposta precisa ser um objeto JSON"] };
  const o = bruto as Record<string, unknown>;
  const erros: string[] = [];

  const chaves = ["dia_semana", "hora_inicio", "hora_fim", "segmento", "tipo", "valor", "clientes_alvo", "custo_maximo", "justificativa"];
  const faltam = chaves.filter((k) => !(k in o));
  if (faltam.length) return { ok: false, erros: [`faltam as chaves: ${faltam.join(", ")}`] };

  const dia = DIAS_TEXTO.indexOf(semAcento(String(o.dia_semana)) as (typeof DIAS_TEXTO)[number]);
  const inicio = lerHHMM(o.hora_inicio);
  const fim = lerHHMM(o.hora_fim);
  if (dia < 0) erros.push(`dia_semana "${o.dia_semana}" inválido; use ${DIAS_TEXTO.join(", ")}`);
  if (inicio === null || fim === null) erros.push("hora_inicio e hora_fim precisam ser HH:MM em hora cheia ou meia hora");

  const janela = cardapio.janelas_candidatas.find(
    (j) => j.dia_semana === DIAS_TEXTO[dia] && lerHHMM(j.hora_inicio) === inicio && lerHHMM(j.hora_fim) === fim,
  );
  if (dia >= 0 && inicio !== null && fim !== null && !janela)
    erros.push(
      `a janela ${o.dia_semana} ${o.hora_inicio}–${o.hora_fim} não está na lista de janelas_candidatas; copie dia e horas de uma delas`,
    );

  const segmento = o.segmento;
  const alvo = Number(o.clientes_alvo);
  if (!ehSegmento(segmento)) {
    erros.push(`segmento "${String(segmento)}" não existe; use ${SEGMENTOS.map((s) => s.id).join(", ")}`);
  } else if (janela) {
    const disponiveis = janela.segmentos[segmento].elegiveis;
    if (disponiveis === 0) erros.push(`o segmento ${segmento} não tem clientes elegíveis nessa janela`);
    else if (!Number.isInteger(alvo) || alvo <= 0) erros.push("clientes_alvo precisa ser um inteiro positivo");
    else if (alvo > disponiveis)
      erros.push(`clientes_alvo ${alvo} é maior que os ${disponiveis} elegíveis de ${segmento} nessa janela`);
  }

  const tipo = o.tipo as TipoSaida;
  const valor = Number(o.valor);
  if (!(tipo in TIPOS_SAIDA)) {
    erros.push(`tipo "${String(o.tipo)}" inválido; use desconto_percentual ou desconto_valor`);
  } else if (!Number.isFinite(valor)) {
    erros.push("valor precisa ser número");
  } else {
    const max = cardapio.regras.desconto_max;
    if (tipo === "desconto_percentual" && valor > max)
      erros.push(`valor ${valor}% está acima do desconto_max de ${max}%`);
    const lista = cardapio.valores_permitidos[tipo];
    if (!lista.includes(valor))
      erros.push(`valor ${valor} não está em valores_permitidos.${tipo} (${lista.join(", ") || "lista vazia"})`);
  }

  const custo = Number(o.custo_maximo);
  if (!Number.isFinite(custo)) erros.push("custo_maximo precisa ser número");
  else if (janela) {
    if (custo > janela.saldo_teto_mes)
      erros.push(`custo_maximo ${custo} passa do saldo do teto do mês (${janela.saldo_teto_mes})`);
    if (!janela.custos_maximos_permitidos.includes(custo))
      erros.push(`custo_maximo ${custo} não está em custos_maximos_permitidos (${janela.custos_maximos_permitidos.join(", ")})`);
  }

  const just = typeof o.justificativa === "string" ? o.justificativa.trim() : "";
  if (just.length < 20 || just.length > 700) erros.push("justificativa precisa ter de duas a três frases");

  if (erros.length || !janela) return { ok: false, erros: erros.length ? erros : ["janela inválida"] };
  return {
    ok: true,
    janela,
    saida: { ...(o as SaidaModelo), justificativa: just, valor, custo_maximo: custo, clientes_alvo: alvo },
    proposta: {
      dia_semana: dia,
      hora_inicio: inicio!,
      hora_fim: fim!,
      segmento: segmento as Segmento,
      tipo: TIPOS_SAIDA[tipo],
      valor,
      teto: custo,
    },
  };
}

/**
 * Regra fixa quando o modelo falha 3 vezes (ou não está configurado): a janela
 * com mais cadeiras vazias, o segmento com mais elegíveis nela, 10% de desconto
 * (ou o máximo permitido, se for menor) e metade do saldo do mês como teto.
 */
export function propostaFallback(cardapio: Cardapio): { saida: SaidaModelo; proposta: PropostaCampanha; notas: string[] } | null {
  const pct = cardapio.valores_permitidos.desconto_percentual;
  if (!pct.length) return null;
  for (const j of cardapio.janelas_candidatas) {
    const [segmento, { elegiveis }] = (Object.entries(j.segmentos) as [Segmento, { elegiveis: number }][]).sort(
      (a, b) => b[1].elegiveis - a[1].elegiveis,
    )[0];
    if (!elegiveis || !j.custos_maximos_permitidos.length) continue;
    const notas: string[] = [];
    let valor = VALOR_FALLBACK;
    if (!pct.includes(valor)) {
      valor = Math.max(...pct.filter((v) => v <= VALOR_FALLBACK), Math.min(...pct));
      notas.push(`10% reduzido para ${valor}% pelo desconto máximo das regras`);
    }
    const metade = j.saldo_teto_mes / 2;
    const tetos = j.custos_maximos_permitidos;
    const custo = [...tetos].reverse().find((v) => v <= metade) ?? tetos[0];
    const inicio = lerHHMM(j.hora_inicio)!;
    const fim = lerHHMM(j.hora_fim)!;
    const ocup = String(j.ocupacao_media_pct).replace(".", ",");
    return {
      notas,
      saida: {
        dia_semana: j.dia_semana,
        hora_inicio: j.hora_inicio,
        hora_fim: j.hora_fim,
        segmento,
        tipo: "desconto_percentual",
        valor,
        clientes_alvo: elegiveis,
        custo_maximo: custo,
        justificativa:
          `Proposta montada por regra fixa, sem o modelo. ${j.dia_semana} ${formatarHora(inicio)}–${formatarHora(fim)} é a janela com mais cadeiras vazias ` +
          `(${String(j.cadeiras_hora_vazias).replace(".", ",")} cadeiras-hora, ${ocup}% de ocupação média) e "${SEGMENTOS.find((s) => s.id === segmento)!.rotulo.toLowerCase()}" é o segmento com mais clientes elegíveis nela (${elegiveis}).`,
      },
      proposta: {
        dia_semana: DIAS_TEXTO.indexOf(j.dia_semana),
        hora_inicio: inicio,
        hora_fim: fim,
        segmento,
        tipo: "percentual",
        valor,
        teto: custo,
      },
    };
  }
  return null;
}
