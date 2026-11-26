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
