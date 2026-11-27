import { NextResponse } from "next/server";
import { confirmarOferta } from "@/lib/oferta";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** O cliente tocou em "Garantir minha mesa" na página da oferta. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const oferta = await confirmarOferta(token);
    if (!oferta) return NextResponse.json({ ok: false, erro: "Oferta não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, oferta });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
