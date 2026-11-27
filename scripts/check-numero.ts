// Teste rápido do parser de número brasileiro. Uso: npm run test:numero
import { formatarNumeroBR, lerCampoNumero, lerNumeroBR } from "../lib/numero";

const casos: [string, number][] = [
  ["1200", 1200],
  ["2.000", 2000],
  ["2.400,00", 2400],
  ["1.200", 1200],
  ["5000", 5000],
  ["120,50", 120.5],
  ["120.50", 120.5],
  ["86,4", 86.4],
  ["R$ 1.234,56", 1234.56],
  ["1.234.567", 1234567],
  ["15", 15],
];
const invalidos = ["", "abc", "2.40,00", "1,2,3", "12.34.5", "-5", "1.2.3"];

let falhas = 0;
for (const [entrada, esperado] of casos) {
  const obtido = lerNumeroBR(entrada);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHOU"} "${entrada}" → ${obtido}${ok ? "" : ` (esperado ${esperado})`}`);
}
for (const entrada of invalidos) {
  const obtido = lerNumeroBR(entrada);
  const ok = Number.isNaN(obtido);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHOU"} "${entrada}" → ${obtido}${ok ? "" : " (esperado NaN)"}`);
}
for (const [v, esperado] of [[null, NaN], [12, 12], ["2.000", 2000], [Number.NaN, NaN]] as [unknown, number][]) {
  const obtido = lerCampoNumero(v);
  const ok = Object.is(obtido, esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHOU"} lerCampoNumero(${JSON.stringify(v)}) → ${obtido}`);
}
const fmt = formatarNumeroBR(2400);
if (fmt !== "2.400,00") falhas++;
console.log(`${fmt === "2.400,00" ? "ok  " : "FALHOU"} formatarNumeroBR(2400) → "${fmt}"`);

console.log(falhas ? `\n${falhas} falha(s)` : "\ntodos passaram");
process.exit(falhas ? 1 : 0);
