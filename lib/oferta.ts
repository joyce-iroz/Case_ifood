import "server-only";
// Página da oferta: o que o cliente veria pelo link da mensagem. Mostra o benefício, as
// vagas livres e deixa confirmar (guardar a vaga). O link carrega um token aleatório do
// benefício, nunca o telefone, e a página não mostra nome nem dado do cliente.
import { supabaseServidor } from "./supabase/server";
import { carregarRegras, carregarRestaurante, expirarVencidos, lerCampanha, COLUNAS_CAMPANHA } from "./dados";
import { formatarValidade } from "./dominio";
import { ocorrencias, textoBeneficio } from "./campanha";
import { valorDaVaga, vagasDoTeto } from "./projecao";
import { guardarVaga, situacaoTeto } from "./vagas";

export type EstadoOferta = "disponivel" | "garantida" | "esgotada" | "usada" | "encerrada";

export type Oferta = {
  estado: EstadoOferta;
  restaurante: string;
  beneficio: string;
  validade: string;
  vagasLivres: number;
  vagasTotal: number;
  garantidaAte: string | null;
};

const TOKEN = /^[0-9a-f]{32}$/;

async function lerOferta(token: string) {
  if (!TOKEN.test(token)) return null;
  await expirarVencidos();
  const { data, error } = await supabaseServidor()
    .from("beneficios")
    .select(`id, status, valido_ate, reserva_ate, campanhas!inner(restaurante_id, ${COLUNAS_CAMPANHA})`)
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const b = data as unknown as {
    id: string;
    status: string;
    valido_ate: string;
    reserva_ate: string | null;
    campanhas: Record<string, unknown> & { restaurante_id: string };
  };
  return { b, c: lerCampanha(b.campanhas), restauranteId: b.campanhas.restaurante_id };
}

export async function carregarOferta(token: string): Promise<Oferta | null> {
  const lido = await lerOferta(token);
  if (!lido) return null;
  const { b, c, restauranteId } = lido;
  const [restaurante, regras, { gasto, garantidas }] = await Promise.all([
    carregarRestaurante(restauranteId),
    carregarRegras(restauranteId),
    situacaoTeto(c.id),
  ]);
  const vaga = valorDaVaga(c, restaurante.ticket_medio, regras.desconto_max);
  const { total, livres } = vagasDoTeto(c.teto, gasto, garantidas, vaga);
  const agora = Date.now();
  const garantida = b.status === "emitido" && !!b.reserva_ate && new Date(b.reserva_ate).getTime() > agora;
  const estado: EstadoOferta =
    b.status === "resgatado"
      ? "usada"
      : b.status !== "emitido" || c.status !== "ativa" || new Date(b.valido_ate).getTime() <= agora
        ? "encerrada"
        : garantida
          ? "garantida"
          : livres > 0
            ? "disponivel"
            : "esgotada";
  return {
    estado,
    restaurante: restaurante.nome,
    beneficio: textoBeneficio(c.tipo, c.valor, c.limite_por_conta),
    validade: formatarValidade(ocorrencias(c.data_janela, c.semanas), c.hora_inicio, c.hora_fim),
    vagasLivres: livres,
    vagasTotal: total,
    garantidaAte: garantida ? b.reserva_ate : null,
  };
}

/** O cliente confirmou: guarda a vaga, se houver. Idempotente. */
export async function confirmarOferta(token: string): Promise<Oferta | null> {
  const lido = await lerOferta(token);
  if (!lido) return null;
  const { b, c, restauranteId } = lido;
  if (b.status === "emitido" && c.status === "ativa") {
    const [restaurante, regras] = await Promise.all([carregarRestaurante(restauranteId), carregarRegras(restauranteId)]);
    await guardarVaga(b.id, c, "confirmacao", valorDaVaga(c, restaurante.ticket_medio, regras.desconto_max));
  }
  return carregarOferta(token);
}
