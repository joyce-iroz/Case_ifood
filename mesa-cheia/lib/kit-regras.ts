// Kit de ativação: validação e template. Puro.
// O kit é só texto para pessoas lerem. Nada aqui (nem na saída do modelo) toca em
// valor, teto, emissão ou resgate: esses números vêm da campanha já aprovada.
import { formatarHora, nomeDiaLongo } from "./dominio";
import { lerNumeroBR } from "./numero";

export const MAX_PALAVRAS_SCRIPT = 45;
export const MAX_PALAVRAS_TITULO = 6;
export const PALAVRAS_POR_SEGUNDO = 2.5;
const MAX_CARACTERES = 800;

export type TextosKit = {
  script_garcom: string;
  mensagem_equipe: string;
  cartaz_titulo: string;
  cartaz_linha: string;
};

export type EntradaKit = {
  restaurante: { nome: string; cozinha: string; ticket_medio: number };
  janela: string;    // "terça, 18h30 às 20h"
  beneficio: string; // "15% de desconto"
  segmento: string;  // rótulo do segmento
};

/** O benefício real da campanha, para conferir números escritos pelo modelo. */
export type BeneficioKit = { tipo: "percentual" | "valor_fixo"; valor: number };

/**
 * O garçom vai ler o script em voz alta: um "15%" num benefício de 5% vira promessa
 * errada ao cliente. Todo percentual e todo valor em R$ escrito no kit tem de ser
 * o do benefício. Devolve as frases de erro.
 */
export function conferirNumeros(textos: TextosKit, b: BeneficioKit): string[] {
  const erros: string[] = [];
  for (const [campo, texto] of Object.entries(textos)) {
    for (const m of texto.matchAll(/(\d+(?:[.,]\d+)*)\s*%/g)) {
      const n = lerNumeroBR(m[1]);
      if (b.tipo !== "percentual" || n !== b.valor)
        erros.push(`${campo} cita "${m[0].trim()}", mas o benefício é ${b.tipo === "percentual" ? `${b.valor}%` : `R$ ${b.valor}`}`);
    }
    for (const m of texto.matchAll(/R\$\s*(\d+(?:[.,]\d+)*)/g)) {
      const n = lerNumeroBR(m[1]);
      if (b.tipo !== "valor_fixo" || n !== b.valor)
        erros.push(`${campo} cita "${m[0].trim()}", mas o benefício é ${b.tipo === "percentual" ? `${b.valor}%` : `R$ ${b.valor}`}`);
    }
  }
  return erros;
}

export const contarPalavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
export const segundosDeFala = (t: string) => Math.round(contarPalavras(t) / PALAVRAS_POR_SEGUNDO);

/** "terça, 18h30 às 20h" */
export const janelaNatural = (dia: number, inicio: number, fim: number) =>
  `${nomeDiaLongo(dia)}, ${formatarHora(inicio)} às ${formatarHora(fim)}`;

export function validarKit(texto: string, beneficio: BeneficioKit): { ok: true; kit: TextosKit } | { ok: false; erros: string[] } {
  let o: unknown;
  try {
    o = JSON.parse(texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return { ok: false, erros: ["a resposta não é um JSON válido"] };
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, erros: ["a resposta precisa ser um objeto JSON"] };
  const r = o as Record<string, unknown>;
  const erros: string[] = [];
  const campos = ["script_garcom", "mensagem_equipe", "cartaz_titulo", "cartaz_linha"] as const;
  for (const c of campos) {
    if (typeof r[c] !== "string" || !(r[c] as string).trim()) erros.push(`${c} precisa ser texto não vazio`);
    else if ((r[c] as string).length > MAX_CARACTERES) erros.push(`${c} passa de ${MAX_CARACTERES} caracteres`);
  }
  if (!erros.length) {
    const p = contarPalavras(r.script_garcom as string);
    if (p > MAX_PALAVRAS_SCRIPT) erros.push(`script_garcom tem ${p} palavras; o máximo é ${MAX_PALAVRAS_SCRIPT}`);
    const t = contarPalavras(r.cartaz_titulo as string);
    if (t > MAX_PALAVRAS_TITULO) erros.push(`cartaz_titulo tem ${t} palavras; o máximo é ${MAX_PALAVRAS_TITULO}`);
  }
  if (erros.length) return { ok: false, erros };
  const kit = Object.fromEntries(campos.map((c) => [c, (r[c] as string).trim()])) as TextosKit;
  const numeros = conferirNumeros(kit, beneficio);
  if (numeros.length) return { ok: false, erros: numeros };
  return { ok: true, kit };
}

/** Kit de texto fixo quando o modelo falha duas vezes ou não está configurado. */
export function kitTemplate(e: EntradaKit): TextosKit {
  return {
    script_garcom: `Antes de fechar, uma coisa boa: você tem um benefício da casa, ${e.beneficio} nesta conta. Já posso aplicar?`,
    mensagem_equipe:
      `Pessoal, campanha ativa ${e.janela}. Alguns clientes receberam ${e.beneficio}. ` +
      `No fechamento da conta, digitem o telefone do cliente na tela do salão. ` +
      `Se aparecer benefício, leiam a frase que aparece na tela e toquem em Aplicar. Se não aparecer, segue normal.`,
    cartaz_titulo: "Recebeu nossa oferta?",
    cartaz_linha: "Informe seu telefone ao garçom no fechamento da conta e veja se o benefício é seu.",
  };
}
