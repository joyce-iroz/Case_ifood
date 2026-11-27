import { NextResponse } from "next/server";
import { NOMES_CHAVE, gerarJson, listarModelos, modeloConfigurado, provedorConfigurado } from "@/lib/llm";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico da ligação com o modelo. Mostra o provedor, qual variável o servidor
 * encontrou (só o nome, nunca o valor), os modelos que a chave enxerga e faz uma
 * chamada mínima. Só roda quando alguém abre esta URL; consome uma requisição.
 */
export async function GET() {
  const conf = provedorConfigurado();
  const base = {
    provedor: conf?.provedor ?? null,
    variavel_encontrada: conf?.variavel ?? null,
    nomes_procurados: NOMES_CHAVE,
    modelo: conf ? modeloConfigurado() : null,
    ambiente_vercel: process.env.VERCEL_ENV ?? null,
  };
  if (!conf)
    return NextResponse.json({
      ...base,
      ok: false,
      erro: "Nenhuma das variáveis está definida neste deploy. Cadastre e faça Redeploy.",
    });
  const modelos = await listarModelos();
  const t0 = Date.now();
  try {
    const texto = await gerarJson('Responda só com o JSON {"ok": true}.', '{"teste": true}', 15_000);
    return NextResponse.json({ ...base, ok: true, ms: Date.now() - t0, resposta: texto.slice(0, 200), modelos_disponiveis: modelos });
  } catch (e) {
    return NextResponse.json({
      ...base,
      ok: false,
      ms: Date.now() - t0,
      erro: e instanceof Error ? e.message : String(e),
      modelos_disponiveis: modelos,
    });
  }
}
