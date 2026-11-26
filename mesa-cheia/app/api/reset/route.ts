import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { hojeNoFuso } from "@/lib/dominio";
import { REGRAS_DEMO, RESTAURANTE_DEMO, gerarClientes, gerarOcupacao } from "@/lib/seed";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/**
 * Seed e botão "Resetar demo". Apaga tudo e popula de novo.
 * Idempotente: apagar restaurantes leva o resto junto (on delete cascade), e o
 * restaurante tem id fixo, então dois resets simultâneos não duplicam dados.
 */
export async function POST() {
  const inicio = Date.now();
  try {
    const db = supabaseServidor();
    const hoje = hojeNoFuso();

    const apagar = await db.from("restaurantes").delete().not("id", "is", null);
    if (apagar.error) throw apagar.error;

    const rest = await db.from("restaurantes").insert(RESTAURANTE_DEMO);
    if (rest.error) throw rest.error;

    const ocupacao = gerarOcupacao(hoje);
    const clientes = gerarClientes(hoje);
    const resultados = await Promise.all([
      db.from("regras").insert(REGRAS_DEMO),
      db.from("ocupacao").insert(ocupacao),
      db.from("clientes").insert(clientes),
    ]);
    const falha = resultados.find((r) => r.error);
    if (falha?.error) throw falha.error;

    return NextResponse.json({
      ok: true,
      hoje,
      restaurante: RESTAURANTE_DEMO.nome,
      ocupacao: ocupacao.length,
      clientes: clientes.length,
      ms: Date.now() - inicio,
    });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
