import { NextResponse } from "next/server";
import { escreverKitComModelo } from "@/lib/kit";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pede ao modelo o texto do kit. Requisição própria, separada da proposta do planejador. */
export async function POST(_req: Request, { params }: { params: Promise<{ campanhaId: string }> }) {
  try {
    const { campanhaId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(campanhaId)) return NextResponse.json({ ok: false, erro: "Campanha inválida." }, { status: 400 });
    const r = await escreverKitComModelo(campanhaId);
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
