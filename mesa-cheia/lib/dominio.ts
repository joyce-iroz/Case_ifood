// Constantes e utilitários de domínio sem dependência de banco.
// Dia da semana: 0 = domingo ... 6 = sábado (igual a Date.getUTCDay e extract(dow)).

export const RESTAURANTE_DEMO_ID = "5a1c0de0-0000-4000-8000-000000000001";
export const FUSO = "America/Sao_Paulo";

export const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export type Restaurante = {
  id: string;
  nome: string;
  cozinha: string;
  capacidade: number;
  ticket_medio: number;
  abre: string; // "HH:MM:SS"
  fecha: string;
  pausa_inicio: string | null;
  pausa_fim: string | null;
  dias_abertos: number[];
};

const horaDe = (t: string) => Number(t.slice(0, 2));

/** Horas cheias de funcionamento: hora h conta se o salão está aberto de h até h+1. */
export function horasDeFuncionamento(r: Pick<Restaurante, "abre" | "fecha" | "pausa_inicio" | "pausa_fim">): number[] {
  const horas: number[] = [];
  for (let h = horaDe(r.abre); h < horaDe(r.fecha); h++) {
    const naPausa = r.pausa_inicio && r.pausa_fim && h >= horaDe(r.pausa_inicio) && h < horaDe(r.pausa_fim);
    if (!naPausa) horas.push(h);
  }
  return horas;
}

/** Dias abertos ordenados de terça... até domingo, como o dono lê a semana (segunda primeiro). */
export function ordenarDiasSemana(dias: number[]): number[] {
  return [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/** Data de hoje (YYYY-MM-DD) no fuso do restaurante. */
export function hojeNoFuso(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

/** Soma dias a uma data YYYY-MM-DD, sem depender do fuso do servidor. */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diaDaSemana(data: string): number {
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

/** Data, hora e minuto de agora no fuso do restaurante. */
export function agoraNoFuso(agora = new Date()): { data: string; hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const p = (t: string) => partes.find((x) => x.type === t)!.value;
  return { data: `${p("year")}-${p("month")}-${p("day")}`, hora: Number(p("hour")), minuto: Number(p("minute")) };
}

/**
 * Instante ISO de uma data e hora cheia no fuso do restaurante.
 * São Paulo está em UTC−3 o ano todo desde 2019 (sem horário de verão).
 */
export function instanteNoFuso(data: string, hora: number): string {
  if (hora === 24) return instanteNoFuso(somarDias(data, 1), 0);
  return `${data}T${String(hora).padStart(2, "0")}:00:00-03:00`;
}

export const horaDoTime = (t: string) => Number(t.slice(0, 2));
export const timeDaHora = (h: number) => `${String(h).padStart(2, "0")}:00:00`;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatarMoeda = (v: number) => moeda.format(v);

const NOMES_DIA_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
export const nomeDiaLongo = (d: number) => NOMES_DIA_LONGO[d];

/** "ter 01/12" */
export function formatarDataCurta(data: string): string {
  const [, m, d] = data.split("-");
  return `${NOMES_DIA[diaDaSemana(data)].toLowerCase()} ${d}/${m}`;
}

/** "ter 01/12, 18h–23h" */
export function formatarJanela(data: string, inicio: number, fim: number): string {
  return `${formatarDataCurta(data)}, ${inicio}h–${fim}h`;
}
