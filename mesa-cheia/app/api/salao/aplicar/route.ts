import { NextResponse } from "next/server";
import { aplicarBeneficio } from "@/lib/resgate";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** Idempotente: reenviar o mesmo beneficio_id devolve o mesmo resgate. */
export async function POST(req: Request) {
  try {
    const { beneficio_id, valor_conta } = (await req.json().catch(() => ({}))) as {
      beneficio_id?: unknown;
      valor_conta?: unknown;
    };
    const r = await aplicarBeneficio(String(beneficio_id ?? ""), valor_conta);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, mensagem }, { status });
  }
}
