import "server-only";
// Salão: consulta por telefone e resgate. Consulta direta ao banco, sem LLM.
import { supabaseServidor } from "./supabase/server";
import { carregarRegras, expirarVencidos, lerCampanha, lerResgate } from "./dados";
import { RESTAURANTE_DEMO_ID, agoraNoFuso, formatarValidade, somarDias } from "./dominio";
import { hashTelefone } from "./hash";
import { normalizarTelefone } from "./telefone";
import { lerCampoNumero } from "./numero";
import {
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
      calculo: { tipo: TipoBeneficio; valor: number; descontoMax: number; tetoRestante: number };
    }
  | { tipo: "nenhum" }
  | { tipo: "resgatado"; nome: string; resgatadoEm: string; valorConta: number; desconto: number };

export class EntradaInvalidaError extends Error {}

const BENEFICIO_COM_CAMPANHA =
  "id, campanha_id, cliente_id, codigo, valido_de, valido_ate, status, criado_em, " +
  "campanhas!inner(id, restaurante_id, dia_semana, hora_inicio, hora_fim, segmento, tipo, valor, teto, status, data_janela, semanas, controle_pct, pausada_em, motivo_pausa, criado_em)";

async function gastoDaCampanha(campanhaId: string): Promise<number> {
  const { data, error } = await supabaseServidor()
    .from("resgates")
    .select("desconto, beneficios!inner(campanha_id)")
    .eq("beneficios.campanha_id", campanhaId);
  if (error) throw error;
  return data.reduce((s, r) => s + Number(r.desconto), 0);
}

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
    .select(BENEFICIO_COM_CAMPANHA)
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
    const b = ativos[0];
    const c = lerCampanha(b.campanhas);
    const [regras, gasto, kit] = await Promise.all([
      carregarRegras(id),
      gastoDaCampanha(c.id),
      db.from("kits").select("script_garcom").eq("campanha_id", c.id).maybeSingle(),
    ]);
    return {
      tipo: "ativo",
      beneficioId: b.id,
      nome: cliente.nome,
      codigo: b.codigo,
      beneficio: textoBeneficio(c.tipo, c.valor),
      validade: formatarValidade(ocorrencias(c.data_janela, c.semanas), c.hora_inicio, c.hora_fim),
      antesDaJanela: new Date(b.valido_de).getTime() > agora,
      script: kit.error ? null : (kit.data?.script_garcom ?? null),
      calculo: { tipo: c.tipo, valor: c.valor, descontoMax: regras.desconto_max, tetoRestante: c.teto - gasto },
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
  const [regras, gasto, visitas] = await Promise.all([
    carregarRegras(restauranteId),
    gastoDaCampanha(campanha.id),
    db
      .from("visitas")
      .select("data, hora")
      .eq("cliente_id", ben.cliente_id)
      .gte("data", somarDias(agora.data, -DIAS_RECENTES))
      .then(({ data, error: e }) => {
        if (e) throw e;
        return data as { data: string; hora: number }[];
      }),
  ]);

  // Classificação gravada no resgate: veio de fora da janela habitual?
  const incremental = !visitouNaJanela(visitas, janelaDa(campanha), agora.data);
  const { desconto } = calcularDesconto(campanha, valorConta, regras.desconto_max, campanha.teto - gasto);

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
  return {
    ok: true,
    novo: Boolean((res as { novo: boolean }).novo),
    valorConta: r.valor_conta,
    desconto: r.desconto,
    aPagar: Math.round((r.valor_conta - r.desconto) * 100) / 100,
    resgatadoEm: r.criado_em,
  };
}
