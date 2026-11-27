import { NextResponse } from "next/server";
import { aprovarPlanejamento } from "@/lib/planejador";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // emissão + até 2 chamadas ao modelo para o kit

/**
 * Corpo: {indice, proposta?}. A proposta editada é entrada não confiável: o servidor
 * revalida contra o cardápio deste planejamento e contra as regras antes de emitir.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await aprovarPlanejamento(id, await req.json().catch(() => ({})));
    return NextResponse.json(r, { status: r.ok ? 201 : 422 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
