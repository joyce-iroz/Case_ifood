import { NextResponse } from "next/server";
import { marcarKitEntregue } from "@/lib/kit";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** O dono copiou a mensagem para a equipe: o kit conta como entregue. */
export async function POST(_req: Request, { params }: { params: Promise<{ campanhaId: string }> }) {
  try {
    const { campanhaId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(campanhaId)) return NextResponse.json({ ok: false, erro: "Campanha inválida." }, { status: 400 });
    await marcarKitEntregue(campanhaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
