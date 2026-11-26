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
import { RESTAURANTE_DEMO_ID, formatarJanela, hojeNoFuso, timeDaHora } from "./dominio";
import {
  comprometidoNoMes,
  gerarCodigos,
  janelaDa,
  lerProposta,
  limiteValorFixo,
  proximaJanela,
  separarPorIntervalo,
  validarProposta,
  type Bloqueio,
  type PropostaCampanha,
  type Regras,
} from "./campanha";
import { SEGMENTOS, classificarCliente, type Janela, type Segmento } from "./segmentos";
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
  for (const b of campanhasCompletas.beneficios) {
    const atual = ultimaOferta.get(b.cliente_id);
    if (!atual || b.criado_em > atual) ultimaOferta.set(b.cliente_id, b.criado_em);
  }

  return { id, hoje, restaurante, regras, resumo, clientes: base, campanhasComGasto, ultimaOferta };
}

export type Base = Awaited<ReturnType<typeof carregarBase>>;

/** O que as regras dizem de uma janela: segmentos, elegíveis, teto do mês, ocupação. Puro sobre a base. */
export function avaliarJanela(base: Base, janela: Janela) {
  const proxima = proximaJanela(janela);
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
};

export function resumirContexto(ctx: ReturnType<typeof avaliarJanela>, janela: Janela): ContextoJanela {
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
  };
}

/** Contagem por segmento e números de contexto para o formulário. */
export async function contextoDaJanela(janela: Janela): Promise<ContextoJanela> {
  return resumirContexto(avaliarJanela(await carregarBase(), janela), janela);
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
  const ctx = avaliarJanela(base, janelaDa(p));

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
      foraPorIntervalo: number;
      validade: string;
      regras: Regras;
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
    })
    .select("id")
    .single();
  if (error) throw error;

  const codigos = gerarCodigos(elegiveis.length, () => randomInt(10_000));
  const linhas = elegiveis.map((cliente_id, i) => ({
    campanha_id: campanha.id,
    cliente_id,
    codigo: codigos[i],
    valido_de: ctx.proxima.valido_de,
    valido_ate: ctx.proxima.valido_ate,
    status: "emitido",
  }));
  const emissao = await db.from("beneficios").insert(linhas);
  if (emissao.error) {
    await db.from("campanhas").delete().eq("id", campanha.id);
    throw emissao.error;
  }

  return {
    ok: true,
    campanhaId: campanha.id,
    emitidos: elegiveis.length,
    foraPorIntervalo: recentes.length,
    validade: formatarJanela(ctx.proxima.data, p.hora_inicio, p.hora_fim),
    regras: ctx.regras,
  };
}
