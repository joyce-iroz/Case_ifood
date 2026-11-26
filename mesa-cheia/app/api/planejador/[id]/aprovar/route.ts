import { NextResponse } from "next/server";
import { aprovarPlanejamento } from "@/lib/planejador";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** Aprova a proposta gravada (com valor ajustado opcional) pelo mesmo criarCampanha do formulário. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { valor } = (await req.json().catch(() => ({}))) as { valor?: unknown };
    const r = await aprovarPlanejamento(id, valor);
    return NextResponse.json(r, { status: r.ok ? 201 : 422 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
