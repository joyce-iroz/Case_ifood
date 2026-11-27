// Grupo de controle: mede o efeito real da campanha comparando quem recebeu o
// benefício com quem foi sorteado para não receber. Aritmética sobre visitas. Puro.
import { instanteNoFuso, diaDaSemana } from "./dominio";
import { ocorrencias } from "./campanha";
import type { VisitaCliente } from "./segmentos";

/** Sorteia `pct`% dos ids para o controle. `aleatorio` devolve [0, 1). */
export function sortearControle(ids: string[], pct: number, aleatorio: () => number): { tratados: string[]; controle: string[] } {
  const n = Math.round((ids.length * pct) / 100);
  const embaralhados = [...ids];
  for (let i = embaralhados.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [embaralhados[i], embaralhados[j]] = [embaralhados[j], embaralhados[i]];
  }
  const controle = new Set(embaralhados.slice(0, n));
  return { tratados: ids.filter((id) => !controle.has(id)), controle: ids.filter((id) => controle.has(id)) };
}

export type MedidaControle =
  | { estado: "sem_controle" }
  | { estado: "aguardando"; tamanhoControle: number }
  | {
      estado: "medido";
      tamanhoControle: number;
      taxaTratados: number;   // % de quem recebeu que veio em alguma ocorrência
      taxaControle: number;   // % do controle que veio mesmo sem benefício
      lift: number;           // diferença em pontos percentuais
      visitasAMais: number;   // lift aplicado aos tratados: visitas causadas pela campanha
    };

/**
 * Veio = tem visita numa das datas da campanha, numa hora que encosta na janela.
 * Só ocorrências que já terminaram entram na conta.
 */
export function medirControle(
  c: { data_janela: string; hora_inicio: number; hora_fim: number; semanas: number },
  tratados: string[],
  controle: string[],
  visitasDe: (id: string) => VisitaCliente[],
  agoraIso = new Date().toISOString(),
): MedidaControle {
  if (!controle.length) return { estado: "sem_controle" };
  const agora = new Date(agoraIso).getTime();
  const passadas = ocorrencias(c.data_janela, c.semanas).filter(
    (d) => new Date(instanteNoFuso(d, c.hora_fim)).getTime() <= agora,
  );
  if (!passadas.length) return { estado: "aguardando", tamanhoControle: controle.length };
  const dia = diaDaSemana(c.data_janela);
  const veio = (id: string) =>
    visitasDe(id).some(
      (v) => passadas.includes(v.data) && diaDaSemana(v.data) === dia && v.hora + 1 > c.hora_inicio && v.hora < c.hora_fim,
    );
  const taxa = (ids: string[]) => (ids.length ? ids.filter(veio).length / ids.length : 0);
  const taxaTratados = taxa(tratados);
  const taxaControle = taxa(controle);
  const lift = taxaTratados - taxaControle;
  return {
    estado: "medido",
    tamanhoControle: controle.length,
    taxaTratados: Math.round(taxaTratados * 1000) / 10,
    taxaControle: Math.round(taxaControle * 1000) / 10,
    lift: Math.round(lift * 1000) / 10,
    visitasAMais: Math.max(0, Math.round(lift * tratados.length)),
  };
}
