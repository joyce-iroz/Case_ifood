import { NextResponse } from "next/server";
import { simularOcorrenciaCheia } from "@/lib/pausa";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** DEMO: registra 85% de ocupação na primeira ocorrência para mostrar a pausa automática. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await simularOcorrenciaCheia(id));
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
