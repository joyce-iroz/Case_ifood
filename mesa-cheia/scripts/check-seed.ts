// Confere o seed sem banco: imprime a grade e os totais. Uso: npm run check:seed
import { NOMES_DIA, hojeNoFuso, somarDias } from "../lib/dominio";
import { RESTAURANTE_DEMO, gerarClientes, gerarOcupacao } from "../lib/seed";
import { calcularOcupacao } from "../lib/ocupacao";

const hoje = process.argv[2] ?? hojeNoFuso();
const linhas = gerarOcupacao(hoje);
const resumo = calcularOcupacao(RESTAURANTE_DEMO, linhas, hoje);

console.log(`hoje=${hoje}  linhas de ocupação=${linhas.length}  período=${resumo.periodo.de}..${resumo.periodo.ate}`);
console.log("hora  " + resumo.dias.map((d) => NOMES_DIA[d].padStart(6)).join(""));
for (const h of resumo.horas) {
  const linha = resumo.dias.map((d) => {
    const c = resumo.celulas.find((x) => x.dia === d && x.hora === h);
    return (c ? `${c.percentual.toFixed(0)}%${c.percentual < 50 ? "*" : " "}` : "-").padStart(6);
  });
  console.log(`${String(h).padStart(2)}h  ${linha.join("")}`);
}
const tercaNoite = resumo.celulas.filter((c) => c.dia === 2 && c.hora >= 18);
const media = tercaNoite.reduce((s, c) => s + c.percentual, 0) / tercaNoite.length;
console.log(`terça à noite (18h–23h): ${media.toFixed(1)}%`);
console.log(`cadeiras-hora vazias nos últimos 30 dias: ${resumo.cadeirasHoraVazias30d}`);

const clientes = gerarClientes(hoje);
const corte60 = somarDias(hoje, -60);
const ativos = clientes.filter((c) => c.ultima_visita && c.ultima_visita >= corte60);
console.log({
  total: clientes.length,
  tercaNoite: ativos.filter((c) => c.dia_habitual === 2 && c.turno_habitual === "jantar").length,
  outrasJanelas: ativos.filter((c) => !(c.dia_habitual === 2 && c.turno_habitual === "jantar")).length,
  soDelivery: clientes.filter((c) => c.origem === "delivery" && c.visitas === 0).length,
  sumidos: clientes.filter((c) => c.ultima_visita && c.ultima_visita < corte60).length,
  hashesUnicos: new Set(clientes.map((c) => c.telefone_hash)).size,
});
