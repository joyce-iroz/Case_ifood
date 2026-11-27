import { NextResponse } from "next/server";
import { obterResumoOcupacao } from "@/lib/dados";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** Ocupação média por dia da semana e hora (% da capacidade) nos últimos 60 dias. */
export async function GET() {
  try {
    return NextResponse.json(await obterResumoOcupacao());
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
