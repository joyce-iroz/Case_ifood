import { NextResponse } from "next/server";
import { registrarOcupacao } from "@/lib/pausa";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** {data: "2026-12-01", hora: 19, pessoas: 52}: o que um caixa ou sistema de mesas enviaria. */
export async function POST(req: Request) {
  try {
    return NextResponse.json(await registrarOcupacao(await req.json().catch(() => null)));
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
