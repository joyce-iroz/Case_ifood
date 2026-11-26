import "server-only";
// Planejador de campanhas. O modelo escolhe dentro de um cardápio calculado em código;
// a proposta validada vira uma PropostaCampanha e, ao aprovar, segue por criarCampanha,
// o mesmo caminho do formulário manual.
import { supabaseServidor } from "./supabase/server";
import { paginar } from "./dados";
import { RESTAURANTE_DEMO_ID, formatarHora, formatarJanela, NOMES_DIA } from "./dominio";
import { avaliarJanela, avaliarProposta, carregarBase, criarCampanha, type Base, type ResultadoCriacao } from "./emissao";
import { gerarJson, modeloConfigurado, SemChaveError } from "./gemini";
import { calcularCandidatas } from "./janelas";
import {
  JANELAS_NO_CARDAPIO,
  MAX_TENTATIVAS,
  montarCardapio,
  opcoesValor,
  propostaFallback,
  validarSaida,
  type Cardapio,
  type SaidaModelo,
} from "./planejador-regras";
import { textoBeneficio, type PropostaCampanha } from "./campanha";
import { SEGMENTOS, rotuloSegmento, type Segmento } from "./segmentos";
import { EntradaInvalidaError } from "./resgate";

const INSTRUCAO = `Você planeja UMA campanha de benefício para um restaurante encher mesas vazias.
Você não calcula números e não decide valores de dinheiro: escolhe entre as opções do JSON de entrada, que já foram calculadas e validadas por código.

Responda só com um objeto JSON, sem nenhum texto fora dele, com exatamente estas chaves:
dia_semana, hora_inicio, hora_fim, segmento, tipo, valor, clientes_alvo, custo_maximo, justificativa.

- dia_semana, hora_inicio e hora_fim: copie exatamente de UMA entrada de janelas_candidatas.
- segmento: uma das chaves de "segmentos" dessa mesma janela, com elegiveis maior que zero.
- clientes_alvo: copie o número "elegiveis" desse segmento nessa janela.
- tipo: "desconto_percentual" ou "desconto_valor". valor: um número da lista correspondente em valores_permitidos. Não use um tipo cuja lista esteja vazia.
- custo_maximo: um número da lista custos_maximos_permitidos dessa janela.
- justificativa: duas ou três frases em português do Brasil, citando a ocupação média da janela e por que esse segmento. Use só números que aparecem na entrada.

Clientes do segmento frequenta_janela já vêm nesse horário; um benefício para eles quase nunca traz cliente a mais.
Se a entrada tiver "erros_da_tentativa_anterior", corrija exatamente esses pontos.`;

export type TentativaView = { numero: number; resposta: string | null; aprovada: boolean; erros: string[]; ms: number | null };

export type ApresentacaoProposta = {
  janela: string;          // "Ter 18h30–20h"
  validade: string;        // "ter 01/12, 18h30–20h"
  ocupacao: number;
  cadeirasVazias: number;
  segmento: Segmento;
  segmentoRotulo: string;
  tipo: PropostaCampanha["tipo"];
  valor: number;
  beneficio: string;
  clientesAlvo: number;
  elegiveis: number;
  custoMaximo: number;
  justificativa: string;
  notas: string[];
  opcoesValor: number[];   // para "Ajustar valor", do mesmo tipo
};

export type PlanejamentoView = {
  id: string;
  criadoEm: string;
  origem: "modelo" | "fallback" | "nenhuma";
  modelo: string | null;
  status: "proposta" | "aprovada" | "descartada" | "sem_proposta";
  apresentacao: (ApresentacaoProposta & { motivo?: undefined }) | { motivo: string } | null;
  valorAprovado: number | null;
  campanhaId: string | null;
  tentativas: TentativaView[];
};

/** Janelas candidatas da base, com saldo do mês e elegíveis por segmento de cada uma. */
function cardapioDaBase(base: Base): { cardapio: Cardapio; total: number } {
  const candidatas = calcularCandidatas(base.resumo, base.restaurante, base.regras.ocupacao_min);
  const janelas = candidatas.slice(0, JANELAS_NO_CARDAPIO).map((c) => {
    const ctx = avaliarJanela(base, { dia: c.dia, inicio: c.inicio, fim: c.fim });
    const elegiveis = Object.fromEntries(
      SEGMENTOS.map((s) => [s.id, ctx.elegiveisPorSegmento.get(s.id)!.elegiveis.length]),
    ) as Record<Segmento, number>;
    return {
      candidata: c,
      elegiveis,
      saldo: Math.max(0, ctx.tetoRestanteMes),
      validade: formatarJanela(ctx.proxima.data, c.inicio, c.fim),
    };
  });
  return { cardapio: montarCardapio(base.restaurante, base.regras, janelas), total: candidatas.length };
}

function apresentar(
  saida: SaidaModelo,
  proposta: PropostaCampanha,
  cardapio: Cardapio,
  notas: string[],
): ApresentacaoProposta {
  const j = cardapio.janelas_candidatas.find(
    (x) => x.dia_semana === saida.dia_semana && x.hora_inicio === saida.hora_inicio && x.hora_fim === saida.hora_fim,
  )!;
  return {
    janela: `${NOMES_DIA[proposta.dia_semana]} ${formatarHora(proposta.hora_inicio)}–${formatarHora(proposta.hora_fim)}`,
    validade: j.validade,
    ocupacao: j.ocupacao_media_pct,
    cadeirasVazias: j.cadeiras_hora_vazias,
    segmento: proposta.segmento,
    segmentoRotulo: rotuloSegmento(proposta.segmento),
    tipo: proposta.tipo,
    valor: proposta.valor,
    beneficio: textoBeneficio(proposta.tipo, proposta.valor),
    clientesAlvo: saida.clientes_alvo,
    elegiveis: j.segmentos[proposta.segmento].elegiveis,
    custoMaximo: proposta.teto,
    justificativa: saida.justificativa,
    notas,
    opcoesValor:
      proposta.tipo === "percentual"
        ? cardapio.valores_permitidos.desconto_percentual
        : cardapio.valores_permitidos.desconto_valor,
  };
}

/**
 * Um clique em "Gerar proposta": até 3 chamadas ao modelo, cada resposta validada
 * em código; se nenhuma passar, regra fixa. Tudo fica registrado.
 */
export async function gerarProposta(id = RESTAURANTE_DEMO_ID): Promise<PlanejamentoView> {
  const base = await carregarBase(id);
  const { cardapio } = cardapioDaBase(base);
  const tentativas: TentativaView[] = [];
  let escolhida: { saida: SaidaModelo; proposta: PropostaCampanha; notas: string[] } | null = null;
  let origem: PlanejamentoView["origem"] = "modelo";
  let motivo: string | null = null;

  if (cardapio.janelas_candidatas.length === 0) {
    origem = "nenhuma";
    motivo = `Nenhuma janela está abaixo da ocupação mínima de ${base.regras.ocupacao_min}%. Não há o que planejar.`;
  } else {
    let errosAnteriores: string[] = [];
    for (let n = 1; n <= MAX_TENTATIVAS; n++) {
      const t0 = Date.now();
      const entrada = errosAnteriores.length ? { ...cardapio, erros_da_tentativa_anterior: errosAnteriores } : cardapio;
      let resposta: string | null = null;
      let erros: string[] = [];
      try {
        resposta = await gerarJson(INSTRUCAO, JSON.stringify(entrada));
        const v = validarSaida(resposta, cardapio);
        if (!v.ok) erros = v.erros;
        else {
          // Mesmo que passe no cardápio, a proposta ainda passa por todas as regras de campanha.
          const av = avaliarProposta(v.proposta, base);
          if (!av.ok) erros = av.bloqueios.map((b) => b.mensagem);
          else escolhida = { saida: v.saida, proposta: v.proposta, notas: [] };
        }
      } catch (e) {
        erros = [e instanceof Error ? e.message : String(e)];
        tentativas.push({ numero: n, resposta, aprovada: false, erros, ms: Date.now() - t0 });
        if (e instanceof SemChaveError) break; // sem chave, tentar de novo não muda nada
        errosAnteriores = [];
        continue;
      }
      tentativas.push({ numero: n, resposta, aprovada: !!escolhida, erros, ms: Date.now() - t0 });
      if (escolhida) break;
      errosAnteriores = erros;
    }

    if (!escolhida) {
      origem = "fallback";
      const fb = propostaFallback(cardapio);
      if (fb) {
        const av = avaliarProposta(fb.proposta, base);
        if (av.ok) escolhida = fb;
        else motivo = `A regra fixa também foi bloqueada: ${av.bloqueios.map((b) => b.mensagem).join(" ")}`;
      } else {
        motivo = "A regra fixa não encontrou janela com clientes elegíveis e saldo no teto do mês.";
      }
    }
  }

  const apresentacao = escolhida
    ? apresentar(escolhida.saida, escolhida.proposta, cardapio, escolhida.notas)
    : { motivo: motivo ?? "Sem proposta." };

  const db = supabaseServidor();
  // Uma proposta aguardando decisão por vez: a nova substitui a anterior.
  const sub = await db
    .from("planejamentos")
    .update({ status: "descartada", decidido_em: new Date().toISOString() })
    .eq("restaurante_id", id)
    .eq("status", "proposta");
  if (sub.error) throw sub.error;
  const { data: plan, error } = await db
    .from("planejamentos")
    .insert({
      restaurante_id: id,
      origem,
      modelo: tentativas.length ? modeloConfigurado() : null,
      proposta: escolhida?.proposta ?? null,
      apresentacao,
      status: escolhida ? "proposta" : "sem_proposta",
    })
    .select("id, criado_em")
    .single();
  if (error) throw error;
  if (tentativas.length) {
    const r = await db.from("planejamento_tentativas").insert(
      tentativas.map((t) => ({
        planejamento_id: plan.id,
        numero: t.numero,
        resposta: t.resposta,
        aprovada: t.aprovada,
        erros: t.erros,
        ms: t.ms,
      })),
    );
    if (r.error) throw r.error;
  }

  return {
    id: plan.id,
    criadoEm: plan.criado_em,
    origem,
    modelo: tentativas.length ? modeloConfigurado() : null,
    status: escolhida ? "proposta" : "sem_proposta",
    apresentacao,
    valorAprovado: null,
    campanhaId: null,
    tentativas,
  };
}

/** Janelas candidatas cruas, para GET /api/janelas. */
export async function listarJanelas(id = RESTAURANTE_DEMO_ID) {
  const base = await carregarBase(id);
  const candidatas = calcularCandidatas(base.resumo, base.restaurante, base.regras.ocupacao_min);
  const { cardapio } = cardapioDaBase(base);
  return {
    criterio: {
      ocupacao_min: base.regras.ocupacao_min,
      ordem: "cadeiras-hora vazias em número absoluto, maior primeiro",
      duracao: "de 1h a 3h, em passos de 30 minutos",
      margem: "sem os primeiros e os últimos 30 minutos de cada turno",
      enviadas_ao_modelo: cardapio.janelas_candidatas.length,
    },
    total: candidatas.length,
    janelas: candidatas,
    cardapio,
    valores_permitidos: opcoesValor(base.regras, base.restaurante),
  };
}

type LinhaPlanejamento = {
  id: string;
  criado_em: string;
  origem: PlanejamentoView["origem"];
  modelo: string | null;
  proposta: PropostaCampanha | null;
  apresentacao: PlanejamentoView["apresentacao"];
  status: PlanejamentoView["status"];
  valor_aprovado: number | null;
  campanha_id: string | null;
};

/** Últimos planejamentos com as tentativas, para o registro de auditoria. */
export async function listarPlanejamentos(limite = 10, id = RESTAURANTE_DEMO_ID): Promise<PlanejamentoView[]> {
  const db = supabaseServidor();
  const { data, error } = await db
    .from("planejamentos")
    .select("id, criado_em, origem, modelo, proposta, apresentacao, status, valor_aprovado, campanha_id")
    .eq("restaurante_id", id)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  const planos = (data ?? []) as LinhaPlanejamento[];
  const ids = planos.map((p) => p.id);
  const tentativas = ids.length
    ? await paginar<{ planejamento_id: string; numero: number; resposta: string | null; aprovada: boolean; erros: string[]; ms: number | null }>(
        (i, f) =>
          db
            .from("planejamento_tentativas")
            .select("planejamento_id, numero, resposta, aprovada, erros, ms")
            .in("planejamento_id", ids)
            .order("id")
            .range(i, f),
      )
    : [];
  return planos.map((p) => ({
    id: p.id,
    criadoEm: p.criado_em,
    origem: p.origem,
    modelo: p.modelo,
    status: p.status,
    apresentacao: p.apresentacao,
    valorAprovado: p.valor_aprovado === null ? null : Number(p.valor_aprovado),
    campanhaId: p.campanha_id,
    tentativas: tentativas
      .filter((t) => t.planejamento_id === p.id)
      .map((t) => ({ numero: t.numero, resposta: t.resposta, aprovada: t.aprovada, erros: t.erros ?? [], ms: t.ms })),
  }));
}

/**
 * Aprovar: pega a proposta gravada (não a que o navegador mandar), aplica o valor
 * ajustado se houver e chama criarCampanha, o mesmo caminho do formulário.
 */
export async function aprovarPlanejamento(
  planejamentoId: string,
  valorAjustado: unknown,
): Promise<ResultadoCriacao | { ok: false; bloqueios: { regra: "dados"; mensagem: string }[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(planejamentoId)) throw new EntradaInvalidaError("Proposta inválida.");
  const db = supabaseServidor();
  const { data: plan, error } = await db
    .from("planejamentos")
    .select("id, status, proposta")
    .eq("id", planejamentoId)
    .maybeSingle();
  if (error) throw error;
  if (!plan || !plan.proposta) throw new EntradaInvalidaError("Proposta não encontrada.");
  if (plan.status !== "proposta")
    return { ok: false, bloqueios: [{ regra: "dados", mensagem: `Esta proposta já foi ${plan.status}.` }] };

  const proposta = { ...(plan.proposta as PropostaCampanha) };
  const ajustou = valorAjustado !== undefined && valorAjustado !== null && valorAjustado !== "";
  if (ajustou) proposta.valor = Number(valorAjustado);

  // Trava contra clique duplo: só um pedido muda de 'proposta' para 'aprovada'.
  const { data: travou, error: e2 } = await db
    .from("planejamentos")
    .update({ status: "aprovada", decidido_em: new Date().toISOString() })
    .eq("id", planejamentoId)
    .eq("status", "proposta")
    .select("id");
  if (e2) throw e2;
  if (!travou?.length) return { ok: false, bloqueios: [{ regra: "dados", mensagem: "Esta proposta já foi decidida." }] };

  let r: ResultadoCriacao;
  try {
    r = await criarCampanha(proposta);
  } catch (e) {
    await db.from("planejamentos").update({ status: "proposta", decidido_em: null }).eq("id", planejamentoId);
    throw e;
  }
  if (!r.ok) {
    await db.from("planejamentos").update({ status: "proposta", decidido_em: null }).eq("id", planejamentoId);
    return r;
  }
  await db
    .from("planejamentos")
    .update({ campanha_id: r.campanhaId, valor_aprovado: ajustou ? proposta.valor : null })
    .eq("id", planejamentoId);
  return r;
}

export async function descartarPlanejamento(planejamentoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(planejamentoId)) throw new EntradaInvalidaError("Proposta inválida.");
  const { error } = await supabaseServidor()
    .from("planejamentos")
    .update({ status: "descartada", decidido_em: new Date().toISOString() })
    .eq("id", planejamentoId)
    .eq("status", "proposta");
  if (error) throw error;
  return { ok: true };
}
