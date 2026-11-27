import "server-only";
// Vagas do teto: cada vaga separa o desconto máximo de uma mesa (`valorDaVaga`). Uma vaga é
// guardada quando o cliente confirma na oferta ou quando o salão digita o telefone na
// chegada. Quem tem vaga guardada nunca fica sem desconto; quem não tem usa uma vaga livre,
// se houver. A trava contra duas pessoas na mesma última vaga fica no banco
// (função reservar_beneficio).
import { supabaseServidor } from "./supabase/server";
import { fimDaProximaOcorrencia } from "./campanha";
import type { CampanhaRegistro } from "./dados";

export type OrigemReserva = "confirmacao" | "chegada";
export type ResultadoReserva = "reservado" | "ja_reservado" | "sem_vaga" | "indisponivel";

/** Gasto da campanha e quantas vagas estão guardadas agora (sem contar `excluir`). */
export async function situacaoTeto(campanhaId: string, excluir?: string): Promise<{ gasto: number; garantidas: number }> {
  const db = supabaseServidor();
  const agora = new Date().toISOString();
  const [rg, rs] = await Promise.all([
    db.from("resgates").select("desconto, beneficios!inner(campanha_id)").eq("beneficios.campanha_id", campanhaId),
    db.from("beneficios").select("id").eq("campanha_id", campanhaId).eq("status", "emitido").gt("reserva_ate", agora),
  ]);
  if (rg.error) throw rg.error;
  if (rs.error) throw rs.error;
  return {
    gasto: rg.data.reduce((s, r) => s + Number(r.desconto), 0),
    garantidas: rs.data.filter((b) => b.id !== excluir).length,
  };
}

/** Guarda a vaga deste benefício, se houver. Atômico no banco. */
export async function guardarVaga(
  beneficioId: string,
  campanha: Pick<CampanhaRegistro, "data_janela" | "hora_fim" | "semanas">,
  origem: OrigemReserva,
  valorVaga: number,
): Promise<ResultadoReserva> {
  const { data, error } = await supabaseServidor().rpc("reservar_beneficio", {
    p_beneficio_id: beneficioId,
    p_origem: origem,
    p_reserva_ate: fimDaProximaOcorrencia(campanha),
    p_valor_vaga: valorVaga,
  });
  if (error) throw error;
  return data as ResultadoReserva;
}
