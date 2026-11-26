// Ocupação média por dia da semana e hora. Aritmética sobre o histórico, nunca um modelo.
import {
  diaDaSemana,
  horasDeFuncionamento,
  ordenarDiasSemana,
  somarDias,
  type Restaurante,
} from "./dominio";

export type RegistroOcupacao = { data: string; hora: number; pessoas: number };

export type CelulaOcupacao = {
  dia: number;        // 0 = domingo
  hora: number;       // hora cheia de início: 19 = 19h–20h
  percentual: number; // média de pessoas / capacidade * 100, uma casa decimal
  amostras: number;   // quantos dias entraram na média
};

export type ResumoOcupacao = {
  restaurante: { id: string; nome: string; capacidade: number };
  periodo: { de: string; ate: string };
  dias: number[];
  horas: number[];
  celulas: CelulaOcupacao[];
  cadeirasHoraVazias30d: number;
};

/**
 * Média aritmética por (dia da semana, hora) e soma das cadeiras-hora vazias
 * nos 30 dias que terminam ontem (`hoje` exclusivo).
 */
export function calcularOcupacao(
  r: Restaurante,
  registros: RegistroOcupacao[],
  hoje: string,
): ResumoOcupacao {
  const soma = new Map<string, { pessoas: number; n: number }>();
  const inicio30 = somarDias(hoje, -30);
  let vazias30 = 0;
  let de = "";
  let ate = "";

  for (const reg of registros) {
    const chave = `${diaDaSemana(reg.data)}-${reg.hora}`;
    const acc = soma.get(chave) ?? { pessoas: 0, n: 0 };
    acc.pessoas += reg.pessoas;
    acc.n += 1;
    soma.set(chave, acc);
    if (reg.data >= inicio30 && reg.data < hoje) vazias30 += Math.max(0, r.capacidade - reg.pessoas);
    if (!de || reg.data < de) de = reg.data;
    if (!ate || reg.data > ate) ate = reg.data;
  }

  const dias = ordenarDiasSemana(r.dias_abertos);
  const horas = horasDeFuncionamento(r);
  const celulas: CelulaOcupacao[] = [];
  for (const dia of dias) {
    for (const hora of horas) {
      const acc = soma.get(`${dia}-${hora}`);
      if (!acc) continue;
      const percentual = Math.round((acc.pessoas / acc.n / r.capacidade) * 1000) / 10;
      celulas.push({ dia, hora, percentual, amostras: acc.n });
    }
  }

  return {
    restaurante: { id: r.id, nome: r.nome, capacidade: r.capacidade },
    periodo: { de, ate },
    dias,
    horas,
    celulas,
    cadeirasHoraVazias30d: vazias30,
  };
}

/**
 * Turno (bloco contínuo de horas abertas) com menor ocupação média.
 * Ex.: terça 18h–23h, 34%. Aritmética sobre a grade.
 */
export function janelaMaisVazia(
  resumo: ResumoOcupacao,
): { dia: number; inicio: number; fim: number; percentual: number } | null {
  const turnos: number[][] = [];
  for (const h of resumo.horas) {
    const atual = turnos.at(-1);
    if (atual && h === atual.at(-1)! + 1) atual.push(h);
    else turnos.push([h]);
  }
  let melhor: { dia: number; inicio: number; fim: number; percentual: number } | null = null;
  for (const dia of resumo.dias) {
    for (const t of turnos) {
      const cel = resumo.celulas.filter((c) => c.dia === dia && t.includes(c.hora));
      if (!cel.length) continue;
      const media = cel.reduce((s, c) => s + c.percentual, 0) / cel.length;
      if (!melhor || media < melhor.percentual)
        melhor = { dia, inicio: t[0], fim: t.at(-1)! + 1, percentual: Math.round(media * 10) / 10 };
    }
  }
  return melhor;
}
