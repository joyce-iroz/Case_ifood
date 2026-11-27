// Planejador: tudo o que é número ou regra fica aqui, em código. Puro.
// O modelo recebe um cardápio já calculado e só escolhe itens dele; a resposta
// volta para `validarSaida`, e depois ainda passa por `avaliarProposta`.
import { lerNumeroBR } from "./numero";
import { SEMANAS_MAX, limiteValorFixo, type PropostaCampanha, type Regras } from "./campanha";
import { formatarHora, type Restaurante } from "./dominio";
import type { JanelaCandidata } from "./janelas";
import { SEGMENTOS, ehSegmento, type Segmento } from "./segmentos";

export const MAX_TENTATIVAS = 3;
export const JANELAS_NO_CARDAPIO = 12;
export const VALOR_FALLBACK = 10; // % na regra fixa

const NOMES_DIA_LONGO_TXT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_TEXTO = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
const TIPOS_SAIDA = { desconto_percentual: "percentual", desconto_valor: "valor_fixo" } as const;
type TipoSaida = keyof typeof TIPOS_SAIDA;

/** 18.5 → "18:30" */
export const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
/** "18:30" → 18.5; só hora cheia ou meia hora. */
export function lerHHMM(s: unknown): number | null {
  // Aceita "18:30", "18h30", "18h", "18:30:00". Só hora cheia ou meia hora.
  const m = typeof s === "string" ? s.trim().toLowerCase().match(/^(\d{1,2})(?:[:h](00|30)?)?(?::00)?h?$/) : null;
  if (!m) return null;
  const h = Number(m[1]) + (m[2] === "30" ? 0.5 : 0);
  return h >= 0 && h <= 24 ? h : null;
}

/** Tipo com sinônimos comuns ("percentual", "desconto_fixo"...). */
function lerTipoSaida(t: unknown): TipoSaida | null {
  const v = String(t ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["desconto_percentual", "percentual", "porcentagem", "desconto_porcentagem", "percent"].includes(v)) return "desconto_percentual";
  if (["desconto_valor", "valor_fixo", "desconto_fixo", "desconto_valor_fixo", "valor"].includes(v)) return "desconto_valor";
  return null;
}

/** Número que o modelo pode ter escrito como texto: 15, "15", "15%", "R$ 300", "300,00". */
function lerNumeroSaida(v: unknown): number {
  if (typeof v === "number") return v;
  return lerNumeroBR(String(v ?? "").replace(/%/g, "").trim());
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

export const PASSO_TETO = 50;

/** Tetos de campanha permitidos: de R$ 50 em R$ 50 até o saldo do mês. */
export function opcoesTeto(saldo: number): number[] {
  const n = Math.floor(saldo / PASSO_TETO);
  if (n >= 1) return Array.from({ length: n }, (_, i) => (i + 1) * PASSO_TETO);
  return saldo >= 1 ? [Math.floor(saldo)] : [];
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
  semanas_permitidas?: number[]; // ausente em cardápios antigos: vale 1 a 4
  segmentos_fatos?: Record<Segmento, FatoSegmento>; // o que se sabe de cada segmento, para a justificativa
  janelas_candidatas: JanelaCardapio[];
};

export const semanasDoCardapio = (c: Cardapio) => c.semanas_permitidas ?? [1, 2, 3, 4];

/** Fatos de um segmento que o modelo pode citar. Calculados em código. */
export type FatoSegmento = {
  descricao: string;
  taxa_resgate_pct: number;
  fonte_taxa: "historico" | "padrao";
  efeito_medido_vs_controle_pts: number | null; // null = ainda sem campanha medida
  observacao: string | null;
};

export function montarCardapio(
  r: Restaurante,
  regras: Regras,
  janelas: { candidata: JanelaCandidata; elegiveis: Record<Segmento, number>; saldo: number; validade: string }[],
  fatos?: Record<Segmento, FatoSegmento>,
): Cardapio {
  return {
    ...(fatos ? { segmentos_fatos: fatos } : {}),
    restaurante: { nome: r.nome, capacidade: r.capacidade, ticket_medio: r.ticket_medio },
    regras,
    segmentos_descricao: Object.fromEntries(SEGMENTOS.map((s) => [s.id, s.rotulo])) as Record<Segmento, string>,
    valores_permitidos: opcoesValor(regras, r),
    semanas_permitidas: Array.from({ length: SEMANAS_MAX }, (_, i) => i + 1),
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
  aposta: string;
  dia_semana: string;
  hora_inicio: string;
  hora_fim: string;
  segmento: Segmento;
  tipo: TipoSaida;
  valor: number;
  clientes_alvo: number;
  custo_maximo: number;
  semanas?: number;
  justificativa: string;
};

export type AlternativaValida = { saida: SaidaModelo; proposta: PropostaCampanha; janela: JanelaCardapio };

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Código do segmento a partir do código ou do nome exibido. Nada fora da lista passa. */
export function lerSegmento(x: unknown): Segmento | null {
  if (typeof x !== "string") return null;
  const t = semAcento(x).replace(/[.\s]+$/, "");
  const s = SEGMENTOS.find((seg) => seg.id === t || semAcento(seg.rotulo) === t);
  return s ? s.id : null;
}

/** Tira cercas de código e lê o JSON. */
export function lerJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(limpo);
}

export const tipoDoCardapio = (t: PropostaCampanha["tipo"]): TipoSaida =>
  t === "percentual" ? "desconto_percentual" : "desconto_valor";

/** A janela do cardápio com o mesmo dia e horas, se existir. */
export function janelaDoCardapio(cardapio: Cardapio, dia: number, inicio: number, fim: number): JanelaCardapio | undefined {
  return cardapio.janelas_candidatas.find(
    (j) => j.dia_semana === DIAS_TEXTO[dia] && lerHHMM(j.hora_inicio) === inicio && lerHHMM(j.hora_fim) === fim,
  );
}

/**
 * A proposta cabe no cardápio daquele planejamento? Janela entre as candidatas,
 * segmento com elegíveis nela, valor da lista do tipo (e ≤ desconto_max), teto da
 * lista da janela (e ≤ saldo). Serve à resposta do modelo, à prévia e à aprovação:
 * o que vem do navegador passa por aqui como qualquer entrada não confiável.
 */
export function validarContraCardapio(p: PropostaCampanha, cardapio: Cardapio): { erros: string[]; janela?: JanelaCardapio } {
  const erros: string[] = [];
  const janela = janelaDoCardapio(cardapio, p.dia_semana, p.hora_inicio, p.hora_fim);
  if (!janela) {
    erros.push(
      `a janela ${DIAS_TEXTO[p.dia_semana] ?? p.dia_semana} ${hhmm(p.hora_inicio)}–${hhmm(p.hora_fim)} não está na lista de janelas_candidatas`,
    );
  } else if (!ehSegmento(p.segmento)) {
    erros.push(`segmento "${String(p.segmento)}" não existe`);
  } else if (janela.segmentos[p.segmento].elegiveis === 0) {
    erros.push(`o segmento ${p.segmento} não tem clientes elegíveis nessa janela`);
  }

  if (!semanasDoCardapio(cardapio).includes(p.semanas))
    erros.push(`semanas ${p.semanas} não está em semanas_permitidas (${semanasDoCardapio(cardapio).join(", ")})`);
  const tipo = tipoDoCardapio(p.tipo);
  if (p.tipo === "percentual" && p.valor > cardapio.regras.desconto_max)
    erros.push(`valor ${p.valor}% está acima do desconto_max de ${cardapio.regras.desconto_max}%`);
  const lista = cardapio.valores_permitidos[tipo];
  if (!lista.includes(p.valor))
    erros.push(`valor ${p.valor} não está em valores_permitidos.${tipo} (${lista.join(", ") || "lista vazia"})`);

  if (janela) {
    if (p.teto > janela.saldo_teto_mes)
      erros.push(`custo_maximo ${p.teto} passa do saldo do teto do mês (${janela.saldo_teto_mes})`);
    if (!janela.custos_maximos_permitidos.includes(p.teto))
      erros.push(`custo_maximo ${p.teto} não está em custos_maximos_permitidos (${janela.custos_maximos_permitidos.join(", ")})`);
  }
  return { erros, janela };
}

/** Todos os números que aparecem nos dados enviados ao modelo (inclusive dentro de "19:30"). */
export function numerosDoCardapio(c: Cardapio): number[] {
  return [...JSON.stringify(c).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/**
 * Justificativa específica: cita pelo menos 2 números, e todos existem na entrada
 * (aceita arredondamento: 38 para 38,2). Número inventado reprova, como valor fora da regra.
 */
export function conferirJustificativa(just: string, numerosEntrada: number[]): string[] {
  const codigo = SEGMENTOS.find((s) => just.includes(s.id));
  if (codigo) return [`justificativa usa o código "${codigo.id}"; chame o segmento pelo nome: "${codigo.rotulo}"`];
  const citados = [...just.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
  if (citados.length < 2)
    return [
      "justificativa genérica: cite pelo menos 2 números da entrada (ocupação, cadeiras-hora vazias, elegíveis, taxa de resgate ou efeito medido do segmento)",
    ];
  const inventados = citados.filter((n) => !numerosEntrada.some((x) => Math.abs(x - n) <= 0.5));
  return inventados.length
    ? [`justificativa cita ${inventados.join(", ")}, que não está nos dados de entrada; use só números da entrada`]
    : [];
}

/** Uma alternativa do modelo: formato do contrato, depois o cardápio. */
function validarItem(
  bruto: unknown,
  cardapio: Cardapio,
  numeros?: number[],
): { ok: true; alt: AlternativaValida } | { ok: false; erros: string[] } {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, erros: ["precisa ser um objeto JSON"] };
  const o = bruto as Record<string, unknown>;
  const chaves = ["aposta", "dia_semana", "hora_inicio", "hora_fim", "segmento", "tipo", "valor", "clientes_alvo", "custo_maximo", "justificativa"];
  const faltam = chaves.filter((k) => !(k in o));
  if (faltam.length) return { ok: false, erros: [`faltam as chaves: ${faltam.join(", ")}`] };

  const erros: string[] = [];
  const aposta = typeof o.aposta === "string" ? o.aposta.trim() : "";
  if (!aposta || aposta.length > 40) erros.push("aposta precisa ser um rótulo curto (até 40 caracteres)");
  const dia = DIAS_TEXTO.indexOf(semAcento(String(o.dia_semana)) as (typeof DIAS_TEXTO)[number]);
  const inicio = lerHHMM(o.hora_inicio);
  const fim = lerHHMM(o.hora_fim);
  if (dia < 0) erros.push(`dia_semana "${o.dia_semana}" inválido; use ${DIAS_TEXTO.join(", ")}`);
  if (inicio === null || fim === null) erros.push("hora_inicio e hora_fim precisam ser HH:MM em hora cheia ou meia hora");
  // O modelo às vezes escreve o nome do segmento ("Pede delivery e nunca veio ao salão")
  // no lugar do código. O nome também é uma lista fechada, então dá para traduzir sem
  // adivinhar: só aceita se bater exatamente com um rótulo (ignorando acento e caixa).
  o.segmento = lerSegmento(o.segmento) ?? o.segmento;
  if (!ehSegmento(o.segmento)) erros.push(`segmento "${String(o.segmento)}" não existe; use ${SEGMENTOS.map((x) => x.id).join(", ")}`);
  const tipo = lerTipoSaida(o.tipo) as TipoSaida;
  if (!tipo) erros.push(`tipo "${String(o.tipo)}" inválido; use desconto_percentual ou desconto_valor`);
  const valor = lerNumeroSaida(o.valor);
  const custo = lerNumeroSaida(o.custo_maximo);
  const alvo = lerNumeroSaida(o.clientes_alvo);
  if (!Number.isFinite(valor)) erros.push("valor precisa ser número");
  if (!Number.isFinite(custo)) erros.push("custo_maximo precisa ser número");
  const just = typeof o.justificativa === "string" ? o.justificativa.trim() : "";
  if (just.length < 20 || just.length > 700) erros.push("justificativa precisa ter de duas a três frases");
  else if (numeros) erros.push(...conferirJustificativa(just, numeros));
  if (erros.length) return { ok: false, erros };

  const proposta: PropostaCampanha = {
    dia_semana: dia,
    hora_inicio: inicio!,
    hora_fim: fim!,
    segmento: o.segmento as Segmento,
    tipo: TIPOS_SAIDA[tipo],
    valor,
    teto: custo,
    semanas: o.semanas === undefined || o.semanas === null ? 1 : lerNumeroSaida(o.semanas),
  };
  const { erros: doCardapio, janela } = validarContraCardapio(proposta, cardapio);
  erros.push(...doCardapio);
  if (janela && ehSegmento(o.segmento)) {
    const disponiveis = janela.segmentos[o.segmento].elegiveis;
    if (!Number.isInteger(alvo) || alvo <= 0) erros.push("clientes_alvo precisa ser um inteiro positivo");
    else if (alvo > disponiveis) erros.push(`clientes_alvo ${alvo} é maior que os ${disponiveis} elegíveis de ${o.segmento} nessa janela`);
  }
  if (erros.length || !janela) return { ok: false, erros };
  return {
    ok: true,
    alt: {
      janela,
      proposta,
      // Formato canônico: o resto do código compara dia e horas como texto ("terca", "18:30").
      saida: {
        ...(o as SaidaModelo),
        aposta,
        dia_semana: DIAS_TEXTO[dia],
        hora_inicio: hhmm(inicio!),
        hora_fim: hhmm(fim!),
        segmento: o.segmento as Segmento,
        tipo,
        justificativa: just,
        valor,
        custo_maximo: custo,
        clientes_alvo: alvo,
      },
    },
  };
}

/**
 * A resposta do modelo deve ser um array de 3 alternativas. Cada uma é validada
 * sozinha; as inválidas são descartadas com o motivo. Duas com a mesma janela e o
 * mesmo segmento contam como uma: a segunda é descartada.
 */
export function validarAlternativas(texto: string, cardapio: Cardapio): { validas: AlternativaValida[]; erros: string[] } {
  let bruto: unknown;
  try {
    bruto = lerJson(texto);
  } catch {
    return { validas: [], erros: ["a resposta não é um JSON válido"] };
  }
  // {"propostas": [...]} é o pedido; aceita também o array puro ou outra chave com array.
  const lista = Array.isArray(bruto)
    ? bruto
    : bruto && typeof bruto === "object"
      ? (((bruto as Record<string, unknown>).propostas as unknown[] | undefined) ??
        (Object.values(bruto as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ??
        null)
      : null;
  if (!lista) return { validas: [], erros: ["a resposta precisa ser um array JSON com 3 propostas"] };

  const erros: string[] = [];
  if (lista.length !== 3) erros.push(`vieram ${lista.length} propostas; o pedido é de exatamente 3`);
  const validas: AlternativaValida[] = [];
  const numeros = numerosDoCardapio(cardapio);
  lista.slice(0, 3).forEach((item, i) => {
    const v = validarItem(item, cardapio, numeros);
    if (!v.ok) return erros.push(...v.erros.map((e) => `proposta ${i + 1}: ${e}`));
    const repetida = validas.find(
      (x) => x.janela === v.alt.janela && x.proposta.segmento === v.alt.proposta.segmento,
    );
    if (repetida)
      return erros.push(`proposta ${i + 1}: repete janela e segmento de outra; as três devem diferir em janela ou segmento`);
    validas.push(v.alt);
  });
  return { validas, erros };
}

/**
 * Regra fixa quando o modelo falha 3 vezes (ou não está configurado): a janela
 * com mais cadeiras vazias, o segmento com mais elegíveis nela, 10% de desconto
 * (ou o máximo permitido, se for menor) e metade do saldo do mês como teto.
 */
/** Janela + segmento: o que define se duas propostas são "a mesma" para o dono. */
export const chaveCombo = (p: Pick<PropostaCampanha, "dia_semana" | "hora_inicio" | "hora_fim" | "segmento">) =>
  `${p.dia_semana}|${p.hora_inicio}|${p.hora_fim}|${p.segmento}`;

/** As combinações já mostradas, no formato do contrato, para o modelo não repetir. */
export const paraContrato = (p: PropostaCampanha) => ({
  dia_semana: DIAS_TEXTO[p.dia_semana],
  hora_inicio: hhmm(p.hora_inicio),
  hora_fim: hhmm(p.hora_fim),
  segmento: p.segmento,
});

export function propostaFallback(
  cardapio: Cardapio,
  jaMostradas: Set<string> = new Set(),
): { saida: SaidaModelo; proposta: PropostaCampanha; notas: string[] } | null {
  const pct = cardapio.valores_permitidos.desconto_percentual;
  if (!pct.length) return null;
  // Primeiro tenta uma combinação ainda não mostrada; se todas já foram, aceita repetir.
  // "Já vem nesse horário" só entra se nada mais servir: desconto para ele é canibalizado.
  const tentar = (excluir: Set<string>, aceitaJanela = false) => {
    for (const j of cardapio.janelas_candidatas) {
      if (!j.custos_maximos_permitidos.length) continue;
      const dia = DIAS_TEXTO.indexOf(j.dia_semana);
      const [inicio, fim] = [lerHHMM(j.hora_inicio)!, lerHHMM(j.hora_fim)!];
      const ordem = (Object.entries(j.segmentos) as [Segmento, { elegiveis: number }][]).sort(
        (a, b) => b[1].elegiveis - a[1].elegiveis,
      );
      const achou = ordem.find(
        ([segmento, { elegiveis }]) =>
          elegiveis > 0 &&
          (aceitaJanela || segmento !== "frequenta_janela") &&
          !excluir.has(chaveCombo({ dia_semana: dia, hora_inicio: inicio, hora_fim: fim, segmento })),
      );
      if (achou) return { j, segmento: achou[0], elegiveis: achou[1].elegiveis };
    }
    return null;
  };
  const novo = tentar(jaMostradas) ?? tentar(jaMostradas, true);
  const achado = novo ?? tentar(new Set()) ?? tentar(new Set(), true);
  if (!achado) return null;
  const pulou = jaMostradas.size > 0 && !!novo;
  {
    const { j, segmento, elegiveis } = achado;
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
    const ocup = String(Math.round(j.ocupacao_media_pct)).replace(".", ",");
    return {
      notas,
      saida: {
        aposta: "horário mais vazio",
        dia_semana: j.dia_semana,
        hora_inicio: j.hora_inicio,
        hora_fim: j.hora_fim,
        segmento,
        tipo: "desconto_percentual",
        valor,
        clientes_alvo: elegiveis,
        custo_maximo: custo,
        justificativa:
          `${pulou ? "Entre as opções ainda não mostradas, " : ""}${NOMES_DIA_LONGO_TXT[DIAS_TEXTO.indexOf(j.dia_semana)]} ${formatarHora(inicio)}–${formatarHora(fim)} é o horário mais vazio ` +
          `(${ocup}% ocupado) e "${SEGMENTOS.find((s) => s.id === segmento)!.rotulo.toLowerCase()}" é o público com mais clientes nele (${elegiveis}).`,
      },
      proposta: {
        dia_semana: DIAS_TEXTO.indexOf(j.dia_semana),
        hora_inicio: inicio,
        hora_fim: fim,
        segmento,
        tipo: "percentual",
        valor,
        teto: custo,
        semanas: 1,
      },
    };
  }
}

/**
 * O cardápio como vai ao modelo, enxuto (o plano gratuito do Groq tem 8.000 tokens por
 * minuto): a lista de tetos vira um intervalo, saem campos repetidos. A validação continua
 * usando o cardápio completo.
 */
export function cardapioParaModelo(c: Cardapio) {
  return {
    restaurante: c.restaurante,
    regras: c.regras,
    valores_permitidos: c.valores_permitidos,
    semanas_permitidas: semanasDoCardapio(c),
    segmentos_fatos: c.segmentos_fatos ?? c.segmentos_descricao,
    janelas_candidatas: c.janelas_candidatas.map((j) => ({
      dia_semana: j.dia_semana,
      hora_inicio: j.hora_inicio,
      hora_fim: j.hora_fim,
      ocupacao_media_pct: j.ocupacao_media_pct,
      cadeiras_hora_vazias: j.cadeiras_hora_vazias,
      custo_maximo_de: j.custos_maximos_permitidos[0] ?? 0,
      custo_maximo_ate: j.custos_maximos_permitidos.at(-1) ?? 0,
      elegiveis: Object.fromEntries(Object.entries(j.segmentos).map(([k, v]) => [k, v.elegiveis])),
    })),
  };
}
