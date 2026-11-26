import "server-only";
import { supabaseServidor } from "./supabase/server";
import { RESTAURANTE_DEMO_ID, hojeNoFuso, somarDias, type Restaurante } from "./dominio";
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

/** Registros de ocupação de [de, ate), paginados para não esbarrar no limite do PostgREST. */
async function carregarRegistros(restauranteId: string, de: string, ate: string): Promise<RegistroOcupacao[]> {
  const todos: RegistroOcupacao[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabaseServidor()
      .from("ocupacao")
      .select("data, hora, pessoas")
      .eq("restaurante_id", restauranteId)
      .gte("data", de)
      .lt("data", ate)
      .order("data")
      .order("hora")
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    todos.push(...(data as RegistroOcupacao[]));
    if (data.length < PAGINA) return todos;
  }
}

export async function obterResumoOcupacao(id = RESTAURANTE_DEMO_ID): Promise<ResumoOcupacao> {
  const hoje = hojeNoFuso();
  const restaurante = await carregarRestaurante(id);
  const registros = await carregarRegistros(id, somarDias(hoje, -DIAS_DE_HISTORICO), hoje);
  return calcularOcupacao(restaurante, registros, hoje);
}
