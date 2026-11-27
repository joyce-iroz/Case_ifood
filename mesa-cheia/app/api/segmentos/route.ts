import { NextResponse, type NextRequest } from "next/server";
import { contextoDaJanela } from "@/lib/emissao";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/** Contagem de clientes por segmento para uma janela, mais teto restante e ocupação da janela. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const janela = { dia: Number(q.get("dia")), inicio: Number(q.get("inicio")), fim: Number(q.get("fim")) };
  if (![janela.dia, janela.inicio, janela.fim].every(Number.isInteger) || janela.fim <= janela.inicio) {
    return NextResponse.json({ erro: "Janela inválida." }, { status: 400 });
  }
  try {
    return NextResponse.json(await contextoDaJanela(janela));
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
