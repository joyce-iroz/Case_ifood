import { NextResponse } from "next/server";
import { consultarTelefone } from "@/lib/resgate";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** POST para o telefone não ficar em URL nem em log de acesso. */
export async function POST(req: Request) {
  try {
    const { telefone } = (await req.json().catch(() => ({}))) as { telefone?: unknown };
    return NextResponse.json(await consultarTelefone(String(telefone ?? "")));
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
