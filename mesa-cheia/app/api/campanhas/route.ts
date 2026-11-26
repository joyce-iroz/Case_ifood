import { NextResponse } from "next/server";
import { criarCampanha } from "@/lib/emissao";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/**
 * Cria a campanha e emite os benefícios. O corpo é uma PropostaCampanha (lib/campanha.ts),
 * venha ela do formulário ou do planejador. Regra bloqueada → 422 com os motivos.
 */
export async function POST(req: Request) {
  try {
    const corpo = await req.json().catch(() => null);
    const resultado = await criarCampanha(corpo);
    return NextResponse.json(resultado, { status: resultado.ok ? 201 : 422 });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
