import "server-only";
// Chamada ao Gemini pela API REST. Só no servidor; a chave nunca vai ao navegador.

export const MODELO_PADRAO = "gemini-3.5-flash-lite";

export class SemChaveError extends Error {
  constructor() {
    super(`Nenhuma chave do Gemini no servidor (procurei ${NOMES_CHAVE.join(", ")}). Depois de cadastrar, faça redeploy.`);
  }
}

export const modeloConfigurado = () => process.env.GEMINI_MODEL || MODELO_PADRAO;

/** Nomes aceitos para a chave. Integrações (ex.: Marketplace da Vercel) às vezes usam outro nome. */
export const NOMES_CHAVE = ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"] as const;

/** Qual variável tem a chave. Devolve só o nome, nunca o valor. */
export const variavelDaChave = () => NOMES_CHAVE.find((n) => !!process.env[n]?.trim()) ?? null;

/**
 * Manda instrução de sistema + mensagem e devolve o texto da resposta, pedindo JSON.
 * Sem parâmetros de amostragem: a linha 3.5 do Gemini não aceita mais temperature/top_p.
 * GEMINI_API_URL existe só para apontar a um servidor falso em teste local.
 */
export async function gerarJson(sistema: string, usuario: string, timeoutMs = 25_000): Promise<string> {
  const nome = variavelDaChave();
  const chave = nome ? process.env[nome]!.trim() : null;
  if (!chave) throw new SemChaveError();
  const base = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta";
  const resp = await fetch(`${base}/models/${encodeURIComponent(modeloConfigurado())}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: [{ text: usuario }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new Error(`Gemini respondeu HTTP ${resp.status}: ${corpo.slice(0, 300)}`);
  }
  const j = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const texto = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!texto.trim()) throw new Error(`Gemini devolveu resposta vazia (${j.candidates?.[0]?.finishReason ?? "sem motivo"})`);
  return texto;
}
