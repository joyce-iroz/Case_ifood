import { NextResponse } from "next/server";
import { salvarKitEditado } from "@/lib/kit";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** O dono editou o texto do kit. Mesmas regras do texto da IA; se não passar, nada é gravado. */
export async function PATCH(req: Request, { params }: { params: Promise<{ campanhaId: string }> }) {
  try {
    const { campanhaId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(campanhaId)) return NextResponse.json({ ok: false, erros: ["Campanha inválida."] }, { status: 400 });
    const r = await salvarKitEditado(campanhaId, await req.json().catch(() => null));
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erros: [mensagem] }, { status });
  }
}
