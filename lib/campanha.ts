// Regras de campanha e de desconto. Puro: o mesmo código valida o formulário de hoje
// e o planejador de IA de amanhã. Quem cria a proposta não importa; o que vale é isto.
import {
  agoraNoFuso,
  diaDaSemana,
  formatarDataCurta,
  formatarHora,
  formatarMoeda,
  horasDeFuncionamento,
  instanteNoFuso,
  nomeDiaLongo,
  somarDias,
  type Restaurante,
} from "./dominio";
import { ehSegmento, type Janela, type Segmento } from "./segmentos";
import { lerCampoNumero } from "./numero";

export type TipoBeneficio = "percentual" | "valor_fixo";
export const ehTipo = (x: unknown): x is TipoBeneficio => x === "percentual" || x === "valor_fixo";

/**
 * O registro que qualquer criador de campanha produz (formulário ou planejador).
 * `criarCampanha` em lib/servidor/campanhas.ts é a única porta de entrada.
 */
export type PropostaCampanha = {
  dia_semana: number;  // 0 = domingo
  hora_inicio: number; // horas; meia hora como ,5 (18.5 = 18h30)
  hora_fim: number;    // exclusiva
  segmento: Segmento;
  tipo: TipoBeneficio;
  valor: number;       // % da conta (percentual) ou R$ (valor_fixo)
  teto: number;        // gasto máximo da campanha em descontos, R$
  semanas: number;     // 1 a 4: repete a janela no mesmo dia da semana por N semanas
  limite_por_conta: number | null; // só percentual: desconto máximo em R$ numa conta ("20% até R$ 30")
};

export const SEMANAS_MAX = 4;
/** % dos elegíveis sorteados para o grupo de controle (não recebem o benefício). */
export const CONTROLE_PCT = 20;
/** Abaixo disso o controle fica pequeno demais para dizer algo: todos recebem. */
export const CONTROLE_MIN_ELEGIVEIS = 10;

export type Regras = {
  teto_mes: number;
  desconto_max: number;
  dias_entre_ofertas: number;
  ocupacao_min: number;
};

export type Bloqueio = {
  regra: "dados" | "janela" | "desconto_max" | "ocupacao_min" | "teto_mes" | "dias_entre_ofertas" | "cardapio";
  mensagem: string;
};

/** Converte entrada desconhecida (JSON do formulário ou da IA) em proposta, ou diz o que está errado. */
const vazio = (v: unknown) => v === undefined || v === null || v === "" || v === 0 || v === "0";

export function lerProposta(x: unknown): { proposta: PropostaCampanha } | { bloqueios: Bloqueio[] } {
  const o = (x ?? {}) as Record<string, unknown>;
  const num = (k: string) => lerCampoNumero(o[k]);
  const p = {
    dia_semana: num("dia_semana"),
    hora_inicio: num("hora_inicio"),
    hora_fim: num("hora_fim"),
    segmento: o.segmento,
    tipo: o.tipo,
    valor: num("valor"),
    teto: num("teto"),
    semanas: o.semanas === undefined || o.semanas === null || o.semanas === "" ? 1 : num("semanas"),
    limite_por_conta: vazio(o.limite_por_conta) ? null : num("limite_por_conta"),
  };
  const erros: string[] = [];
  if (!Number.isInteger(p.dia_semana) || p.dia_semana < 0 || p.dia_semana > 6) erros.push("dia da semana inválido");
  const meiaHora = (h: number) => Number.isInteger(h * 2) && h >= 0 && h <= 24;
  if (!meiaHora(p.hora_inicio) || !meiaHora(p.hora_fim) || p.hora_fim <= p.hora_inicio)
    erros.push("faixa de horas inválida (use horas cheias ou meia hora)");
  if (!ehSegmento(p.segmento)) erros.push("segmento inválido");
  if (!ehTipo(p.tipo)) erros.push("tipo de benefício inválido");
  if (!Number.isFinite(p.valor) || p.valor <= 0) erros.push("valor do benefício precisa ser maior que zero");
  if (!Number.isFinite(p.teto) || p.teto <= 0) erros.push("teto de gasto precisa ser maior que zero");
  if (!Number.isInteger(p.semanas) || p.semanas < 1 || p.semanas > SEMANAS_MAX)
    erros.push(`duração precisa ser de 1 a ${SEMANAS_MAX} semanas`);
  if (p.limite_por_conta !== null) {
    if (!Number.isFinite(p.limite_por_conta) || p.limite_por_conta <= 0) erros.push("limite por conta precisa ser maior que zero");
    else if (p.tipo === "valor_fixo") p.limite_por_conta = null; // valor fixo já é o limite
  }
  if (erros.length) return { bloqueios: erros.map((mensagem) => ({ regra: "dados", mensagem })) };
  return { proposta: p as PropostaCampanha };
}

export const janelaDa = (p: Pick<PropostaCampanha, "dia_semana" | "hora_inicio" | "hora_fim">): Janela => ({
  dia: p.dia_semana,
  inicio: p.hora_inicio,
  fim: p.hora_fim,
});

/** Desconto máximo por benefício em R$ para valor fixo: desconto_max% do ticket médio. */
export const limiteValorFixo = (regras: Regras, r: Restaurante) =>
  Math.round(r.ticket_medio * regras.desconto_max) / 100;

/**
 * Regras que não dependem de quais clientes recebem: janela, desconto_max,
 * ocupacao_min e teto_mes. dias_entre_ofertas é aplicado cliente a cliente na emissão.
 */
export function validarProposta(
  p: PropostaCampanha,
  ctx: { restaurante: Restaurante; regras: Regras; ocupacaoJanela: number | null; tetoRestanteMes: number; mes: string },
): Bloqueio[] {
  const { restaurante: r, regras } = ctx;
  const bloqueios: Bloqueio[] = [];

  const horas = horasDeFuncionamento(r);
  if (!r.dias_abertos.includes(p.dia_semana)) {
    bloqueios.push({ regra: "janela", mensagem: `O restaurante não abre ${nomeDiaLongo(p.dia_semana)}.` });
  } else {
    const fora: number[] = [];
    for (let h = Math.floor(p.hora_inicio); h < Math.ceil(p.hora_fim); h++) if (!horas.includes(h)) fora.push(h);
    if (fora.length)
      bloqueios.push({
        regra: "janela",
        mensagem: `A janela inclui horário em que o salão está fechado (${fora.map(formatarHora).join(", ")}).`,
      });
  }

  if (p.tipo === "percentual" && p.valor > regras.desconto_max) {
    bloqueios.push({
      regra: "desconto_max",
      mensagem: `Desconto de ${p.valor}% acima do máximo de ${regras.desconto_max}% definido nas regras.`,
    });
  }
  if (p.tipo === "valor_fixo") {
    const limite = limiteValorFixo(regras, r);
    if (p.valor > limite)
      bloqueios.push({
        regra: "desconto_max",
        mensagem: `Desconto de ${formatarMoeda(p.valor)} passa de ${regras.desconto_max}% do ticket médio (${formatarMoeda(r.ticket_medio)}), ou seja, de ${formatarMoeda(limite)}.`,
      });
  }

  if (ctx.ocupacaoJanela !== null && ctx.ocupacaoJanela >= regras.ocupacao_min) {
    bloqueios.push({
      regra: "ocupacao_min",
      mensagem: `A ocupação média dessa janela é ${Math.round(ctx.ocupacaoJanela)}%, não está abaixo do mínimo de ${regras.ocupacao_min}% das regras. Desconto aí iria para mesas que já se enchem.`,
    });
  }

  if (p.teto > ctx.tetoRestanteMes) {
    bloqueios.push({
      regra: "teto_mes",
      mensagem: `O teto da campanha (${formatarMoeda(p.teto)}) passa do que resta do teto mensal em ${ctx.mes.split("-").reverse().join("/")}: ${formatarMoeda(Math.max(0, ctx.tetoRestanteMes))} de ${formatarMoeda(regras.teto_mes)}.`,
    });
  }

  return bloqueios;
}

/** Próxima ocorrência da janela: hoje, se a janela ainda não acabou; senão, a próxima semana. */
export function proximaJanela(janela: Janela, agora = agoraNoFuso(), semanas = 1) {
  let data = agora.data;
  let dias = (janela.dia - diaDaSemana(data) + 7) % 7;
  if (dias === 0 && agora.hora + agora.minuto / 60 >= janela.fim) dias = 7;
  data = somarDias(data, dias);
  const datas = ocorrencias(data, semanas);
  return {
    data,
    datas,
    valido_de: instanteNoFuso(data, janela.inicio),
    valido_ate: instanteNoFuso(datas.at(-1)!, janela.fim), // fim da ÚLTIMA ocorrência
  };
}

/** As datas em que a campanha vale: a primeira e as semanas seguintes. */
export function ocorrencias(dataJanela: string, semanas = 1): string[] {
  return Array.from({ length: Math.max(1, semanas) }, (_, i) => somarDias(dataJanela, 7 * i));
}

/** Instante em que a campanha termina: fim da janela na última ocorrência. */
export const fimDaCampanha = (c: { data_janela: string; hora_fim: number; semanas?: number }) =>
  instanteNoFuso(ocorrencias(c.data_janela, c.semanas ?? 1).at(-1)!, c.hora_fim);

/**
 * Até quando vale uma vaga guardada agora: o fim da próxima ocorrência que ainda não
 * terminou. Se não foi usada até lá, a vaga volta para o teto (a oferta continua valendo
 * nas semanas seguintes, mas sem vaga garantida).
 */
export function fimDaProximaOcorrencia(
  c: { data_janela: string; hora_fim: number; semanas?: number },
  agoraMs = Date.now(),
): string {
  const fins = ocorrencias(c.data_janela, c.semanas ?? 1).map((d) => instanteNoFuso(d, c.hora_fim));
  return fins.find((f) => new Date(f).getTime() > agoraMs) ?? fins.at(-1)!;
}

/** Agora está dentro de uma das ocorrências (dia e faixa de hora)? */
export function dentroDeOcorrencia(
  c: { data_janela: string; hora_inicio: number; hora_fim: number; semanas?: number },
  agora = agoraNoFuso(),
): boolean {
  const h = agora.hora + agora.minuto / 60;
  return ocorrencias(c.data_janela, c.semanas ?? 1).includes(agora.data) && h >= c.hora_inicio && h < c.hora_fim;
}

/**
 * Quanto do teto mensal já está comprometido no mês: campanha cuja janela ainda não
 * terminou reserva o teto inteiro; campanha encerrada conta só o que gastou.
 */
export function comprometidoNoMes(
  campanhas: { data_janela: string; hora_fim: number; teto: number; gasto: number; semanas?: number; status?: string }[],
  mes: string,
  agoraIso = new Date().toISOString(),
): number {
  let total = 0;
  for (const c of campanhas) {
    // O teto inteiro conta no mês da primeira ocorrência, mesmo que as semanas passem para o mês seguinte.
    if (!c.data_janela.startsWith(mes)) continue;
    const terminou =
      c.status === "pausada" || new Date(fimDaCampanha(c)).getTime() <= new Date(agoraIso).getTime();
    total += terminou ? c.gasto : c.teto;
  }
  return Math.round(total * 100) / 100;
}

/** Clientes que receberam oferta há menos de `dias` dias ficam de fora. */
export function separarPorIntervalo(
  clienteIds: string[],
  ultimaOferta: Map<string, string>, // cliente_id → criado_em ISO da oferta mais recente
  dias: number,
  agoraIso = new Date().toISOString(),
): { elegiveis: string[]; recentes: string[] } {
  const limite = new Date(agoraIso).getTime() - dias * 86_400_000;
  const elegiveis: string[] = [];
  const recentes: string[] = [];
  for (const id of clienteIds) {
    const ultima = ultimaOferta.get(id);
    (ultima && new Date(ultima).getTime() > limite ? recentes : elegiveis).push(id);
  }
  return { elegiveis, recentes };
}

export function textoBeneficio(tipo: TipoBeneficio, valor: number, limite: number | null = null): string {
  if (tipo !== "percentual") return `${formatarMoeda(valor)} de desconto`;
  const pct = `${String(valor).replace(".", ",")}% de desconto`;
  return limite ? `${pct}, até ${formatarMoeda(limite)}` : pct;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Desconto de um resgate: o nominal do benefício, limitado a desconto_max% da conta
 * e ao que sobra do teto da campanha. O banco aplica de novo o limite do teto, com trava.
 */
export function calcularDesconto(
  b: { tipo: TipoBeneficio; valor: number; limite_por_conta?: number | null },
  valorConta: number,
  descontoMaxPct: number,
  tetoRestanteCampanha: number,
): { desconto: number; limitadoPor: "limite" | "desconto_max" | "teto" | null } {
  if (!(valorConta > 0)) return { desconto: 0, limitadoPor: null };
  const bruto = b.tipo === "percentual" ? (valorConta * b.valor) / 100 : b.valor;
  const limite = b.tipo === "percentual" && b.limite_por_conta ? b.limite_por_conta : Infinity;
  const nominal = Math.min(bruto, limite);
  const porRegra = (valorConta * descontoMaxPct) / 100;
  const teto = Math.max(0, tetoRestanteCampanha);
  const desconto = Math.min(nominal, porRegra, teto, valorConta);
  const limitadoPor =
    desconto < nominal - 0.004
      ? teto <= porRegra
        ? "teto"
        : "desconto_max"
      : nominal < bruto - 0.004
        ? "limite"
        : null;
  return { desconto: centavos(desconto), limitadoPor };
}

/** Código de 4 dígitos, distintos dentro da campanha. `aleatorio` devolve inteiro em [0, 10000). */
export function gerarCodigos(n: number, aleatorio: () => number): string[] {
  if (n > 10_000) throw new Error("mais de 10.000 benefícios numa campanha");
  const usados = new Set<string>();
  while (usados.size < n) usados.add(String(aleatorio()).padStart(4, "0"));
  return [...usados];
}

/**
 * DEMO: aceita resgate antes de `valido_de`, para a apresentação funcionar em qualquer
 * dia. Depois de `valido_ate` continua recusando. Em produção, troque para false.
 */
export const DEMO_ACEITA_ANTES_DA_JANELA = true;

/**
 * Pausa automática: se alguma ocorrência da campanha já registrou ocupação média
 * igual ou acima do mínimo das regras, a janela enche sem desconto e a campanha para.
 * Devolve o motivo, ou null. Aritmética sobre registros de ocupação (caixa / POS).
 */
export function motivoDePausa(
  c: { data_janela: string; hora_inicio: number; hora_fim: number; semanas: number },
  registros: { data: string; hora: number; pessoas: number }[],
  capacidade: number,
  ocupacaoMin: number,
): string | null {
  for (const d of ocorrencias(c.data_janela, c.semanas)) {
    let soma = 0;
    let peso = 0;
    for (const r of registros) {
      if (r.data !== d) continue;
      const dentro = Math.min(r.hora + 1, c.hora_fim) - Math.max(r.hora, c.hora_inicio);
      if (dentro <= 0) continue;
      soma += (r.pessoas / capacidade) * 100 * dentro;
      peso += dentro;
    }
    if (!peso) continue;
    const media = Math.round(soma / peso);
    if (media >= ocupacaoMin)
      return `A ocupação de ${formatarDataCurta(d)}, ${formatarHora(c.hora_inicio)}–${formatarHora(c.hora_fim)}, chegou a ${media}%, acima do mínimo de ${ocupacaoMin}%. A janela já enche sem desconto.`;
  }
  return null;
}
