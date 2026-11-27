import { NextResponse } from "next/server";
import { gerarProposta, listarPlanejamentos } from "@/lib/planejador";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // até 3 chamadas ao modelo

/** Registro de auditoria: últimos planejamentos com cada tentativa. */
export async function GET() {
  try {
    return NextResponse.json(await listarPlanejamentos());
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}

/** "Gerar proposta". Só roda quando o dono clica; a página nunca chama isto sozinha. */
export async function POST() {
  try {
    return NextResponse.json(await gerarProposta());
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
