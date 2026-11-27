import { ConfiguracaoAusenteError } from "./supabase/server";
import { SemDadosError } from "./dados";
import { EntradaInvalidaError } from "./resgate";

/** Converte erros conhecidos em status HTTP e mensagem para o usuário. */
export function descreverErro(e: unknown): { status: number; mensagem: string } {
  if (e instanceof ConfiguracaoAusenteError) return { status: 500, mensagem: e.message };
  if (e instanceof EntradaInvalidaError) return { status: 400, mensagem: e.message };
  if (e instanceof SemDadosError) return { status: 404, mensagem: e.message };
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return { status: 500, mensagem: msg };
}
