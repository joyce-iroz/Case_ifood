// Telefone celular brasileiro. Puro, pode rodar no navegador.

/** Só dígitos, com DDI 55. Aceita "11987654321", "+55 (11) 98765-4321" etc. */
export function normalizarTelefone(entrada: string): string {
  const d = entrada.replace(/\D/g, "");
  return d.length === 11 ? `55${d}` : d;
}

/** "(11) 9••••-••41" a partir dos dígitos digitados (com ou sem 55). Mostra o que já foi digitado. */
export function mascararTelefone(entrada: string): string {
  let d = entrada.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  const pos = (i: number, visivel: boolean) => (i < d.length ? (visivel ? d[i] : "•") : "_");
  const ddd = pos(0, true) + pos(1, true);
  const meio = [2, 3, 4, 5, 6].map((i) => pos(i, i === 2)).join("");
  const fim = [7, 8, 9, 10].map((i) => pos(i, i >= 9)).join("");
  return `(${ddd}) ${meio}-${fim}`;
}

/** Máscara quando só se conhecem os 4 últimos dígitos (o que o banco guarda). */
export function mascararPorFinal(final4: string): string {
  return `(••) •••••-••${final4.slice(-2)}`;
}

/** "(11) 98765-4321". Só para o painel de demonstração. */
export function formatarTelefoneCompleto(entrada: string): string {
  let d = entrada.replace(/\D/g, "");
  if (d.length === 13) d = d.slice(2);
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
