import "server-only";
// Salão: consulta por telefone e resgate. Consulta direta ao banco, sem LLM.
import { supabaseServidor } from "./supabase/server";
import { aplicarNome } from "./kit-regras";
import { carregarRegras, carregarRestaurante, encerrarPorTeto, expirarVencidos, lerCampanha, lerResgate } from "./dados";
import { tetoEsgotado, valorDaVaga } from "./projecao";
import { guardarVaga, situacaoTeto } from "./vagas";
import { RESTAURANTE_DEMO_ID, agoraNoFuso, formatarValidade, somarDias } from "./dominio";
import { hashTelefone } from "./hash";
import { normalizarTelefone } from "./telefone";
import { lerCampoNumero } from "./numero";
import {
  fimDaProximaOcorrencia,
  DEMO_ACEITA_ANTES_DA_JANELA,
  dentroDeOcorrencia,
  ocorrencias,
  calcularDesconto,
  janelaDa,
  textoBeneficio,
  type TipoBeneficio,
} from "./campanha";
import { DIAS_RECENTES, visitouNaJanela } from "./segmentos";

export type RespostaConsulta =
  | {
      tipo: "ativo";
      beneficioId: string;
      nome: string;
      codigo: string;
      beneficio: string;          // "15% de desconto"
      validade: string;           // "ter 01/12, 18h–23h"
      antesDaJanela: boolean;     // só acontece em modo demo
      script: string | null;      // kit de ativação: o que dizer ao cliente
      calculo: { tipo: TipoBeneficio; valor: number; limite_por_conta: number | null; descontoMax: number; tetoRestante: number };
      // Vaga garantida: confirmou pela oferta, ou foi guardada agora, na chegada.
      reserva: { origem: "confirmacao" | "chegada"; ate: string; agora: boolean };
    }
  | { tipo: "nenhum"; motivo?: "sem_vaga" }
  | { tipo: "resgatado"; nome: string; resgatadoEm: string; valorConta: number; desconto: number };

export class EntradaInvalidaError extends Error {}

const BENEFICIO_COM_CAMPANHA =
  "id, campanha_id, cliente_id, codigo, valido_de, valido_ate, status, criado_em, " +
  "campanhas!inner(id, restaurante_id, dia_semana, hora_inicio, hora_fim, segmento, tipo, valor, teto, limite_por_conta, status, data_janela, semanas, controle_pct, pausada_em, motivo_pausa, criado_em)";

export async function consultarTelefone(entrada: string, id = RESTAURANTE_DEMO_ID): Promise<RespostaConsulta> {
  const digitos = normalizarTelefone(entrada);
  if (!/^55\d{11}$/.test(digitos)) throw new EntradaInvalidaError("Digite DDD e número, 11 dígitos.");
  const db = supabaseServidor();
  await expirarVencidos();

  const { data: cliente, error } = await db
    .from("clientes")
    .select("id, nome")
    .eq("restaurante_id", id)
    .eq("telefone_hash", hashTelefone(digitos))
    .maybeSingle();
  if (error) throw error;
  if (!cliente) return { tipo: "nenhum" };

  const { data: lista, error: e2 } = await db
    .from("beneficios")
    .select(`reserva_ate, reserva_origem, ${BENEFICIO_COM_CAMPANHA}`)
    .eq("cliente_id", cliente.id)
    .order("criado_em", { ascending: false })
    .limit(20);
  if (e2) throw e2;
  const beneficios = (lista ?? []) as unknown as (Record<string, unknown> & {
    id: string;
    codigo: string;
    status: string;
    valido_de: string;
    valido_ate: string;
    campanhas: Record<string, unknown>;
  })[];

  const agora = Date.now();
  const ativos = beneficios
    .filter(
      (b) =>
        b.status === "emitido" &&
        new Date(b.valido_ate).getTime() > agora &&
        (DEMO_ACEITA_ANTES_DA_JANELA || new Date(b.valido_de).getTime() <= agora),
    )
    .sort((a, b) => a.valido_de.localeCompare(b.valido_de));

  if (ativos.length) {
    const b = ativos[0] as (typeof ativos)[number] & { reserva_ate: string | null; reserva_origem: "confirmacao" | "chegada" | null };
    const c = lerCampanha(b.campanhas);
    const [regras, kit, restaurante] = await Promise.all([
      carregarRegras(id),
      db.from("kits").select("script_garcom").eq("campanha_id", c.id).maybeSingle(),
      carregarRestaurante(id),
    ]);
    const vaga = valorDaVaga(c, restaurante.ticket_medio, regras.desconto_max);

    // Consultar no salão é a chegada: quem ainda não tem vaga guardada pega uma livre agora,
    // e quem chegar depois não a toma enquanto esta mesa come.
    let reserva: { origem: "confirmacao" | "chegada"; ate: string; agora: boolean };
    if (b.reserva_ate && new Date(b.reserva_ate).getTime() > agora && b.reserva_origem) {
      reserva = { origem: b.reserva_origem, ate: b.reserva_ate, agora: false };
    } else {
      const r = await guardarVaga(b.id, c, "chegada", vaga);
      if (r === "sem_vaga") {
        const { gasto, garantidas } = await situacaoTeto(c.id);
        // Teto gasto de vez (ninguém com vaga guardada): a campanha para, as ofertas expiram.
        if (garantidas === 0 && tetoEsgotado(c.teto, gasto, vaga)) await encerrarPorTeto(c.id, c.teto);
        return { tipo: "nenhum", motivo: "sem_vaga" };
      }
      if (r === "indisponivel") return { tipo: "nenhum" };
      reserva = { origem: "chegada", ate: fimDaProximaOcorrencia(c), agora: r === "reservado" };
    }
    const { gasto, garantidas } = await situacaoTeto(c.id, b.id);
    return {
      tipo: "ativo",
      beneficioId: b.id,
      nome: cliente.nome,
      codigo: b.codigo,
      beneficio: textoBeneficio(c.tipo, c.valor, c.limite_por_conta),
      validade: formatarValidade(ocorrencias(c.data_janela, c.semanas), c.hora_inicio, c.hora_fim),
      antesDaJanela: new Date(b.valido_de).getTime() > agora,
      script: kit.error || !kit.data?.script_garcom ? null : aplicarNome(kit.data.script_garcom, cliente.nome),
      // O que esta mesa pode levar: o teto menos o gasto e as vagas guardadas por outras.
      calculo: {
        tipo: c.tipo,
        valor: c.valor,
        limite_por_conta: c.limite_por_conta,
        descontoMax: regras.desconto_max,
        tetoRestante: c.teto - gasto - garantidas * vaga,
      },
      reserva,
    };
  }

  const ultimo = beneficios[0];
  if (ultimo?.status === "resgatado") {
    const { data: r, error: e3 } = await db
      .from("resgates")
      .select("valor_conta, desconto, incremental, pessoas, criado_em, beneficio_id")
      .eq("beneficio_id", ultimo.id)
      .single();
    if (e3) throw e3;
    const res = lerResgate(r);
    return {
      tipo: "resgatado",
      nome: cliente.nome,
      resgatadoEm: res.criado_em,
      valorConta: res.valor_conta,
      desconto: res.desconto,
    };
  }

  return { tipo: "nenhum" };
}

export type RespostaResgate =
  | { ok: true; novo: boolean; valorConta: number; desconto: number; aPagar: number; resgatadoEm: string }
  | { ok: false; mensagem: string };

/**
 * Aplica o benefício. Idempotente: a função resgatar_beneficio trava o benefício e,
 * se já houver resgate, devolve o mesmo em vez de criar outro.
 */
export async function aplicarBeneficio(
  beneficioId: string,
  valorContaEntrada: unknown,
  pessoasEntrada: unknown = 2,
): Promise<RespostaResgate> {
  const pessoas = Math.round(lerCampoNumero(pessoasEntrada ?? 2));
  if (!Number.isInteger(pessoas) || pessoas < 1 || pessoas > 20)
    throw new EntradaInvalidaError("Informe quantas pessoas estão na mesa (1 a 20).");
  const valorConta = Math.round(lerCampoNumero(valorContaEntrada) * 100) / 100;
  if (typeof beneficioId !== "string" || !/^[0-9a-f-]{36}$/i.test(beneficioId))
    throw new EntradaInvalidaError("Benefício inválido.");
  if (!Number.isFinite(valorConta) || valorConta <= 0 || valorConta > 100_000)
    throw new EntradaInvalidaError("Informe o valor da conta.");

  const db = supabaseServidor();
  const { data: b, error } = await db.from("beneficios").select(BENEFICIO_COM_CAMPANHA).eq("id", beneficioId).maybeSingle();
  if (error) throw error;
  if (!b) return { ok: false, mensagem: "Benefício não encontrado." };
  const ben = b as unknown as { id: string; cliente_id: string; status: string; valido_de: string; valido_ate: string; campanhas: Record<string, unknown> };
  const campanha = lerCampanha(ben.campanhas);
  const restauranteId = String(ben.campanhas.restaurante_id);

  if (ben.status !== "resgatado") {
    const agora = Date.now();
    const vencido = new Date(ben.valido_ate).getTime() <= agora;
    const cedo = !DEMO_ACEITA_ANTES_DA_JANELA && new Date(ben.valido_de).getTime() > agora;
    // Campanha de várias semanas: fora da demo, só vale no dia e na faixa de hora de uma ocorrência.
    const foraDaOcorrencia = !DEMO_ACEITA_ANTES_DA_JANELA && !dentroDeOcorrencia(campanha);
    if (ben.status !== "emitido" || vencido || cedo || foraDaOcorrencia)
      return { ok: false, mensagem: "Este benefício não está mais ativo." };
  }

  const agora = agoraNoFuso();
  const [regras, visitas, restaurante] = await Promise.all([
    carregarRegras(restauranteId),
    db
      .from("visitas")
      .select("data, hora")
      .eq("cliente_id", ben.cliente_id)
      .gte("data", somarDias(agora.data, -DIAS_RECENTES))
      .then(({ data, error: e }) => {
        if (e) throw e;
        return data as { data: string; hora: number }[];
      }),
    carregarRestaurante(restauranteId),
  ]);

  // Classificação gravada no resgate: veio de fora da janela habitual?
  const incremental = !visitouNaJanela(visitas, janelaDa(campanha), agora.data);
  // Sem vaga guardada (aplicou sem consultar antes)? Tenta guardar agora; sem vaga, não aplica.
  const vaga = valorDaVaga(campanha, restaurante.ticket_medio, regras.desconto_max);
  if (ben.status === "emitido") {
    const r = await guardarVaga(ben.id, campanha, "chegada", vaga);
    if (r === "sem_vaga") return { ok: false, mensagem: "As vagas desta oferta acabaram." };
    if (r === "indisponivel") return { ok: false, mensagem: "Este benefício não está mais ativo." };
  }
  const { gasto, garantidas } = await situacaoTeto(campanha.id, ben.id);
  const { desconto } = calcularDesconto(campanha, valorConta, regras.desconto_max, campanha.teto - gasto - garantidas * vaga);

  const { data: res, error: e2 } = await db.rpc("resgatar_beneficio", {
    p_beneficio_id: ben.id,
    p_valor_conta: valorConta,
    p_desconto: desconto,
    p_incremental: incremental,
    p_data: agora.data,
    p_hora: agora.hora,
    p_pessoas: pessoas,
  });
  if (e2) {
    if (String(e2.message).includes("beneficio_indisponivel")) return { ok: false, mensagem: "Este benefício não está mais ativo." };
    throw e2;
  }
  const r = lerResgate(res as Record<string, unknown>);
  const novo = Boolean((res as { novo: boolean }).novo);
  // Este resgate esgotou o teto? A campanha para agora, não no próximo cliente.
  if (novo && garantidas === 0 && tetoEsgotado(campanha.teto, gasto + r.desconto, vaga))
    await encerrarPorTeto(campanha.id, campanha.teto);
  return {
    ok: true,
    novo,
    valorConta: r.valor_conta,
    desconto: r.desconto,
    aPagar: Math.round((r.valor_conta - r.desconto) * 100) / 100,
    resgatadoEm: r.criado_em,
  };
}
