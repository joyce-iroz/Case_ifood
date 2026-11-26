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
  proximaJanela,
  separarPorIntervalo,
  validarProposta,
  type Bloqueio,
  type PropostaCampanha,
  type Regras,
} from "./campanha";
import { SEGMENTOS, classificarCliente, type Janela, type Segmento } from "./segmentos";
import type { ResumoOcupacao } from "./ocupacao";

/** Média das células da grade que caem na janela, ou null se não houver histórico. */
function ocupacaoDaJanela(resumo: ResumoOcupacao, j: Janela): number | null {
  const cel = resumo.celulas.filter((c) => c.dia === j.dia && c.hora >= j.inicio && c.hora < j.fim);
  if (!cel.length) return null;
  return Math.round((cel.reduce((s, c) => s + c.percentual, 0) / cel.length) * 10) / 10;
}

/** Tudo o que as regras precisam para avaliar uma janela. Uma leitura, vários usos. */
async function montarContexto(janela: Janela, id = RESTAURANTE_DEMO_ID) {
  const hoje = hojeNoFuso();
  const restaurante = await carregarRestaurante(id);
  const [regras, resumo, base, campanhasCompletas] = await Promise.all([
    carregarRegras(id),
    obterResumoOcupacao(id, restaurante),
    carregarClientesComVisitas(id),
    carregarCampanhasCompletas(id),
  ]);

  const proxima = proximaJanela(janela);
  const mes = proxima.data.slice(0, 7);
  const gastoPorCampanha = new Map<string, number>();
  const campanhaDoBeneficio = new Map(campanhasCompletas.beneficios.map((b) => [b.id, b.campanha_id]));
  for (const r of campanhasCompletas.resgates) {
    const c = campanhaDoBeneficio.get(r.beneficio_id)!;
    gastoPorCampanha.set(c, (gastoPorCampanha.get(c) ?? 0) + r.desconto);
  }
  const comprometido = comprometidoNoMes(
    campanhasCompletas.campanhas.map((c) => ({ ...c, gasto: gastoPorCampanha.get(c.id) ?? 0 })),
    mes,
  );

  const ultimaOferta = new Map<string, string>();
  for (const b of campanhasCompletas.beneficios) {
    const atual = ultimaOferta.get(b.cliente_id);
    if (!atual || b.criado_em > atual) ultimaOferta.set(b.cliente_id, b.criado_em);
  }

  const porSegmento = new Map<Segmento, string[]>(SEGMENTOS.map((s) => [s.id, []]));
  for (const c of base.clientes) {
    const seg = classificarCliente(c.origem, base.visitasDe(c.id), janela, hoje);
    if (seg) porSegmento.get(seg)!.push(c.id);
  }

  return {
    restaurante,
    regras,
    proxima,
    mes,
    tetoRestanteMes: Math.round((regras.teto_mes - comprometido) * 100) / 100,
    ocupacaoJanela: ocupacaoDaJanela(resumo, janela),
    porSegmento,
    ultimaOferta,
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

/** Contagem por segmento e números de contexto para o formulário. */
export async function contextoDaJanela(janela: Janela): Promise<ContextoJanela> {
  const ctx = await montarContexto(janela);
  const contagens = {} as ContextoJanela["contagens"];
  for (const s of SEGMENTOS) {
    const ids = ctx.porSegmento.get(s.id)!;
    const { elegiveis } = separarPorIntervalo(ids, ctx.ultimaOferta, ctx.regras.dias_entre_ofertas);
    contagens[s.id] = { total: ids.length, elegiveis: elegiveis.length };
  }
  return {
    contagens,
    ocupacaoJanela: ctx.ocupacaoJanela,
    tetoRestanteMes: ctx.tetoRestanteMes,
    mes: ctx.mes,
    validade: formatarJanela(ctx.proxima.data, janela.inicio, janela.fim),
    regras: ctx.regras,
    limiteValorFixo: Math.round(ctx.restaurante.ticket_medio * ctx.regras.desconto_max) / 100,
    ticketMedio: ctx.restaurante.ticket_medio,
  };
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
  const lida = lerProposta(entrada);
  if ("bloqueios" in lida) return { ok: false, bloqueios: lida.bloqueios };
  const p: PropostaCampanha = lida.proposta;
  const janela = janelaDa(p);
  const ctx = await montarContexto(janela, id);

  const bloqueios = validarProposta(p, {
    restaurante: ctx.restaurante,
    regras: ctx.regras,
    ocupacaoJanela: ctx.ocupacaoJanela,
    tetoRestanteMes: ctx.tetoRestanteMes,
    mes: ctx.mes,
  });

  const alvo = ctx.porSegmento.get(p.segmento)!;
  const { elegiveis, recentes } = separarPorIntervalo(alvo, ctx.ultimaOferta, ctx.regras.dias_entre_ofertas);
  if (alvo.length === 0) {
    bloqueios.push({ regra: "dados", mensagem: "Nenhum cliente nesse segmento para essa janela." });
  } else if (elegiveis.length === 0) {
    bloqueios.push({
      regra: "dias_entre_ofertas",
      mensagem: `Os ${alvo.length} clientes do segmento receberam oferta há menos de ${ctx.regras.dias_entre_ofertas} dias.`,
    });
  }
  if (bloqueios.length) return { ok: false, bloqueios };

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
