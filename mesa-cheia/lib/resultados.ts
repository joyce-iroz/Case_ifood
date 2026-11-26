// Resultado por campanha. Aritmética sobre resgates gravados. Puro.

export type LinhaResultado = {
  emitidos: number;
  resgatados: number;
  taxaResgate: number | null;        // % dos emitidos
  somaContas: number;                // soma de valor_conta (antes do desconto)
  receitaIncremental: number;        // soma de (valor_conta − desconto) dos resgates incrementais
  resgatesIncrementais: number;
  custoDescontos: number;            // soma de desconto de todos os resgates
  custoPorIncremental: number | null; // custoDescontos / resgatesIncrementais
};

export function resumirCampanha(
  beneficios: { status: string }[],
  resgates: { valor_conta: number; desconto: number; incremental: boolean }[],
): LinhaResultado {
  const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const inc = resgates.filter((r) => r.incremental);
  const custo = soma(resgates.map((r) => r.desconto));
  return {
    emitidos: beneficios.length,
    resgatados: resgates.length,
    taxaResgate: beneficios.length ? Math.round((resgates.length / beneficios.length) * 1000) / 10 : null,
    somaContas: soma(resgates.map((r) => r.valor_conta)),
    receitaIncremental: soma(inc.map((r) => r.valor_conta - r.desconto)),
    resgatesIncrementais: inc.length,
    custoDescontos: custo,
    custoPorIncremental: inc.length ? Math.round((custo / inc.length) * 100) / 100 : null,
  };
}
