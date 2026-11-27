// Diagnóstico para restaurante novo (página de captação). O dono marca cada turno como
// cheio, médio ou vazio; a conta é aritmética sobre essas marcações. Puro.
import { NOMES_DIA } from "./dominio";

export type Nivel = "cheio" | "medio" | "vazio";
/** Ocupação média assumida para cada marcação. */
export const OCUPACAO_NIVEL: Record<Nivel, number> = { cheio: 0.9, medio: 0.6, vazio: 0.35 };

export type EntradaDiagnostico = {
  capacidade: number;
  ticketMedio: number;
  turnos: { nome: string; inicio: number; fim: number }[];
  dias: number[]; // 0 = domingo
  niveis: Record<string, Nivel>; // chave `${dia}-${turnoIndex}`
};

export type ResultadoDiagnostico = {
  celulas: { dia: number; turno: number; ocupacao: number; vazias: number }[];
  vaziasSemana: number;         // cadeiras-hora vazias por semana
  vaziasMes: number;            // x 4,3 semanas
  piores: { rotulo: string; vazias: number; ocupacao: number }[];
  recuperavelMes: number;       // cadeiras-hora se recuperar 5% das vazias dos turnos vazios
  receitaMes: number;           // recuperável / permanência × ticket
};

export const SEMANAS_MES = 4.3;
export const META_RECUPERACAO = 0.05;
export const PERMANENCIA_H = 1.5;

export function diagnosticar(e: EntradaDiagnostico): ResultadoDiagnostico {
  const celulas: ResultadoDiagnostico["celulas"] = [];
  for (const dia of e.dias)
    e.turnos.forEach((t, i) => {
      const nivel = e.niveis[`${dia}-${i}`] ?? "medio";
      const ocupacao = OCUPACAO_NIVEL[nivel];
      const horas = Math.max(0, t.fim - t.inicio);
      celulas.push({ dia, turno: i, ocupacao, vazias: Math.round(e.capacidade * (1 - ocupacao) * horas) });
    });
  const vaziasSemana = celulas.reduce((a, c) => a + c.vazias, 0);
  const vaziasTurnosVazios = celulas.filter((c) => c.ocupacao <= OCUPACAO_NIVEL.vazio).reduce((a, c) => a + c.vazias, 0);
  const recuperavelMes = Math.round(vaziasTurnosVazios * SEMANAS_MES * META_RECUPERACAO);
  return {
    celulas,
    vaziasSemana,
    vaziasMes: Math.round(vaziasSemana * SEMANAS_MES),
    piores: [...celulas]
      .sort((a, b) => b.vazias - a.vazias)
      .slice(0, 3)
      .map((c) => ({
        rotulo: `${NOMES_DIA[c.dia]} · ${e.turnos[c.turno].nome}`,
        vazias: c.vazias,
        ocupacao: Math.round(c.ocupacao * 100),
      })),
    recuperavelMes,
    receitaMes: Math.round((recuperavelMes / PERMANENCIA_H) * e.ticketMedio),
  };
}
