import { NextResponse } from "next/server";
import { listarJanelas } from "@/lib/planejador";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** Lista crua das janelas candidatas, calculada em código, e o cardápio que vai ao modelo. */
export async function GET() {
  try {
    return NextResponse.json(await listarJanelas());
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
