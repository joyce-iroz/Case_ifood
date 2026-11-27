import { NextResponse } from "next/server";
import { previaPlanejamento } from "@/lib/planejador";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** Corpo: {proposta}. Mesma revalidação da aprovação, sem gravar nada. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { proposta } = (await req.json().catch(() => ({}))) as { proposta?: unknown };
    return NextResponse.json(await previaPlanejamento(id, proposta));
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
