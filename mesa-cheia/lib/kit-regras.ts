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
  hora_fim: string;    // "21h30": a mensagem da equipe diz até quando vale
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
    hora_fim: formatarHora(c.hora_fim),
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

/** Frases que fazem o desconto parecer de todo mundo. */
export const FRASES_PARA_TODOS = [
  "automaticamente",
  "todos os clientes",
  "todo mundo",
  "qualquer cliente",
  "para todos",
  "pra todos",
  "toda a mesa",
  "na casa toda",
];
/** Pelo menos uma destas no script: o desconto é deste cliente. */
const MARCAS_PESSOAIS = ["sua conta", "você tem", "você recebeu", "você ganhou", "pra você", "para você", "seu desconto", "seu benefício"];

/** O que o salão mostra no lugar de {nome}. */
export function aplicarNome(script: string, nome: string | null): string {
  const primeiro = nome?.trim().split(/\s+/)[0];
  if (primeiro) return script.replace(/\{nome\}/g, primeiro);
  return script.replace(/\{nome\}\s*,\s*/g, "").replace(/\{nome\}/g, "").trimStart().replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

/** O benefício real da campanha, para conferir números escritos pelo modelo. */
export type BeneficioKit = { tipo: "percentual" | "valor_fixo"; valor: number; limite?: number | null };

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
      // "20% até R$ 30": o limite por conta é o único R$ aceito num desconto em %.
      if ((b.tipo !== "valor_fixo" || n !== b.valor) && !(b.tipo === "percentual" && b.limite && n === b.limite))
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
/**
 * Confere o que torna o kit desta campanha e do fluxo com reserva. Três momentos:
 * - chegada: o cliente avisa que recebeu a mensagem; a fala é fixa, em código (FALAS_CHEGADA);
 * - conta: o script (script_garcom), lido depois que a tela confirmou o benefício;
 * - aviso na entrada (cartaz_titulo/cartaz_linha): quem ainda não sentou lê.
 */
export function conferirEspecifico(
  kit: TextosKit,
  e: Pick<EntradaKit, "dia" | "hora_inicio" | "publico"> & Partial<Pick<EntradaKit, "hora_fim">>,
): string[] {
  const erros: string[] = [];
  const baixo = (t: string) => t.toLowerCase();
  for (const [campo, texto] of Object.entries(kit)) {
    for (const f of FRASES_GENERICAS) if (baixo(texto).includes(f)) erros.push(`${campo} usa a frase genérica "${f}"; fale da situação do cliente`);
    for (const m of texto.matchAll(/\{([^}]*)\}/g))
      if (m[1] !== "nome" || campo !== "script_garcom" || !e.publico.usar_nome)
        erros.push(`${campo} tem o marcador "${m[0]}", que não existe aqui`);
    for (const f of FRASES_PARA_TODOS)
      if (baixo(texto).includes(f)) erros.push(`${campo} usa "${f}", que soa como desconto para todos; só quem recebeu a oferta tem`);
  }

  // Script da conta: lido no fechamento, para quem a tela confirmou.
  const script = baixo(kit.script_garcom);
  if (script.includes("telefone"))
    erros.push("script_garcom não pode pedir telefone: ele é lido depois que a tela já confirmou o benefício deste cliente");
  for (const p of ["senhor", "senhora", "moço", "moça", "querida", "querido"])
    if (new RegExp(`\\b${p}\\b`).test(script)) erros.push(`script_garcom diz "${p}": não suponha gênero nem trate por apelido`);
  if (/bem[- ]vind/.test(script))
    erros.push(`script_garcom é lido na hora da conta: "bem-vindo" é fala de chegada (e supõe gênero)`);
  if (/\bdigit/.test(script) || script.includes("registrar"))
    erros.push("script_garcom não pode pedir que o cliente digite ou registre nada: quem digita é o atendente, antes de ler o script");
  if (!MARCAS_PESSOAIS.some((m) => script.includes(m)))
    erros.push(`script_garcom precisa deixar claro que o desconto é deste cliente (ex.: "sua conta tem", "você recebeu")`);
  if (!/aplic/.test(script)) erros.push(`script_garcom termina perguntando se pode aplicar o desconto (ex.: "Posso aplicar?")`);

  // Aviso na entrada: todos leem antes de sentar. Não fala em desconto nem valor.
  const aviso = baixo(`${kit.cartaz_titulo} ${kit.cartaz_linha}`);
  for (const campo of ["cartaz_titulo", "cartaz_linha"] as const) {
    if (/\d\s*%|R\$/.test(kit[campo])) erros.push(`${campo} é visto por todos: não cite o valor do desconto`);
    if (baixo(kit[campo]).includes("desconto")) erros.push(`${campo} é visto por todos: não fale em desconto, fale com quem recebeu a mensagem`);
  }
  if (!/receb|convite/.test(aviso)) erros.push(`o aviso na entrada fala com quem recebeu a mensagem (ex.: "Recebeu nossa mensagem?")`);
  if (!/cheg|entrada/.test(aviso)) erros.push(`o aviso na entrada diz para avisar na chegada`);

  // Mensagem da equipe: os dois momentos, a tela decide quem tem desconto.
  const equipe = baixo(kit.mensagem_equipe);
  if (!equipe.includes("receb")) erros.push(`mensagem_equipe precisa dizer que só quem recebeu a oferta tem desconto`);
  if (!equipe.includes("vaga")) erros.push(`mensagem_equipe precisa dizer que as vagas são limitadas`);
  if (!/cheg|entrada|sent/.test(equipe)) erros.push(`mensagem_equipe precisa dizer o que fazer na chegada: digitar o telefone de quem disser que recebeu a mensagem`);
  if (!/conta|fechamento/.test(equipe)) erros.push(`mensagem_equipe precisa dizer o que fazer na conta: digitar de novo e aplicar`);
  if (!equipe.includes("tela")) erros.push(`mensagem_equipe precisa dizer que só tem desconto quem aparece na tela`);
  if (!equipe.includes(e.dia)) erros.push(`mensagem_equipe precisa citar o dia (${e.dia})`);
  if (!equipe.includes(baixo(e.hora_inicio))) erros.push(`mensagem_equipe precisa citar o horário de início (${e.hora_inicio})`);
  if (e.hora_fim && !equipe.includes(baixo(e.hora_fim))) erros.push(`mensagem_equipe precisa citar até quando vale (${e.hora_fim})`);
  return erros;
}

export function validarKit(
  texto: string,
  beneficio: BeneficioKit,
  entrada?: Pick<EntradaKit, "dia" | "hora_inicio" | "publico"> & Partial<Pick<EntradaKit, "hora_fim">>,
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
      linha: "Recebeu nossa mensagem? Avise na chegada que a gente confere.",
    },
    frequenta_outras: {
      script: `Que bom te ver aqui ${num} ${e.dia}. Por ter vindo nesse horário, sua conta tem ${b}. Posso aplicar?`,
      titulo: `Veio ${num} ${e.dia}?`,
      linha: "Recebeu nossa mensagem? Avise na chegada que a gente confere.",
    },
    delivery_nunca_veio: {
      script: `Você já conhecia nossa comida pelo delivery, né? Para a primeira vez no salão, sua conta tem ${b}. Posso aplicar?`,
      titulo: "Primeira vez no salão?",
      linha: "Pede nosso delivery e recebeu a mensagem? Avise na chegada que a gente confere.",
    },
    sumiu_60_dias: {
      script: `Que bom te ver de volta. Para marcar a volta, sua conta tem ${b}. Posso aplicar?`,
      titulo: "Que bom te ver de volta",
      linha: "Recebeu nossa mensagem? Avise na chegada que a gente confere.",
    },
    cozinha_similar: {
      script: `Primeira vez aqui na casa, né? Que bom que veio. Para essa primeira visita, sua conta tem ${b}. Posso aplicar?`,
      titulo: "Primeira vez aqui?",
      linha: "Recebeu nosso convite? Avise na chegada que a gente confere.",
    },
  };
  const t = porPublico[e.publico.segmento];
  return {
    script_garcom: t.script,
    mensagem_equipe:
      `Pessoal, campanha ${e.janela}: ${b} só para quem recebeu a oferta (${e.publico.quem}). ` +
      `Começa ${e.dia} às ${e.hora_inicio}. As vagas são limitadas e quem confirmou pela mensagem já tem a mesa garantida. ` +
      `Na chegada: quem disser que recebeu a mensagem, digitem o telefone na tela do salão, em "Chegada", e leiam a frase que aparece. ` +
      `Na conta: digitem de novo, em "Conta", leiam a frase da tela e toquem em Aplicar. ` +
      `Só tem desconto quem aparece na tela; para quem não aparece, a tela também mostra o que dizer.`,
    cartaz_titulo: t.titulo,
    cartaz_linha: t.linha,
  };
}

/**
 * O que o atendente diz quando o telefone não tem oferta. Texto fixo em código: o salão
 * nunca chama modelo. Explica sem fazer o cliente se sentir passado para trás.
 */
export const FALA_SEM_BENEFICIO =
  "Que pena, hoje não tem desconto pra esse número. Mas fica de olho: a gente manda ofertas por mensagem de vez em quando, e aí é só avisar quando chegar.";

/** O que dizer quando a oferta deste telefone já foi usada. */
export const falaJaUsado = (quando: string) =>
  `Essa oferta já foi usada ${quando}. Cada oferta vale uma vez; quando chegar outra por mensagem, é só avisar quando chegar.`;

/** Quando a oferta existe, mas as vagas acabaram antes de o cliente chegar (sem confirmar). */
export const FALA_SEM_VAGA =
  "Que pena, as vagas dessa oferta acabaram antes de você chegar. Da próxima vez, confirma pela mensagem que a sua fica guardada.";

/**
 * O que a recepção diz na chegada de quem tem oferta. Fixo em código (o salão nunca chama
 * modelo): depende só de a vaga ter sido confirmada antes ou guardada agora.
 */
export function falaChegada(reserva: { origem: "confirmacao" | "chegada"; agora: boolean }, beneficio: string): string {
  if (reserva.origem === "chegada" && reserva.agora)
    return `Ainda tinha vaga, então sua mesa ficou garantida agora: ${beneficio} na hora da conta.`;
  return `Sua mesa está garantida: ${beneficio} na hora da conta.`;
}
