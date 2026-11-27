import "server-only";
import { randomInt } from "node:crypto";
import { supabaseServidor } from "./supabase/server";
import {
  carregarCampanhasCompletas,
  carregarClientesComVisitas,
  carregarRegras,
  carregarRestaurante,
  obterResumoOcupacao,
} from "./dados";
import { RESTAURANTE_DEMO_ID, formatarJanela, formatarValidade, hojeNoFuso, timeDaHora } from "./dominio";
import {
  comprometidoNoMes,
  gerarCodigos,
  janelaDa,
  lerProposta,
  limiteValorFixo,
  textoBeneficio,
  fimDaCampanha,
  CONTROLE_PCT,
  CONTROLE_MIN_ELEGIVEIS,
  proximaJanela,
  separarPorIntervalo,
  validarProposta,
  type Bloqueio,
  type PropostaCampanha,
  type Regras,
} from "./campanha";
import { SEGMENTOS, classificarCliente, rotuloSegmento, type Janela, type Segmento } from "./segmentos";
import { gerarKit } from "./kit";
import { calcularTaxas, type Taxas } from "./projecao";
import { medirControle, sortearControle } from "./controle";
import { entradaKit } from "./kit-regras";
import type { ResumoOcupacao } from "./ocupacao";

/** Média das células da grade na janela, pesada pelo tempo de cada hora dentro dela. */
export function ocupacaoDaJanela(resumo: ResumoOcupacao, j: Janela): number | null {
  let soma = 0;
  let peso = 0;
  for (const c of resumo.celulas) {
    if (c.dia !== j.dia) continue;
    const dentro = Math.min(c.hora + 1, j.fim) - Math.max(c.hora, j.inicio);
    if (dentro <= 0) continue;
    soma += c.percentual * dentro;
    peso += dentro;
  }
  return peso ? Math.round((soma / peso) * 10) / 10 : null;
}

/** Dados do restaurante que as regras usam. Uma leitura serve a várias janelas. */
export async function carregarBase(id = RESTAURANTE_DEMO_ID) {
  const hoje = hojeNoFuso();
  const restaurante = await carregarRestaurante(id);
  const [regras, resumo, base, campanhasCompletas] = await Promise.all([
    carregarRegras(id),
    obterResumoOcupacao(id, restaurante),
    carregarClientesComVisitas(id),
    carregarCampanhasCompletas(id),
  ]);

  const gastoPorCampanha = new Map<string, number>();
  const campanhaDoBeneficio = new Map(campanhasCompletas.beneficios.map((b) => [b.id, b.campanha_id]));
  for (const r of campanhasCompletas.resgates) {
    const c = campanhaDoBeneficio.get(r.beneficio_id)!;
    gastoPorCampanha.set(c, (gastoPorCampanha.get(c) ?? 0) + r.desconto);
  }
  const campanhasComGasto = campanhasCompletas.campanhas.map((c) => ({ ...c, gasto: gastoPorCampanha.get(c.id) ?? 0 }));

  const ultimaOferta = new Map<string, string>();
  const registrar = (cliente: string, quando: string) => {
    const atual = ultimaOferta.get(cliente);
    if (!atual || quando > atual) ultimaOferta.set(cliente, quando);
  };
  for (const b of campanhasCompletas.beneficios) registrar(b.cliente_id, b.criado_em);
  // Quem foi sorteado para o controle também conta como "já teve oferta": recebê-la de
  // outra campanha logo em seguida contaminaria a medição.
  const criadaEm = new Map(campanhasCompletas.campanhas.map((c) => [c.id, c.criado_em]));
  for (const k of campanhasCompletas.controles) registrar(k.cliente_id, criadaEm.get(k.campanha_id)!);

  // Taxas históricas por segmento, das campanhas que já terminaram: base da projeção.
  const agoraMs = Date.now();
  const emitidosPor = new Map<string, number>();
  for (const b of campanhasCompletas.beneficios) emitidosPor.set(b.campanha_id, (emitidosPor.get(b.campanha_id) ?? 0) + 1);
  const resgatesPor = new Map<string, { n: number; inc: number }>();
  for (const r of campanhasCompletas.resgates) {
    const c = campanhaDoBeneficio.get(r.beneficio_id)!;
    const acc = resgatesPor.get(c) ?? { n: 0, inc: 0 };
    acc.n += 1;
    if (r.incremental) acc.inc += 1;
    resgatesPor.set(c, acc);
  }
  const taxas = calcularTaxas(
    campanhasCompletas.campanhas
      .filter((c) => c.status === "pausada" || new Date(fimDaCampanha(c)).getTime() <= agoraMs)
      .map((c) => ({
        segmento: c.segmento,
        emitidos: emitidosPor.get(c.id) ?? 0,
        resgates: resgatesPor.get(c.id)?.n ?? 0,
        incrementais: resgatesPor.get(c.id)?.inc ?? 0,
      })),
  );

  // Efeito medido contra o grupo de controle, por segmento (média pesada pelos tratados).
  const efeitoAcc = new Map<Segmento, { soma: number; peso: number; campanhas: number }>();
  for (const c of campanhasCompletas.campanhas) {
    const ctrl = campanhasCompletas.controles.filter((k) => k.campanha_id === c.id).map((k) => k.cliente_id);
    if (!ctrl.length) continue;
    const tratados = campanhasCompletas.beneficios.filter((b) => b.campanha_id === c.id).map((b) => b.cliente_id);
    const m = medirControle(c, tratados, ctrl, base.visitasDe);
    if (m.estado !== "medido") continue;
    const acc = efeitoAcc.get(c.segmento) ?? { soma: 0, peso: 0, campanhas: 0 };
    acc.soma += m.lift * tratados.length;
    acc.peso += tratados.length;
    acc.campanhas += 1;
    efeitoAcc.set(c.segmento, acc);
  }
  const efeitos = Object.fromEntries(
    SEGMENTOS.map((s) => {
      const a = efeitoAcc.get(s.id);
      return [s.id, a && a.peso ? { pts: Math.round((a.soma / a.peso) * 10) / 10, campanhas: a.campanhas } : null];
    }),
  ) as Record<Segmento, { pts: number; campanhas: number } | null>;

  // Fatos dos clientes da região (dado da plataforma, só em agregado).
  const regiao = base.clientes.filter((c) => c.origem === "regiao");
  const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
  const fatosRegiao = regiao.length
    ? {
        pedidosMedios: media(regiao.map((c) => Number(c.pedidos_cozinha_regiao ?? 0))),
        distanciaMedia: media(regiao.map((c) => Number(c.distancia_km ?? 0))),
      }
    : null;

  return { id, hoje, restaurante, regras, resumo, clientes: base, campanhasComGasto, ultimaOferta, taxas, efeitos, fatosRegiao };
}

export type Base = Awaited<ReturnType<typeof carregarBase>>;

/** O que as regras dizem de uma janela: segmentos, elegíveis, teto do mês, ocupação. Puro sobre a base. */
export function avaliarJanela(base: Base, janela: Janela, semanas = 1) {
  const proxima = proximaJanela(janela, undefined, semanas);
  const mes = proxima.data.slice(0, 7);
  const comprometido = comprometidoNoMes(base.campanhasComGasto, mes);

  const porSegmento = new Map<Segmento, string[]>(SEGMENTOS.map((s) => [s.id, []]));
  for (const c of base.clientes.clientes) {
    const seg = classificarCliente(c.origem, base.clientes.visitasDe(c.id), janela, base.hoje);
    if (seg) porSegmento.get(seg)!.push(c.id);
  }
  const elegiveisPorSegmento = new Map<Segmento, { elegiveis: string[]; recentes: string[] }>(
    SEGMENTOS.map((s) => [
      s.id,
      separarPorIntervalo(porSegmento.get(s.id)!, base.ultimaOferta, base.regras.dias_entre_ofertas),
    ]),
  );

  return {
    restaurante: base.restaurante,
    regras: base.regras,
    proxima,
    mes,
    tetoRestanteMes: Math.round((base.regras.teto_mes - comprometido) * 100) / 100,
    ocupacaoJanela: ocupacaoDaJanela(base.resumo, janela),
    porSegmento,
    elegiveisPorSegmento,
  };
}

export type ContextoJanela = {
  contagens: Record<Segmento, { total: number; elegiveis: number }>;
  ocupacaoJanela: number | null;
  tetoRestanteMes: number;
  mes: string;
  validade: string;
  regras: Regras;
  limiteValorFixo: number;
  ticketMedio: number;
  taxas: Taxas;               // para a projeção de retorno no formulário
  controlePct: number;        // % dos elegíveis que vai para o grupo de controle
  controleMinimo: number;     // abaixo disso não há controle
};

export function resumirContexto(ctx: ReturnType<typeof avaliarJanela>, janela: Janela, taxas: Taxas): ContextoJanela {
  const contagens = {} as ContextoJanela["contagens"];
  for (const s of SEGMENTOS) {
    contagens[s.id] = {
      total: ctx.porSegmento.get(s.id)!.length,
      elegiveis: ctx.elegiveisPorSegmento.get(s.id)!.elegiveis.length,
    };
  }
  return {
    contagens,
    ocupacaoJanela: ctx.ocupacaoJanela,
    tetoRestanteMes: ctx.tetoRestanteMes,
    mes: ctx.mes,
    validade: formatarJanela(ctx.proxima.data, janela.inicio, janela.fim),
    regras: ctx.regras,
    limiteValorFixo: limiteValorFixo(ctx.regras, ctx.restaurante),
    ticketMedio: ctx.restaurante.ticket_medio,
    taxas,
    controlePct: CONTROLE_PCT,
    controleMinimo: CONTROLE_MIN_ELEGIVEIS,
  };
}

/** Quantos dos elegíveis vão para o controle (os demais recebem o benefício). */
export const tamanhoControle = (elegiveis: number) =>
  elegiveis >= CONTROLE_MIN_ELEGIVEIS ? Math.round((elegiveis * CONTROLE_PCT) / 100) : 0;

/** Contagem por segmento e números de contexto para o formulário. */
export async function contextoDaJanela(janela: Janela): Promise<ContextoJanela> {
  const base = await carregarBase();
  return resumirContexto(avaliarJanela(base, janela), janela, base.taxas);
}

export type Avaliacao =
  | {
      ok: true;
      proposta: PropostaCampanha;
      ctx: ReturnType<typeof avaliarJanela>;
      elegiveis: string[];
      recentes: string[];
    }
  | { ok: false; bloqueios: Bloqueio[] };

/**
 * Todas as regras, sem gravar nada. Formulário, planejador e aprovação passam
 * por aqui; `criarCampanha` só grava o que esta função aprovou.
 */
export function avaliarProposta(entrada: unknown, base: Base): Avaliacao {
  const lida = lerProposta(entrada);
  if ("bloqueios" in lida) return { ok: false, bloqueios: lida.bloqueios };
  const p = lida.proposta;
  const ctx = avaliarJanela(base, janelaDa(p), p.semanas);

  const bloqueios = validarProposta(p, {
    restaurante: ctx.restaurante,
    regras: ctx.regras,
    ocupacaoJanela: ctx.ocupacaoJanela,
    tetoRestanteMes: ctx.tetoRestanteMes,
    mes: ctx.mes,
  });

  const alvo = ctx.porSegmento.get(p.segmento)!;
  const { elegiveis, recentes } = ctx.elegiveisPorSegmento.get(p.segmento)!;
  if (alvo.length === 0) {
    bloqueios.push({ regra: "dados", mensagem: "Nenhum cliente nesse segmento para essa janela." });
  } else if (elegiveis.length === 0) {
    bloqueios.push({
      regra: "dias_entre_ofertas",
      mensagem: `Os ${alvo.length} clientes do segmento receberam oferta há menos de ${ctx.regras.dias_entre_ofertas} dias.`,
    });
  }
  if (bloqueios.length) return { ok: false, bloqueios };
  return { ok: true, proposta: p, ctx, elegiveis, recentes };
}

export type ResultadoCriacao =
  | {
      ok: true;
      campanhaId: string;
      emitidos: number;
      controle: number;
      foraPorIntervalo: number;
      validade: string;
      regras: Regras;
      kit: { gerado: boolean; modelo: string | null };
    }
  | { ok: false; bloqueios: Bloqueio[] };

/**
 * Única porta de entrada para criar campanha. Recebe o registro de qualquer criador
 * (formulário hoje, planejador amanhã), valida contra `regras` e emite os benefícios.
 * Se uma regra bloqueia, nada é gravado e a resposta diz o que e por quê.
 */
export async function criarCampanha(entrada: unknown, id = RESTAURANTE_DEMO_ID): Promise<ResultadoCriacao> {
  const av = avaliarProposta(entrada, await carregarBase(id));
  if (!av.ok) return av;
  const { proposta: p, ctx, elegiveis, recentes } = av;

  const db = supabaseServidor();
  const { data: campanha, error } = await db
    .from("campanhas")
    .insert({
      restaurante_id: id,
      dia_semana: p.dia_semana,
      hora_inicio: timeDaHora(p.hora_inicio),
      hora_fim: timeDaHora(p.hora_fim),
      segmento: p.segmento,
      tipo: p.tipo,
      valor: p.valor,
      teto: p.teto,
      status: "ativa",
      data_janela: ctx.proxima.data,
      semanas: p.semanas,
      controle_pct: tamanhoControle(elegiveis.length) ? CONTROLE_PCT : 0,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Grupo de controle: sorteio de 20% dos elegíveis, que não recebem o benefício.
  const { tratados, controle } = tamanhoControle(elegiveis.length)
    ? sortearControle(elegiveis, CONTROLE_PCT, () => randomInt(1_000_000) / 1_000_000)
    : { tratados: elegiveis, controle: [] as string[] };

  const codigos = gerarCodigos(tratados.length, () => randomInt(10_000));
  const linhas = tratados.map((cliente_id, i) => ({
    campanha_id: campanha.id,
    cliente_id,
    codigo: codigos[i],
    valido_de: ctx.proxima.valido_de,
    valido_ate: ctx.proxima.valido_ate,
    status: "emitido",
  }));
  const [emissao, ctrl] = await Promise.all([
    db.from("beneficios").insert(linhas),
    controle.length
      ? db.from("controles").insert(controle.map((cliente_id) => ({ campanha_id: campanha.id, cliente_id })))
      : Promise.resolve({ error: null }),
  ]);
  if (emissao.error || ctrl.error) {
    await db.from("campanhas").delete().eq("id", campanha.id);
    throw emissao.error ?? ctrl.error;
  }

  // Kit de ativação: uma vez, logo depois da emissão. gerarKit nunca lança; se tudo
  // falhar, a campanha segue criada e o painel mostra que ela está sem kit.
  const kit = await gerarKit(
    campanha.id,
    entradaKit(
      { nome: ctx.restaurante.nome, cozinha: ctx.restaurante.cozinha, ticket_medio: ctx.restaurante.ticket_medio },
      p,
      textoBeneficio(p.tipo, p.valor),
    ),
    { tipo: p.tipo, valor: p.valor },
  );

  return {
    ok: true,
    campanhaId: campanha.id,
    emitidos: tratados.length,
    controle: controle.length,
    foraPorIntervalo: recentes.length,
    validade: formatarValidade(ctx.proxima.datas, p.hora_inicio, p.hora_fim),
    regras: ctx.regras,
    kit: { gerado: !!kit, modelo: kit?.modelo ?? null },
  };
}
