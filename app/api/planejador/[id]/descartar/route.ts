import { NextResponse } from "next/server";
import { descartarPlanejamento } from "@/lib/planejador";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await descartarPlanejamento(id));
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
