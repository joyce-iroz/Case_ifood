import "server-only";
import { supabaseServidor } from "./supabase/server";
import { RESTAURANTE_DEMO_ID, hojeNoFuso, horaDoTime, somarDias, type Restaurante } from "./dominio";
import type { Origem, Segmento, VisitaCliente } from "./segmentos";
import type { TipoBeneficio } from "./campanha";
import { lerCampoNumero } from "./numero";
import { calcularOcupacao, type RegistroOcupacao, type ResumoOcupacao } from "./ocupacao";
import { DIAS_DE_HISTORICO } from "./seed";

const PAGINA = 1000; // limite padrão de linhas por resposta do PostgREST

export class SemDadosError extends Error {}

export async function carregarRestaurante(id = RESTAURANTE_DEMO_ID): Promise<Restaurante> {
  const { data, error } = await supabaseServidor()
    .from("restaurantes")
    .select("id, nome, cozinha, capacidade, ticket_medio, abre, fecha, pausa_inicio, pausa_fim, dias_abertos")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SemDadosError("Restaurante não encontrado. Rode o reset da demo.");
  return { ...data, ticket_medio: Number(data.ticket_medio) } as Restaurante;
}

export async function carregarRegras(id = RESTAURANTE_DEMO_ID) {
  const { data, error } = await supabaseServidor()
    .from("regras")
    .select("teto_mes, desconto_max, dias_entre_ofertas, ocupacao_min")
    .eq("restaurante_id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SemDadosError("Regras não encontradas. Rode o reset da demo.");
  return {
    teto_mes: Number(data.teto_mes),
    desconto_max: Number(data.desconto_max),
    dias_entre_ofertas: data.dias_entre_ofertas as number,
    ocupacao_min: Number(data.ocupacao_min),
  };
}

/**
 * Lê todas as linhas de uma consulta, de 1000 em 1000, para não esbarrar no limite
 * do PostgREST. A consulta precisa ter ordenação estável (order por chave única).
 */
export async function paginar<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const todos: T[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await consulta(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    todos.push(...pagina);
    if (pagina.length < PAGINA) return todos;
  }
}

/** Registros de ocupação de [de, ate). */
function carregarRegistros(restauranteId: string, de: string, ate: string): Promise<RegistroOcupacao[]> {
  return paginar<RegistroOcupacao>((i, f) =>
    supabaseServidor()
      .from("ocupacao")
      .select("data, hora, pessoas")
      .eq("restaurante_id", restauranteId)
      .gte("data", de)
      .lt("data", ate)
      .order("data")
      .order("hora")
      .range(i, f),
  );
}

export async function obterResumoOcupacao(
  id = RESTAURANTE_DEMO_ID,
  restauranteCarregado?: Restaurante,
): Promise<ResumoOcupacao> {
  const hoje = hojeNoFuso();
  const restaurante = restauranteCarregado ?? (await carregarRestaurante(id));
  const registros = await carregarRegistros(id, somarDias(hoje, -DIAS_DE_HISTORICO), hoje);
  return calcularOcupacao(restaurante, registros, hoje);
}

// ------------------------------------------------------------ clientes e visitas

export type ClienteBase = {
  id: string;
  nome: string;
  origem: Origem;
  telefone_hash: string;
  telefone_final: string;
};

/** Clientes do restaurante e o histórico de visitas de cada um. */
export async function carregarClientesComVisitas(id = RESTAURANTE_DEMO_ID) {
  const db = supabaseServidor();
  const [clientes, visitas] = await Promise.all([
    paginar<ClienteBase>((i, f) =>
      db.from("clientes").select("id, nome, origem, telefone_hash, telefone_final").eq("restaurante_id", id).order("id").range(i, f),
    ),
    paginar<{ cliente_id: string; data: string; hora: number }>((i, f) =>
      db.from("visitas").select("cliente_id, data, hora").eq("restaurante_id", id).order("id").range(i, f),
    ),
  ]);
  const porCliente = new Map<string, VisitaCliente[]>();
  for (const v of visitas) {
    const lista = porCliente.get(v.cliente_id) ?? [];
    lista.push({ data: v.data, hora: v.hora });
    porCliente.set(v.cliente_id, lista);
  }
  return { clientes, visitasDe: (clienteId: string) => porCliente.get(clienteId) ?? [] };
}

// ------------------------------------------------------------ campanhas

export type CampanhaRegistro = {
  id: string;
  dia_semana: number;
  hora_inicio: number;
  hora_fim: number;
  segmento: Segmento;
  tipo: TipoBeneficio;
  valor: number;
  teto: number;
  status: string;
  data_janela: string;
  semanas: number;
  controle_pct: number;
  pausada_em: string | null;
  motivo_pausa: string | null;
  criado_em: string;
};

export const COLUNAS_CAMPANHA =
  "id, dia_semana, hora_inicio, hora_fim, segmento, tipo, valor, teto, status, data_janela, semanas, controle_pct, pausada_em, motivo_pausa, criado_em";

export type BeneficioRegistro = {
  id: string;
  campanha_id: string;
  cliente_id: string;
  codigo: string;
  valido_de: string;
  valido_ate: string;
  status: "emitido" | "resgatado" | "expirado";
  criado_em: string;
};

export type ResgateRegistro = {
  beneficio_id: string;
  valor_conta: number;
  desconto: number;
  incremental: boolean;
  pessoas: number;
  criado_em: string;
};

export function lerCampanha(c: Record<string, unknown>): CampanhaRegistro {
  return {
    ...(c as unknown as CampanhaRegistro),
    hora_inicio: horaDoTime(String(c.hora_inicio)),
    hora_fim: horaDoTime(String(c.hora_fim)),
    valor: Number(c.valor),
    teto: Number(c.teto),
    semanas: Number(c.semanas ?? 1),
    controle_pct: Number(c.controle_pct ?? 0),
    pausada_em: (c.pausada_em as string | null) ?? null,
    motivo_pausa: (c.motivo_pausa as string | null) ?? null,
  };
}

export const lerResgate = (r: Record<string, unknown>): ResgateRegistro => ({
  ...(r as unknown as ResgateRegistro),
  valor_conta: Number(r.valor_conta),
  desconto: Number(r.desconto),
  pessoas: Number(r.pessoas ?? 2),
});

/** Campanhas do restaurante com seus benefícios e resgates. Volume de demo: cabe em memória. */
export async function carregarCampanhasCompletas(id = RESTAURANTE_DEMO_ID) {
  const db = supabaseServidor();
  const campanhas = (
    await paginar<Record<string, unknown>>((i, f) =>
      db
        .from("campanhas")
        .select(COLUNAS_CAMPANHA)
        .eq("restaurante_id", id)
        .order("criado_em", { ascending: false })
        .order("id")
        .range(i, f),
    )
  ).map(lerCampanha);

  const ids = campanhas.map((c) => c.id);
  if (ids.length === 0)
    return {
      campanhas,
      beneficios: [] as BeneficioRegistro[],
      resgates: [] as ResgateRegistro[],
      controles: [] as { campanha_id: string; cliente_id: string }[],
    };

  const [beneficios, resgates, controles] = await Promise.all([
    paginar<BeneficioRegistro>((i, f) =>
      db
        .from("beneficios")
        .select("id, campanha_id, cliente_id, codigo, valido_de, valido_ate, status, criado_em")
        .in("campanha_id", ids)
        .order("id")
        .range(i, f),
    ),
    paginar<Record<string, unknown>>((i, f) =>
      db
        .from("resgates")
        .select("beneficio_id, valor_conta, desconto, incremental, pessoas, criado_em, beneficios!inner(campanha_id)")
        .in("beneficios.campanha_id", ids)
        .order("id")
        .range(i, f),
    ).then((rs) => rs.map(lerResgate)),
    paginar<{ campanha_id: string; cliente_id: string }>((i, f) =>
      db.from("controles").select("campanha_id, cliente_id").in("campanha_id", ids).order("cliente_id").range(i, f),
    ),
  ]);
  return { campanhas, beneficios, resgates, controles };
}

/** Benefícios emitidos cuja validade passou viram 'expirado'. Chamado nas leituras. */
export async function expirarVencidos() {
  const { error } = await supabaseServidor()
    .from("beneficios")
    .update({ status: "expirado" })
    .eq("status", "emitido")
    .lt("valido_ate", new Date().toISOString());
  if (error) throw error;
}

/** Atualiza as regras. Valida faixa de cada campo; o resto do sistema lê daqui. */
export async function atualizarRegras(entrada: unknown, id = RESTAURANTE_DEMO_ID) {
  const o = (entrada ?? {}) as Record<string, unknown>;
  const n = (k: string) => lerCampoNumero(o[k]);
  const regras = {
    teto_mes: n("teto_mes"),
    desconto_max: n("desconto_max"),
    dias_entre_ofertas: n("dias_entre_ofertas"),
    ocupacao_min: n("ocupacao_min"),
  };
  // NaN (texto ilegível, null, campo ausente) recebe mensagem própria antes da checagem de faixa.
  const nomes: Record<keyof typeof regras, string> = {
    teto_mes: "teto do mês",
    desconto_max: "desconto máximo",
    dias_entre_ofertas: "dias entre ofertas",
    ocupacao_min: "ocupação mínima",
  };
  const naoNumero = (Object.keys(regras) as (keyof typeof regras)[]).filter((k) => Number.isNaN(regras[k]));
  if (naoNumero.length)
    return {
      ok: false as const,
      erros: naoNumero.map((k) => `${nomes[k]}: "${String(o[k] ?? "")}" não é um número válido`),
    };
  const erros: string[] = [];
  if (!(regras.teto_mes >= 0 && regras.teto_mes <= 1_000_000)) erros.push("teto do mês entre 0 e 1.000.000");
  if (!(regras.desconto_max >= 0 && regras.desconto_max <= 100)) erros.push("desconto máximo entre 0% e 100%");
  if (!(Number.isInteger(regras.dias_entre_ofertas) && regras.dias_entre_ofertas >= 0 && regras.dias_entre_ofertas <= 365))
    erros.push("dias entre ofertas: inteiro entre 0 e 365");
  if (!(regras.ocupacao_min >= 0 && regras.ocupacao_min <= 100)) erros.push("ocupação mínima entre 0% e 100%");
  if (erros.length) return { ok: false as const, erros };
  const { error } = await supabaseServidor().from("regras").update(regras).eq("restaurante_id", id);
  if (error) throw error;
  return { ok: true as const, regras };
}
