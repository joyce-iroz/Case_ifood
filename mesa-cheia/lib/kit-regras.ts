// Kit de ativação: validação e template. Puro.
// O kit é só texto para pessoas lerem. Nada aqui (nem na saída do modelo) toca em
// valor, teto, emissão ou resgate: esses números vêm da campanha já aprovada.
import { formatarHora, nomeDiaLongo } from "./dominio";
import { lerNumeroBR } from "./numero";
import { rotuloSegmento, type Segmento } from "./segmentos";

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
  janela: string;      // "terça, 18h30 às 20h"
  dia: string;         // "terça": a mensagem da equipe tem de citar
  hora_inicio: string; // "18h30": idem
  beneficio: string;   // "15% de desconto"
  segmento: string;    // rótulo do segmento
  publico: Publico;
};

/**
 * Quem é o cliente que vai ouvir o script e como falar com ele. É o que tira o kit do
 * genérico: o garçom fala diferente com quem nunca sentou no salão e com quem vem toda terça.
 */
export type Publico = {
  segmento: Segmento;
  quem: string;        // o que o restaurante sabe desse cliente
  abordagem: string;   // o tom do script
  usar_nome: boolean;  // o script pode começar com {nome}
};

export function publicoDoSegmento(segmento: Segmento, cozinha: string, dia: string): Publico {
  // Ninguém tem o nome dito em voz alta: na mesa pode haver quem não recebeu oferta.
  const base = { segmento, usar_nome: false };
  switch (segmento) {
    case "frequenta_janela":
      return { ...base, quem: `cliente que já costuma vir na ${dia} nesse horário`, abordagem: "agradecer por ser freguês desse horário; não tratar como novidade nem como primeira visita" };
    case "frequenta_outras":
      return { ...base, quem: `cliente que vem ao salão, mas em outros dias ou horários; desta vez veio na ${dia}`, abordagem: `comentar que é bom vê-lo numa ${dia}; o benefício é por ter vindo nesse horário` };
    case "delivery_nunca_veio":
      return { ...base, quem: "cliente que já pede delivery da casa e está no salão pela primeira vez", abordagem: "dar boas-vindas à primeira visita ao salão e lembrar que ele já conhece a comida pelo delivery" };
    case "sumiu_60_dias":
      return { ...base, quem: "cliente que não vinha há mais de dois meses", abordagem: "dizer que é bom vê-lo de volta, sem cobrar a ausência" };
    case "cozinha_similar":
      return {
        segmento,
        usar_nome: false,
        quem: `cliente que pede comida ${cozinha} em outros restaurantes da região e está aqui pela primeira vez`,
        abordagem: "dar boas-vindas à primeira visita; não citar outros restaurantes, iFood nem como ele recebeu a oferta; não usar o nome",
      };
  }
}

const artigoDia = (dia: string) => (dia === "sábado" || dia === "domingo" ? "num" : "numa");

/** Monta a entrada do kit a partir da campanha. Usada na emissão e no seed. */
export function entradaKit(
  restaurante: { nome: string; cozinha: string; ticket_medio: number },
  c: { dia_semana: number; hora_inicio: number; hora_fim: number; semanas?: number; segmento: Segmento },
  beneficio: string,
): EntradaKit {
  const dia = nomeDiaLongo(c.dia_semana);
  return {
    restaurante,
    janela: janelaNatural(c.dia_semana, c.hora_inicio, c.hora_fim, c.semanas ?? 1),
    dia,
    hora_inicio: formatarHora(c.hora_inicio),
    beneficio,
    segmento: rotuloSegmento(c.segmento),
    publico: publicoDoSegmento(c.segmento, restaurante.cozinha, dia),
  };
}

/** Frases de propaganda que serviriam para qualquer campanha. */
export const FRASES_GENERICAS = [
  "benefício da casa",
  "uma coisa boa",
  "oferta especial",
  "oferta exclusiva",
  "imperdível",
  "aproveite",
  "surpresa",
  "presente da casa",
  "não perca",
];

/** O que o salão mostra no lugar de {nome}. */
export function aplicarNome(script: string, nome: string | null): string {
  const primeiro = nome?.trim().split(/\s+/)[0];
  if (primeiro) return script.replace(/\{nome\}/g, primeiro);
  return script.replace(/\{nome\}\s*,\s*/g, "").replace(/\{nome\}/g, "").trimStart().replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

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

/** Como o kit mostra o marcador para o dono: no salão ele vira o primeiro nome do cliente. */
export const mostrarMarcador = (t: string) => t.replace(/\{nome\}/g, "[nome do cliente]");

export const contarPalavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
export const segundosDeFala = (t: string) => Math.round(contarPalavras(t) / PALAVRAS_POR_SEGUNDO);

/** "terça, 18h30 às 20h" ou "toda terça, 18h30 às 20h, por 3 semanas" */
export const janelaNatural = (dia: number, inicio: number, fim: number, semanas = 1) =>
  semanas > 1
    ? `${dia === 0 || dia === 6 ? "todo" : "toda"} ${nomeDiaLongo(dia)}, ${formatarHora(inicio)} às ${formatarHora(fim)}, por ${semanas} semanas`
    : `${nomeDiaLongo(dia)}, ${formatarHora(inicio)} às ${formatarHora(fim)}`;

/** Confere o que torna o kit desta campanha e não de uma qualquer. */
export function conferirEspecifico(kit: TextosKit, e: Pick<EntradaKit, "dia" | "hora_inicio" | "publico">): string[] {
  const erros: string[] = [];
  const baixo = (t: string) => t.toLowerCase();
  for (const [campo, texto] of Object.entries(kit)) {
    for (const f of FRASES_GENERICAS) if (baixo(texto).includes(f)) erros.push(`${campo} usa a frase genérica "${f}"; fale da situação do cliente`);
    for (const m of texto.matchAll(/\{([^}]*)\}/g))
      if (m[1] !== "nome" || campo !== "script_garcom" || !e.publico.usar_nome)
        erros.push(`${campo} tem o marcador "${m[0]}", que não existe aqui`);
  }
  const equipe = baixo(kit.mensagem_equipe);
  if (!equipe.includes(e.dia)) erros.push(`mensagem_equipe precisa citar o dia (${e.dia})`);
  if (!equipe.includes(baixo(e.hora_inicio))) erros.push(`mensagem_equipe precisa citar o horário de início (${e.hora_inicio})`);
  return erros;
}

export function validarKit(
  texto: string,
  beneficio: BeneficioKit,
  entrada?: Pick<EntradaKit, "dia" | "hora_inicio" | "publico">,
): { ok: true; kit: TextosKit } | { ok: false; erros: string[] } {
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
  const numeros = [...conferirNumeros(kit, beneficio), ...(entrada ? conferirEspecifico(kit, entrada) : [])];
  if (numeros.length) return { ok: false, erros: numeros };
  return { ok: true, kit };
}

/** Kit de texto fixo quando o modelo falha duas vezes ou não está configurado. Um por público. */
export function kitTemplate(e: EntradaKit): TextosKit {
  const b = e.beneficio;
  const num = artigoDia(e.dia);
  const porPublico: Record<Segmento, { script: string; titulo: string; linha: string }> = {
    frequenta_janela: {
      script: `Você é de vir na ${e.dia}, né? Por isso hoje sua conta tem ${b}. Posso aplicar?`,
      titulo: `Cliente de ${e.dia}?`,
      linha: "Se você recebeu nossa mensagem, diga seu telefone ao garçom na hora da conta.",
    },
    frequenta_outras: {
      script: `Que bom te ver aqui ${num} ${e.dia}. Por ter vindo nesse horário, sua conta tem ${b}. Posso aplicar?`,
      titulo: `Veio ${num} ${e.dia}?`,
      linha: "Se você recebeu nossa mensagem, diga seu telefone ao garçom na hora da conta.",
    },
    delivery_nunca_veio: {
      script: `Você já conhecia nossa comida pelo delivery, né? Para a primeira vez no salão, sua conta tem ${b}. Posso aplicar?`,
      titulo: "Primeira vez no salão?",
      linha: "Se você pede nosso delivery e recebeu a mensagem, diga seu telefone ao garçom na conta.",
    },
    sumiu_60_dias: {
      script: `Que bom te ver de volta. Para marcar a volta, sua conta tem ${b}. Posso aplicar?`,
      titulo: "Que bom te ver de volta",
      linha: "Se você recebeu nossa mensagem, diga seu telefone ao garçom na hora da conta.",
    },
    cozinha_similar: {
      script: `Primeira vez aqui na casa? Seja bem-vindo. Para essa primeira visita, sua conta tem ${b}. Posso aplicar?`,
      titulo: "Primeira vez aqui?",
      linha: "Se você recebeu nosso convite, diga seu telefone ao garçom na hora da conta.",
    },
  };
  const t = porPublico[e.publico.segmento];
  return {
    script_garcom: t.script,
    mensagem_equipe:
      `Pessoal, campanha ${e.janela}: ${b} para quem recebeu a oferta (${e.publico.quem}). ` +
      `Começa ${e.dia} às ${e.hora_inicio}. No fechamento da conta, digitem o telefone do cliente na tela do salão. ` +
      `Se aparecer benefício, leiam a frase da tela em tom de conversa, só para quem deu o telefone, e toquem em Aplicar. ` +
      `Se não aparecer, leiam a frase que a tela mostra para esse caso: ninguém sai achando que foi esquecido.`,
    cartaz_titulo: t.titulo,
    cartaz_linha: t.linha,
  };
}

/**
 * O que o atendente diz quando o telefone não tem oferta. Texto fixo em código: o salão
 * nunca chama modelo. Explica sem fazer o cliente se sentir passado para trás.
 */
export const FALA_SEM_BENEFICIO =
  "Neste telefone não tem oferta hoje. A gente manda as ofertas por mensagem, para dias e horários específicos; quando chegar uma para você, é só dizer o telefone na hora da conta.";

/** O que dizer quando a oferta deste telefone já foi usada. */
export const falaJaUsado = (quando: string) =>
  `Essa oferta já foi usada ${quando}. Cada oferta vale uma vez; quando chegar outra por mensagem, é só dizer o telefone na hora da conta.`;
