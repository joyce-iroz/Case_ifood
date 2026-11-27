import { NextResponse } from "next/server";
import { atualizarRegras, carregarRegras } from "@/lib/dados";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await carregarRegras());
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const r = await atualizarRegras(await req.json().catch(() => null));
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
