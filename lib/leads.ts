import "server-only";
// Interesse de restaurantes vindos da página de diagnóstico. O resultado é recalculado
// aqui a partir das marcações: número enviado pelo navegador não é confiável.
import { supabaseServidor } from "./supabase/server";
import { diagnosticar, type EntradaDiagnostico, type Nivel } from "./diagnostico";
import { lerCampoNumero } from "./numero";
import { EntradaInvalidaError } from "./resgate";

const NIVEIS: Nivel[] = ["cheio", "medio", "vazio"];

function lerEntrada(x: unknown): EntradaDiagnostico {
  const o = (x ?? {}) as Record<string, unknown>;
  const capacidade = lerCampoNumero(o.capacidade);
  const ticketMedio = lerCampoNumero(o.ticketMedio);
  if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 2000) throw new EntradaInvalidaError("Capacidade inválida.");
  if (!(ticketMedio > 0 && ticketMedio < 10_000)) throw new EntradaInvalidaError("Ticket médio inválido.");
  const turnos = Array.isArray(o.turnos) ? o.turnos.slice(0, 4) : [];
  const dias = Array.isArray(o.dias) ? o.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  const niveis: Record<string, Nivel> = {};
  for (const [k, v] of Object.entries((o.niveis ?? {}) as Record<string, unknown>))
    if (/^\d-\d$/.test(k) && NIVEIS.includes(v as Nivel)) niveis[k] = v as Nivel;
  return {
    capacidade,
    ticketMedio,
    dias,
    niveis,
    turnos: turnos.map((t) => {
      const r = t as Record<string, unknown>;
      return { nome: String(r.nome ?? "").slice(0, 20), inicio: lerCampoNumero(r.inicio), fim: lerCampoNumero(r.fim) };
    }),
  };
}

export async function salvarLead(corpo: unknown) {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const nome = String(c.nome ?? "").trim();
  const contato = String(c.contato ?? "").trim();
  if (nome.length < 2 || nome.length > 100) throw new EntradaInvalidaError("Informe o nome do restaurante.");
  if (contato.length < 5 || contato.length > 120) throw new EntradaInvalidaError("Informe um e-mail ou WhatsApp para contato.");
  const entrada = lerEntrada(c.entrada);
  const resultado = diagnosticar(entrada);
  const { error } = await supabaseServidor().from("leads").insert({ nome, contato, diagnostico: { entrada, resultado } });
  if (error) throw error;
  return { ok: true };
}
