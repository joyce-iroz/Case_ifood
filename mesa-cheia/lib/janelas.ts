// Janelas candidatas para campanha. Aritmética sobre a grade de ocupação, sem modelo. Puro.
import { formatarHora, horasDeFuncionamento, NOMES_DIA, type Restaurante } from "./dominio";
import type { ResumoOcupacao } from "./ocupacao";

export const MARGEM_TURNO = 0.5;  // descarta os primeiros e os últimos 30 minutos de cada turno
export const DURACAO_MIN = 1;     // horas
export const DURACAO_MAX = 3;
const PASSO = 0.5;                // janelas começam e terminam em hora cheia ou meia hora

export type JanelaCandidata = {
  dia: number;
  inicio: number;          // 18.5 = 18h30
  fim: number;
  rotulo: string;          // "Ter 18h30–20h"
  ocupacaoMedia: number;   // % da capacidade, média pesada pelo tempo
  cadeirasVazias: number;  // cadeiras-hora vazias numa ocorrência média da janela
};

/** Turnos como blocos contínuos de horas abertas: [[11,15],[18,23]]. */
export function turnos(r: Pick<Restaurante, "abre" | "fecha" | "pausa_inicio" | "pausa_fim">): [number, number][] {
  const blocos: [number, number][] = [];
  for (const h of horasDeFuncionamento(r)) {
    const ultimo = blocos.at(-1);
    if (ultimo && ultimo[1] === h) ultimo[1] = h + 1;
    else blocos.push([h, h + 1]);
  }
  return blocos;
}

/**
 * Todas as janelas de 1h a 3h, em passos de 30 minutos, dentro de cada turno menos
 * a margem, em que cada meia hora está abaixo de `ocupacaoMin`. Ordenadas por
 * cadeiras vazias em número absoluto (não por percentual).
 */
export function calcularCandidatas(
  resumo: ResumoOcupacao,
  restaurante: Restaurante,
  ocupacaoMin: number,
): JanelaCandidata[] {
  const pct = new Map(resumo.celulas.map((c) => [`${c.dia}-${c.hora}`, c.percentual]));
  const cap = resumo.restaurante.capacidade;
  const lista: JanelaCandidata[] = [];

  for (const dia of resumo.dias) {
    for (const [abre, fecha] of turnos(restaurante)) {
      const de = abre + MARGEM_TURNO;
      const ate = fecha - MARGEM_TURNO;
      for (let inicio = de; inicio < ate; inicio += PASSO) {
        for (let fim = inicio + DURACAO_MIN; fim <= Math.min(ate, inicio + DURACAO_MAX); fim += PASSO) {
          let soma = 0;
          let vazias = 0;
          let valida = true;
          for (let t = inicio; t < fim; t += PASSO) {
            const p = pct.get(`${dia}-${Math.floor(t)}`);
            if (p === undefined || p >= ocupacaoMin) {
              valida = false;
              break;
            }
            soma += p * PASSO;
            vazias += cap * (1 - p / 100) * PASSO;
          }
          if (!valida) continue;
          lista.push({
            dia,
            inicio,
            fim,
            rotulo: `${NOMES_DIA[dia]} ${formatarHora(inicio)}–${formatarHora(fim)}`,
            ocupacaoMedia: Math.round((soma / (fim - inicio)) * 10) / 10,
            cadeirasVazias: Math.round(vazias * 10) / 10,
          });
        }
      }
    }
  }
  return lista.sort((a, b) => b.cadeirasVazias - a.cadeirasVazias || a.dia - b.dia || a.inicio - b.inicio);
}
