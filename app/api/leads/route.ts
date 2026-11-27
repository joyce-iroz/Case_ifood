import { NextResponse } from "next/server";
import { salvarLead } from "@/lib/leads";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** Restaurante interessado, vindo da página de diagnóstico. */
export async function POST(req: Request) {
  try {
    return NextResponse.json(await salvarLead(await req.json().catch(() => null)), { status: 201 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
