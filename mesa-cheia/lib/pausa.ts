import "server-only";
// Pausa automática e registro de ocupação. A decisão é `motivoDePausa` (puro, lib/campanha.ts);
// aqui só lemos os registros e gravamos o resultado.
import { supabaseServidor } from "./supabase/server";
import { carregarRegras, carregarRestaurante, encerrarPorTeto, lerCampanha, COLUNAS_CAMPANHA } from "./dados";
import { tetoEsgotado, valorDaVaga } from "./projecao";
import { RESTAURANTE_DEMO_ID, diaDaSemana } from "./dominio";
import { motivoDePausa, ocorrencias } from "./campanha";
import { lerCampoNumero } from "./numero";
import { EntradaInvalidaError } from "./resgate";

/** Confere as campanhas ativas e pausa as que bateram a ocupação mínima. Devolve quantas pausou. */
export async function verificarPausas(id = RESTAURANTE_DEMO_ID): Promise<number> {
  const db = supabaseServidor();
  const { data, error } = await db.from("campanhas").select(COLUNAS_CAMPANHA).eq("restaurante_id", id).eq("status", "ativa");
  if (error) throw error;
  const ativas = (data ?? []).map((c) => lerCampanha(c as Record<string, unknown>));
  if (!ativas.length) return 0;

  const datas = [...new Set(ativas.flatMap((c) => ocorrencias(c.data_janela, c.semanas)))];
  const [restaurante, regras, registros] = await Promise.all([
    carregarRestaurante(id),
    carregarRegras(id),
    db
      .from("ocupacao")
      .select("data, hora, pessoas")
      .eq("restaurante_id", id)
      .in("data", datas)
      .then(({ data: d, error: e }) => {
        if (e) throw e;
        return (d ?? []) as { data: string; hora: number; pessoas: number }[];
      }),
  ]);

  // Teto: soma dos descontos de cada campanha ativa.
  const gastos = new Map<string, number>();
  const rg = await db.from("resgates").select("desconto, beneficios!inner(campanha_id)").in("beneficios.campanha_id", ativas.map((c) => c.id));
  if (rg.error) throw rg.error;
  for (const x of rg.data as unknown as { desconto: string | number; beneficios: { campanha_id: string } }[])
    gastos.set(x.beneficios.campanha_id, (gastos.get(x.beneficios.campanha_id) ?? 0) + Number(x.desconto));
  // Campanha com vaga guardada não é encerrada: alguém conta com aquele desconto.
  const rv = await db
    .from("beneficios")
    .select("campanha_id")
    .in("campanha_id", ativas.map((c) => c.id))
    .eq("status", "emitido")
    .gt("reserva_ate", new Date().toISOString());
  if (rv.error) throw rv.error;
  const garantidas = new Set(rv.data.map((x) => x.campanha_id as string));

  let pausadas = 0;
  for (const c of ativas) {
    const vaga = valorDaVaga(c, restaurante.ticket_medio, regras.desconto_max);
    if (!garantidas.has(c.id) && tetoEsgotado(c.teto, gastos.get(c.id) ?? 0, vaga)) {
      if (await encerrarPorTeto(c.id, c.teto)) pausadas++;
      continue;
    }
    const motivo = motivoDePausa(c, registros, restaurante.capacidade, regras.ocupacao_min);
    if (!motivo) continue;
    const u = await db
      .from("campanhas")
      .update({ status: "pausada", pausada_em: new Date().toISOString(), motivo_pausa: motivo })
      .eq("id", c.id)
      .eq("status", "ativa");
    if (u.error) throw u.error;
    // Benefícios que ainda não foram usados deixam de valer.
    const b = await db.from("beneficios").update({ status: "expirado" }).eq("campanha_id", c.id).eq("status", "emitido");
    if (b.error) throw b.error;
    pausadas++;
  }
  return pausadas;
}

/**
 * Registro de ocupação de uma hora, como um caixa ou sistema de mesas enviaria.
 * Substitui o registro existente da mesma data e hora. Em seguida confere as pausas.
 */
export async function registrarOcupacao(entrada: unknown, id = RESTAURANTE_DEMO_ID) {
  const o = (entrada ?? {}) as Record<string, unknown>;
  const data = String(o.data ?? "");
  const hora = lerCampoNumero(o.hora);
  const pessoas = lerCampoNumero(o.pessoas);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(diaDaSemana(data)))
    throw new EntradaInvalidaError("data no formato AAAA-MM-DD");
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) throw new EntradaInvalidaError("hora inteira de 0 a 23");
  if (!Number.isInteger(pessoas) || pessoas < 0) throw new EntradaInvalidaError("pessoas: inteiro a partir de 0");
  await gravarOcupacao(id, [{ data, hora, pessoas }]);
  return { ok: true, pausadas: await verificarPausas(id) };
}

async function gravarOcupacao(id: string, linhas: { data: string; hora: number; pessoas: number }[]) {
  const db = supabaseServidor();
  for (const l of linhas) {
    const del = await db.from("ocupacao").delete().eq("restaurante_id", id).eq("data", l.data).eq("hora", l.hora);
    if (del.error) throw del.error;
  }
  const ins = await db.from("ocupacao").insert(linhas.map((l) => ({ restaurante_id: id, ...l })));
  if (ins.error) throw ins.error;
}
