import "server-only";
// Planejador de campanhas. O modelo escolhe 3 alternativas dentro de um cardápio
// calculado em código; o dono escolhe uma, pode editá-la dentro do mesmo cardápio,
// e a aprovação segue por criarCampanha, o mesmo caminho do formulário manual.
import { supabaseServidor } from "./supabase/server";
import { paginar } from "./dados";
import { RESTAURANTE_DEMO_ID, formatarHora, formatarJanela, NOMES_DIA } from "./dominio";
import { avaliarJanela, avaliarProposta, carregarBase, criarCampanha, tamanhoControle, type Base, type ResultadoCriacao } from "./emissao";
import { projetar, type Projecao } from "./projecao";
import { gerarJson, LimiteError, modeloConfigurado, SemChaveError } from "./llm";
import { calcularCandidatas, espalharPorDia } from "./janelas";
import {
  JANELAS_NO_CARDAPIO,
  MAX_TENTATIVAS,
  montarCardapio,
  opcoesValor,
  propostaFallback,
  validarAlternativas,
  validarContraCardapio,
  chaveCombo,
  paraContrato,
  cardapioParaModelo,
  type Cardapio,
  type FatoSegmento,
  type SaidaModelo,
} from "./planejador-regras";
import { lerProposta, textoBeneficio, type Bloqueio, type PropostaCampanha } from "./campanha";
import { SEGMENTOS, rotuloSegmento, type Segmento } from "./segmentos";
import { EntradaInvalidaError } from "./resgate";

const INSTRUCAO = `Você planeja campanhas de benefício para um restaurante encher mesas vazias.
Você não calcula números e não decide valores de dinheiro: escolhe entre as opções do JSON de entrada, que já foram calculadas e validadas por código.

Responda só com um objeto JSON {"propostas": [...]} em que "propostas" é um array de exatamente 3 objetos, sem nenhum texto fora dele. Cada objeto tem exatamente estas chaves:
aposta, dia_semana, hora_inicio, hora_fim, segmento, tipo, valor, clientes_alvo, custo_maximo, justificativa.

- aposta: rótulo curto do trade-off daquela alternativa, por exemplo "mais volume" (segmento maior), "mais barato" (desconto menor), "cliente novo" (delivery_nunca_veio).
- As 3 alternativas devem diferir em janela ou em segmento, não só no valor.
- dia_semana, hora_inicio e hora_fim: copie exatamente de UMA entrada de janelas_candidatas.
- segmento: o CÓDIGO, uma das chaves de "elegiveis" dessa mesma janela, com valor maior que zero (ex.: "delivery_nunca_veio"). Neste campo vai sempre o código, nunca o nome.
- clientes_alvo: copie o número de "elegiveis" desse segmento nessa janela.
- tipo: "desconto_percentual" ou "desconto_valor". valor: um número da lista correspondente em valores_permitidos. Não use um tipo cuja lista esteja vazia.
- custo_maximo: múltiplo de 50 entre custo_maximo_de e custo_maximo_ate dessa janela.
- semanas: um número de semanas_permitidas (por quantas semanas a janela se repete). Use 1 se não houver motivo para repetir.
- limite_por_conta: só para "desconto_percentual": um número de limites_por_conta (R$ máximo de desconto numa conta, como "20% até R$ 30") ou null. Com limite, uma conta grande não come o teto e as vagas ficam garantidas; prefira usar. Para "desconto_valor", null.
- justificativa: duas ou três frases em português do Brasil, específicas desta alternativa:
  1. o problema da janela, com números: ocupação média e cadeiras-hora vazias;
  2. por que este segmento, com um fato de "segmentos_fatos": taxa de resgate, efeito medido contra o controle ou a observação;
  3. o que esta alternativa ganha ou perde em relação às outras duas (a aposta).
  Cite pelo menos 2 números, todos copiados da entrada. Número que não está na entrada reprova a alternativa.
  Dentro do texto da justificativa (e só nela), chame o segmento pelo nome em "descricao", nunca pelo código (ex.: "pede delivery e nunca veio ao salão", não "delivery_nunca_veio").
  Não escreva frases que serviriam para qualquer restaurante, como "pode atrair novos clientes" sem dizer quantos nem por quê.

Clientes do segmento frequenta_janela já vêm nesse horário; um benefício para eles quase nunca traz cliente a mais.
Se a entrada tiver "propostas_ja_mostradas", o dono já viu essas combinações e pediu outras: nenhuma das 3 pode repetir a mesma janela com o mesmo segmento de uma delas.
Se a entrada tiver "erros_da_tentativa_anterior", corrija exatamente esses pontos.`;

export type TentativaView = { numero: number; resposta: string | null; aprovada: boolean; erros: string[]; ms: number | null };

export type Alternativa = {
  aposta: string;
  proposta: PropostaCampanha;
  janela: string;          // "Ter 18h30–20h"
  validade: string;        // "ter 01/12, 18h30–20h"
  ocupacao: number;
  cadeirasVazias: number;
  segmentoRotulo: string;
  beneficio: string;
  clientesAlvo: number;
  elegiveis: number;
  custoMaximo: number;
  justificativa: string;
  notas: string[];
  fatos?: string;          // calculados em código, mostrados acima da justificativa
  projecao?: Projecao;     // retorno esperado, mesma conta da prévia
};

export type PlanejamentoView = {
  id: string;
  criadoEm: string;
  origem: "modelo" | "fallback" | "nenhuma";
  modelo: string | null;
  status: "proposta" | "aprovada" | "descartada" | "sem_proposta";
  alternativas: Alternativa[];
  motivo: string | null;
  cardapio: Cardapio | null;
  alternativaAprovada: number | null;
  propostaAprovada: PropostaCampanha | null;
  editada: boolean | null;
  campanhaId: string | null;
  tentativas: TentativaView[];
};

/** Janelas candidatas da base, com saldo do mês e elegíveis por segmento de cada uma. */
/** O que se sabe de cada segmento, em código, para o modelo citar e o cartão mostrar. */
function fatosDosSegmentos(base: Base): Record<Segmento, FatoSegmento> {
  return Object.fromEntries(
    SEGMENTOS.map((s) => {
      const t = base.taxas[s.id];
      const e = base.efeitos[s.id];
      const r = base.fatosRegiao;
      return [
        s.id,
        {
          descricao: s.rotulo,
          taxa_resgate_pct: Math.round(t.resgate * 1000) / 10,
          fonte_taxa: t.base,
          efeito_medido_vs_controle_pts: e?.pts ?? null,
          observacao:
            s.id === "cozinha_similar" && r
              ? `pedem ${base.restaurante.cozinha} em outros restaurantes em média ${r.pedidosMedios} vezes em 60 dias, a ${r.distanciaMedia} km daqui, e nunca vieram`
              : s.id === "frequenta_janela"
                ? "já vêm nesse horário: o desconto vai para quem viria de qualquer jeito"
                : null,
        },
      ];
    }),
  ) as Record<Segmento, FatoSegmento>;
}

function cardapioDaBase(base: Base): Cardapio {
  const candidatas = calcularCandidatas(base.resumo, base.restaurante, base.regras.ocupacao_min);
  const janelas = espalharPorDia(candidatas, JANELAS_NO_CARDAPIO).map((c) => {
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
  return montarCardapio(base.restaurante, base.regras, janelas, fatosDosSegmentos(base));
}

function apresentar(
  saida: SaidaModelo,
  proposta: PropostaCampanha,
  cardapio: Cardapio,
  notas: string[],
  base: Base,
): Alternativa {
  const j = cardapio.janelas_candidatas.find(
    (x) => x.dia_semana === saida.dia_semana && x.hora_inicio === saida.hora_inicio && x.hora_fim === saida.hora_fim,
  )!;
  const elegiveis = j.segmentos[proposta.segmento].elegiveis;
  const f = cardapio.segmentos_fatos?.[proposta.segmento];
  const n = (v: number) => String(v).replace(".", ",");
  const fatos = [
    `${n(Math.round(j.ocupacao_media_pct))}% ocupada`,
    `${elegiveis} clientes`,
    f && `${n(f.taxa_resgate_pct)}% costumam usar${f.fonte_taxa === "historico" ? "" : " (estimativa)"}`,
    f?.efeito_medido_vs_controle_pts != null &&
      `${f.efeito_medido_vs_controle_pts > 0 ? "+" : ""}${n(f.efeito_medido_vs_controle_pts)} pts de efeito medido antes`,
    f?.observacao,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    fatos,
    projecao: projetarPara(proposta, elegiveis, base).projecao,
    aposta: saida.aposta,
    proposta,
    janela: `${NOMES_DIA[proposta.dia_semana]} ${formatarHora(proposta.hora_inicio)}–${formatarHora(proposta.hora_fim)}`,
    validade: j.validade,
    ocupacao: j.ocupacao_media_pct,
    cadeirasVazias: j.cadeiras_hora_vazias,
    segmentoRotulo: rotuloSegmento(proposta.segmento),
    beneficio: textoBeneficio(proposta.tipo, proposta.valor, proposta.limite_por_conta),
    clientesAlvo: saida.clientes_alvo,
    elegiveis: j.segmentos[proposta.segmento].elegiveis,
    custoMaximo: proposta.teto,
    justificativa: saida.justificativa,
    notas,
  };
}

/**
 * Um clique em "Gerar proposta": até 3 chamadas ao modelo. Cada alternativa é
 * validada sozinha (cardápio e avaliarProposta); basta uma sobrar para a tentativa
 * valer. Se nenhuma sobrar em 3 tentativas, regra fixa. Tudo fica registrado.
 */
export async function gerarProposta(id = RESTAURANTE_DEMO_ID): Promise<PlanejamentoView> {
  const base = await carregarBase(id);
  const cardapio = cardapioDaBase(base);
  const tentativas: TentativaView[] = [];

  // "Gerar outras": o modelo não aceita mais temperatura, então mesma entrada dá a mesma
  // saída. Mandamos as combinações das últimas gerações e descartamos repetições.
  const jaMostradasLista = await propostasRecentes(id);
  const jaMostradas = new Set(jaMostradasLista.map(chaveCombo));
  let alternativas: Alternativa[] = [];
  let origem: PlanejamentoView["origem"] = "modelo";
  let motivo: string | null = null;

  if (cardapio.janelas_candidatas.length === 0) {
    origem = "nenhuma";
    motivo = `Nenhuma janela está abaixo da ocupação mínima de ${base.regras.ocupacao_min}%. Não há o que planejar.`;
  } else {
    let errosAnteriores: string[] = [];
    for (let n = 1; n <= MAX_TENTATIVAS && !alternativas.length; n++) {
      const t0 = Date.now();
      const entrada = {
        ...cardapioParaModelo(cardapio),
        ...(jaMostradasLista.length ? { propostas_ja_mostradas: jaMostradasLista.map(paraContrato) } : {}),
        ...(errosAnteriores.length ? { erros_da_tentativa_anterior: errosAnteriores } : {}),
      };
      let resposta: string | null = null;
      const erros: string[] = [];
      try {
        resposta = await gerarJson(INSTRUCAO, JSON.stringify(entrada));
        const v = validarAlternativas(resposta, cardapio);
        erros.push(...v.erros);
        for (const alt of v.validas) {
          if (jaMostradas.has(chaveCombo(alt.proposta))) {
            erros.push(
              `"${alt.saida.aposta}": repete a janela ${alt.saida.dia_semana} ${alt.saida.hora_inicio}–${alt.saida.hora_fim} com o segmento ${alt.proposta.segmento}, que o dono já viu; proponha outra combinação`,
            );
            continue;
          }
          // Passou no cardápio; ainda passa por todas as regras de campanha.
          const av = avaliarProposta(alt.proposta, base);
          if (av.ok) alternativas.push(apresentar(alt.saida, alt.proposta, cardapio, [], base));
          else erros.push(...av.bloqueios.map((b) => `"${alt.saida.aposta}": ${b.mensagem}`));
        }
      } catch (e) {
        erros.push(e instanceof Error ? e.message : String(e));
        tentativas.push({ numero: n, resposta, aprovada: false, erros, ms: Date.now() - t0 });
        // Sem chave, tentar de novo não muda nada. Sem cota (429), a próxima tentativa
        // no mesmo minuto também cai no limite e ainda gasta tokens.
        if (e instanceof SemChaveError || e instanceof LimiteError) break;
        errosAnteriores = [];
        continue;
      }
      tentativas.push({ numero: n, resposta, aprovada: alternativas.length > 0, erros, ms: Date.now() - t0 });
      errosAnteriores = erros;
    }

    if (!alternativas.length) {
      origem = "fallback";
      const fb = propostaFallback(cardapio, jaMostradas);
      if (fb) {
        const av = avaliarProposta(fb.proposta, base);
        if (av.ok) alternativas = [apresentar(fb.saida, fb.proposta, cardapio, fb.notas, base)];
        else motivo = `A regra fixa também foi bloqueada: ${av.bloqueios.map((b) => b.mensagem).join(" ")}`;
      } else {
        motivo = "A regra fixa não encontrou janela com clientes elegíveis e saldo no teto de 30 dias.";
      }
    }
  }

  const db = supabaseServidor();
  // Uma proposta aguardando decisão por vez: a nova substitui a anterior.
  const sub = await db
    .from("planejamentos")
    .update({ status: "descartada", decidido_em: new Date().toISOString() })
    .eq("restaurante_id", id)
    .eq("status", "proposta");
  if (sub.error) throw sub.error;

  const status = alternativas.length ? "proposta" : "sem_proposta";
  const modelo = tentativas.length ? modeloConfigurado() : null;
  const { data: plan, error } = await db
    .from("planejamentos")
    .insert({
      restaurante_id: id,
      origem,
      modelo,
      cardapio,
      proposta: alternativas.map((a) => a.proposta),
      apresentacao: alternativas.length ? { alternativas, aprovada: null } : { motivo: motivo ?? "Sem proposta." },
      status,
    })
    .select("id, criado_em")
    .single();
  if (error) throw error;
  if (tentativas.length) {
    const r = await db.from("planejamento_tentativas").insert(
      tentativas.map((t) => ({ planejamento_id: plan.id, ...t })),
    );
    if (r.error) throw r.error;
  }

  return {
    id: plan.id,
    criadoEm: plan.criado_em,
    origem,
    modelo,
    status,
    alternativas,
    motivo: alternativas.length ? null : (motivo ?? "Sem proposta."),
    cardapio,
    alternativaAprovada: null,
    propostaAprovada: null,
    editada: null,
    campanhaId: null,
    tentativas,
  };
}

const GERACOES_LEMBRADAS = 3;

/** Alternativas das últimas gerações (qualquer status), para "Gerar outras" não repetir. */
async function propostasRecentes(id: string): Promise<PropostaCampanha[]> {
  const { data, error } = await supabaseServidor()
    .from("planejamentos")
    .select("proposta")
    .eq("restaurante_id", id)
    .order("criado_em", { ascending: false })
    .limit(GERACOES_LEMBRADAS);
  if (error) throw error;
  return (data ?? []).flatMap((p) => (Array.isArray(p.proposta) ? (p.proposta as PropostaCampanha[]) : []));
}

/** Janelas candidatas cruas, para GET /api/janelas. */
export async function listarJanelas(id = RESTAURANTE_DEMO_ID) {
  const base = await carregarBase(id);
  const candidatas = calcularCandidatas(base.resumo, base.restaurante, base.regras.ocupacao_min);
  const cardapio = cardapioDaBase(base);
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
  cardapio: Cardapio | null;
  apresentacao: { alternativas?: Alternativa[]; aprovada?: number | null; motivo?: string } | null;
  status: PlanejamentoView["status"];
  alternativa_aprovada: number | null;
  proposta_aprovada: PropostaCampanha | null;
  editada: boolean | null;
  campanha_id: string | null;
};

const COLUNAS =
  "id, criado_em, origem, modelo, cardapio, apresentacao, status, alternativa_aprovada, proposta_aprovada, editada, campanha_id";

function paraView(p: LinhaPlanejamento, tentativas: TentativaView[]): PlanejamentoView {
  return {
    id: p.id,
    criadoEm: p.criado_em,
    origem: p.origem,
    modelo: p.modelo,
    status: p.status,
    alternativas: p.apresentacao?.alternativas ?? [],
    motivo: p.apresentacao?.motivo ?? null,
    cardapio: p.cardapio,
    alternativaAprovada: p.alternativa_aprovada,
    propostaAprovada: p.proposta_aprovada,
    editada: p.editada,
    campanhaId: p.campanha_id,
    tentativas,
  };
}

/** Últimos planejamentos com as tentativas, para o registro de auditoria. */
export async function listarPlanejamentos(limite = 10, id = RESTAURANTE_DEMO_ID): Promise<PlanejamentoView[]> {
  const db = supabaseServidor();
  const { data, error } = await db
    .from("planejamentos")
    .select(COLUNAS)
    .eq("restaurante_id", id)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  const planos = (data ?? []) as LinhaPlanejamento[];
  const ids = planos.map((p) => p.id);
  const tentativas = ids.length
    ? await paginar<TentativaView & { planejamento_id: string }>((i, f) =>
        db
          .from("planejamento_tentativas")
          .select("planejamento_id, numero, resposta, aprovada, erros, ms")
          .in("planejamento_id", ids)
          .order("id")
          .range(i, f),
      )
    : [];
  return planos.map((p) =>
    paraView(
      p,
      tentativas
        .filter((t) => t.planejamento_id === p.id)
        .map((t) => ({ numero: t.numero, resposta: t.resposta, aprovada: t.aprovada, erros: t.erros ?? [], ms: t.ms })),
    ),
  );
}

async function carregarPlanejamento(planejamentoId: string): Promise<LinhaPlanejamento> {
  if (!/^[0-9a-f-]{36}$/i.test(planejamentoId)) throw new EntradaInvalidaError("Proposta inválida.");
  const { data, error } = await supabaseServidor().from("planejamentos").select(COLUNAS).eq("id", planejamentoId).maybeSingle();
  if (error) throw error;
  if (!data) throw new EntradaInvalidaError("Proposta não encontrada.");
  return data as LinhaPlanejamento;
}

/**
 * A proposta que chega do navegador é entrada não confiável: lida do zero, conferida
 * contra o cardápio gravado DAQUELE planejamento e contra todas as regras de campanha.
 */
function revalidar(
  entrada: unknown,
  plan: LinhaPlanejamento,
  base: Base,
): { ok: true; proposta: PropostaCampanha; av: Extract<ReturnType<typeof avaliarProposta>, { ok: true }> } | { ok: false; bloqueios: Bloqueio[] } {
  if (!plan.cardapio) return { ok: false, bloqueios: [{ regra: "cardapio", mensagem: "Este planejamento não tem cardápio." }] };
  const lida = lerProposta(entrada);
  if ("bloqueios" in lida) return { ok: false, bloqueios: lida.bloqueios };
  const { erros } = validarContraCardapio(lida.proposta, plan.cardapio);
  const bloqueios: Bloqueio[] = erros.map((mensagem) => ({ regra: "cardapio", mensagem }));
  const av = avaliarProposta(lida.proposta, base);
  if (!av.ok) bloqueios.push(...av.bloqueios);
  if (bloqueios.length || !av.ok) return { ok: false, bloqueios };
  return { ok: true, proposta: lida.proposta, av };
}

export type Previa = {
  ok: boolean;
  elegiveis: number | null;
  custoMaximo: number | null;
  saldoAntes: number | null;
  saldoDepois: number | null;
  mes: string | null;
  bloqueios: Bloqueio[];
  controle: number | null;      // quantos dos elegíveis vão para o grupo de controle
  projecao: Projecao | null;    // retorno esperado, pelo histórico do segmento
};

function projetarPara(p: PropostaCampanha, elegiveis: number, base: Base): { controle: number; projecao: Projecao } {
  const controle = tamanhoControle(elegiveis);
  return {
    controle,
    projecao: projetar({
      emitidos: elegiveis - controle,
      horas: p.hora_fim - p.hora_inicio,
      semanas: p.semanas,
      tipo: p.tipo,
      valor: p.valor,
      limite: p.limite_por_conta,
      teto: p.teto,
      ticketMedio: base.restaurante.ticket_medio,
      descontoMax: base.regras.desconto_max,
      taxa: base.taxas[p.segmento],
    }),
  };
}

/** Prévia ao vivo do editor: mesma revalidação da aprovação, sem gravar nada. */
export async function previaPlanejamento(planejamentoId: string, entrada: unknown): Promise<Previa> {
  const plan = await carregarPlanejamento(planejamentoId);
  const base = await carregarBase();
  const r = revalidar(entrada, plan, base);
  if (!r.ok) {
    // Mesmo bloqueada, mostra o que der para calcular, para o dono entender o porquê.
    const lida = lerProposta(entrada);
    if ("proposta" in lida) {
      const av = avaliarProposta(lida.proposta, base);
      const saldo = av.ok ? av.ctx.tetoRestanteMes : null;
      return {
        ...(av.ok ? projetarPara(lida.proposta, av.elegiveis.length, base) : { controle: null, projecao: null }),
        ok: false,
        elegiveis: av.ok ? av.elegiveis.length : null,
        custoMaximo: lida.proposta.teto,
        saldoAntes: saldo,
        saldoDepois: saldo === null ? null : Math.round((saldo - lida.proposta.teto) * 100) / 100,
        mes: av.ok ? av.ctx.mes : null,
        bloqueios: r.bloqueios,
      };
    }
    return {
      ok: false,
      elegiveis: null,
      custoMaximo: null,
      saldoAntes: null,
      saldoDepois: null,
      mes: null,
      bloqueios: r.bloqueios,
      controle: null,
      projecao: null,
    };
  }
  const saldo = r.av.ctx.tetoRestanteMes;
  return {
    ...projetarPara(r.proposta, r.av.elegiveis.length, base),
    ok: true,
    elegiveis: r.av.elegiveis.length,
    custoMaximo: r.proposta.teto,
    saldoAntes: saldo,
    saldoDepois: Math.round((saldo - r.proposta.teto) * 100) / 100,
    mes: r.av.ctx.mes,
    bloqueios: [],
  };
}

const mesma = (a: PropostaCampanha, b: PropostaCampanha) =>
  (["dia_semana", "hora_inicio", "hora_fim", "segmento", "tipo", "valor", "teto", "semanas"] as const).every((k) => a[k] === b[k]) &&
  (a.limite_por_conta ?? null) === (b.limite_por_conta ?? null);

/**
 * Aprovar: a proposta do navegador é revalidada inteira (cardápio daquele planejamento
 * + avaliarProposta) e só então vai para criarCampanha, o mesmo caminho do formulário.
 * Sem proposta no corpo, usa a alternativa gravada.
 */
export async function aprovarPlanejamento(planejamentoId: string, corpo: unknown): Promise<ResultadoCriacao> {
  const plan = await carregarPlanejamento(planejamentoId);
  if (plan.status !== "proposta")
    return { ok: false, bloqueios: [{ regra: "dados", mensagem: `Esta proposta já foi ${plan.status}.` }] };

  const c = (corpo ?? {}) as { indice?: unknown; proposta?: unknown };
  const alternativas = plan.apresentacao?.alternativas ?? [];
  const indice = Number(c.indice ?? 0);
  if (!Number.isInteger(indice) || indice < 0 || indice >= alternativas.length)
    return { ok: false, bloqueios: [{ regra: "dados", mensagem: "Alternativa inválida." }] };
  const entrada = c.proposta ?? alternativas[indice].proposta;

  const base = await carregarBase();
  const r = revalidar(entrada, plan, base);
  if (!r.ok) return r;

  const db = supabaseServidor();
  // Trava contra clique duplo: só um pedido muda de 'proposta' para 'aprovada'.
  const { data: travou, error: e2 } = await db
    .from("planejamentos")
    .update({ status: "aprovada", decidido_em: new Date().toISOString() })
    .eq("id", planejamentoId)
    .eq("status", "proposta")
    .select("id");
  if (e2) throw e2;
  if (!travou?.length) return { ok: false, bloqueios: [{ regra: "dados", mensagem: "Esta proposta já foi decidida." }] };

  let resultado: ResultadoCriacao;
  try {
    resultado = await criarCampanha(r.proposta);
  } catch (e) {
    await db.from("planejamentos").update({ status: "proposta", decidido_em: null }).eq("id", planejamentoId);
    throw e;
  }
  if (!resultado.ok) {
    await db.from("planejamentos").update({ status: "proposta", decidido_em: null }).eq("id", planejamentoId);
    return resultado;
  }
  await db
    .from("planejamentos")
    .update({
      campanha_id: resultado.campanhaId,
      alternativa_aprovada: indice,
      proposta_aprovada: r.proposta,
      editada: !mesma(r.proposta, alternativas[indice].proposta),
      apresentacao: { ...plan.apresentacao, aprovada: indice },
    })
    .eq("id", planejamentoId);
  return resultado;
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
