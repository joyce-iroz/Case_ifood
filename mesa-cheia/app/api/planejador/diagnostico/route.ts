import { NextResponse } from "next/server";
import { NOMES_CHAVE, gerarJson, modeloConfigurado, variavelDaChave } from "@/lib/gemini";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico da ligação com o Gemini. Mostra qual variável o servidor encontrou
 * (só o nome, nunca o valor) e faz uma chamada mínima. Só roda quando alguém abre
 * esta URL; consome uma requisição da cota.
 */
export async function GET() {
  const variavel = variavelDaChave();
  const base = {
    variavel_encontrada: variavel,
    nomes_procurados: NOMES_CHAVE,
    modelo: modeloConfigurado(),
    ambiente_vercel: process.env.VERCEL_ENV ?? null,
  };
  if (!variavel)
    return NextResponse.json({
      ...base,
      ok: false,
      erro: "Nenhuma das variáveis está definida neste deploy. Cadastre e faça Redeploy.",
    });
  const t0 = Date.now();
  try {
    const texto = await gerarJson('Responda só com o JSON {"ok": true}.', '{"teste": true}', 15_000);
    return NextResponse.json({ ...base, ok: true, ms: Date.now() - t0, resposta: texto.slice(0, 200) });
  } catch (e) {
    return NextResponse.json({ ...base, ok: false, ms: Date.now() - t0, erro: e instanceof Error ? e.message : String(e) });
  }
}
