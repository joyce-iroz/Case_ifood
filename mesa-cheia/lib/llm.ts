import "server-only";
// Chamada ao modelo de linguagem, só no servidor; a chave nunca vai ao navegador.
// Três provedores: Groq e xAI (Grok), ambos com API no formato da OpenAI, e Google
// (Gemini). O resto do código só vê gerarJson: o provedor não muda nenhuma regra,
// validação ou fallback.

export type Provedor = "groq" | "xai" | "gemini";
const PROVEDORES: Provedor[] = ["groq", "xai", "gemini"]; // ordem de preferência sem LLM_PROVEDOR

const CHAVES: Record<Provedor, readonly string[]> = {
  groq: ["GROQ_API_KEY"],
  xai: ["XAI_API_KEY", "GROK_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
};
const MODELO_PADRAO: Record<Provedor, string> = {
  groq: "openai/gpt-oss-120b",
  xai: "grok-4.6",
  gemini: "gemini-3.5-flash-lite",
};
const VAR_MODELO: Record<Provedor, string> = { groq: "GROQ_MODEL", xai: "XAI_MODEL", gemini: "GEMINI_MODEL" };
const VAR_URL: Record<Provedor, string> = { groq: "GROQ_API_URL", xai: "XAI_API_URL", gemini: "GEMINI_API_URL" };
const URL_PADRAO: Record<Provedor, string> = {
  groq: "https://api.groq.com/openai/v1",
  xai: "https://api.x.ai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};
const NOME: Record<Provedor, string> = { groq: "Groq", xai: "xAI (Grok)", gemini: "Gemini" };

export const NOMES_CHAVE = PROVEDORES.flatMap((p) => CHAVES[p]);

export class SemChaveError extends Error {
  constructor() {
    super(`Nenhuma chave de modelo no servidor (procurei ${NOMES_CHAVE.join(", ")}). Depois de cadastrar, faça redeploy.`);
  }
}

/** HTTP 429: a cota do plano acabou por agora. Repetir na mesma hora só piora. */
export class LimiteError extends Error {}

const temValor = (n: string) => !!process.env[n]?.trim();

/**
 * Qual provedor usar e de qual variável vem a chave (só o nome, nunca o valor).
 * LLM_PROVEDOR=groq|xai|gemini põe um na frente; sem ele, Groq, depois xAI, depois Gemini.
 */
export function provedorConfigurado(): { provedor: Provedor; variavel: string } | null {
  const forcado = process.env.LLM_PROVEDOR?.trim().toLowerCase() as Provedor | undefined;
  const ordem = forcado && PROVEDORES.includes(forcado) ? [forcado, ...PROVEDORES.filter((p) => p !== forcado)] : PROVEDORES;
  for (const p of ordem) {
    const variavel = CHAVES[p].find(temValor);
    if (variavel) return { provedor: p, variavel };
  }
  return null;
}

export function modeloConfigurado(): string {
  const p = provedorConfigurado()?.provedor ?? "groq";
  return process.env[VAR_MODELO[p]]?.trim() || MODELO_PADRAO[p];
}

/** *_API_URL existem só para apontar a um servidor falso em teste local. */
const baseUrl = (p: Provedor) => process.env[VAR_URL[p]]?.trim() || URL_PADRAO[p];

/** Groq e xAI: /chat/completions no formato da OpenAI, pedindo objeto JSON. */
async function chamarCompativelOpenAI(
  p: Provedor,
  chave: string,
  modelo: string,
  sistema: string,
  usuario: string,
  signal: AbortSignal,
): Promise<string> {
  const pedir = (comFormato: boolean) =>
    fetch(`${baseUrl(p)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: usuario },
        ],
        ...(comFormato ? { response_format: { type: "json_object" } } : {}),
        // gpt-oss no Groq: raciocínio curto e resposta limitada. O limite gratuito conta
        // tokens por minuto, inclusive os de raciocínio; isto cabe 3 tentativas num minuto.
        ...(p === "groq" && modelo.startsWith("openai/gpt-oss")
          ? { reasoning_effort: "low", max_completion_tokens: 2000 }
          : {}),
      }),
      signal,
    });
  let resp = await pedirComEspera(() => pedir(true));
  // Modelo sem modo JSON: pede de novo sem ele; o parser já tira cercas de código.
  if (resp.status === 400) {
    const corpo = await resp.text().catch(() => "");
    if (/response_format|json/i.test(corpo)) resp = await pedirComEspera(() => pedir(false));
    else throw new Error(`${NOME[p]} respondeu HTTP 400: ${corpo.slice(0, 300)}`);
  }
  if (!resp.ok) await falhaHttp(resp, NOME[p]);
  const j = (await resp.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const texto = j.choices?.[0]?.message?.content ?? "";
  if (!texto.trim()) throw new Error(`${NOME[p]} devolveu resposta vazia (${j.choices?.[0]?.finish_reason ?? "sem motivo"})`);
  return texto;
}

async function falhaHttp(resp: Response, quem: string): Promise<never> {
  const corpo = (await resp.text().catch(() => "")).replace(/org_[A-Za-z0-9]+/g, "org_…");
  if (resp.status === 429)
    throw new LimiteError(
      `${quem} atingiu o limite de uso do plano (HTTP 429). Espere um minuto e gere de novo. Detalhe: ${corpo.slice(0, 160)}`,
    );
  throw new Error(`${quem} respondeu HTTP ${resp.status}: ${corpo.slice(0, 300)}`);
}

const ESPERA_MAXIMA_S = 20;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Limite por minuto (HTTP 429): se o provedor disser em quanto tempo libera (cabeçalho
 * Retry-After ou "try again in 3.5s" no corpo) e for até 20 s, espera e repete uma vez.
 */
async function pedirComEspera(fazer: () => Promise<Response>): Promise<Response> {
  const resp = await fazer();
  if (resp.status !== 429) return resp;
  const corpo = await resp.clone().text().catch(() => "");
  const cabecalho = Number(resp.headers.get("retry-after"));
  const m = corpo.match(/try again in ([\d.]+)\s*(ms|s)/i);
  const segundos = Number.isFinite(cabecalho) && cabecalho > 0 ? cabecalho : m ? Number(m[1]) / (m[2] === "ms" ? 1000 : 1) : NaN;
  if (!(segundos > 0 && segundos <= ESPERA_MAXIMA_S)) return resp;
  await dormir(segundos * 1000 + 300);
  return fazer();
}

/** Manda instrução de sistema + mensagem e devolve o texto da resposta, pedindo JSON (objeto). */
export async function gerarJson(sistema: string, usuario: string, timeoutMs = 25_000): Promise<string> {
  const conf = provedorConfigurado();
  if (!conf) throw new SemChaveError();
  const chave = process.env[conf.variavel]!.trim();
  const modelo = modeloConfigurado();
  const signal = AbortSignal.timeout(timeoutMs);

  if (conf.provedor !== "gemini") return chamarCompativelOpenAI(conf.provedor, chave, modelo, sistema, usuario, signal);

  // Gemini: sem parâmetros de amostragem, a linha 3.5 não aceita mais temperature/top_p.
  const resp = await pedirComEspera(() =>
    fetch(`${baseUrl("gemini")}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: "user", parts: [{ text: usuario }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal,
    }),
  );
  if (!resp.ok) await falhaHttp(resp, "Gemini");
  const j = (await resp.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const texto = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!texto.trim()) throw new Error(`Gemini devolveu resposta vazia (${j.candidates?.[0]?.finishReason ?? "sem motivo"})`);
  return texto;
}

/** Modelos que a chave enxerga, para o diagnóstico. Nunca lança. */
export async function listarModelos(): Promise<{ ids: string[] } | { erro: string }> {
  const conf = provedorConfigurado();
  if (!conf) return { erro: "sem chave" };
  const chave = process.env[conf.variavel]!.trim();
  try {
    const resp =
      conf.provedor === "gemini"
        ? await fetch(`${baseUrl("gemini")}/models`, { headers: { "x-goog-api-key": chave }, signal: AbortSignal.timeout(10_000) })
        : await fetch(`${baseUrl(conf.provedor)}/models`, { headers: { authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return { erro: `HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}` };
    const j = (await resp.json()) as { data?: { id: string }[]; models?: { name: string }[] };
    const ids = j.data?.map((m) => m.id) ?? j.models?.map((m) => m.name.replace(/^models\//, "")) ?? [];
    return { ids: ids.filter((id) => conf.provedor !== "gemini" || id.includes("flash")).slice(0, 40) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
