import "server-only";
import { carregarCampanhasCompletas, carregarClientesComVisitas, expirarVencidos, type CampanhaRegistro } from "./dados";
import { RESTAURANTE_DEMO_ID, hojeNoFuso } from "./dominio";
import { janelaDa } from "./campanha";
import { visitouNaJanela } from "./segmentos";
import { resumirCampanha, type LinhaResultado } from "./resultados";
import { gerarClientesCompletos } from "./seed";
import { formatarTelefoneCompleto, mascararPorFinal } from "./telefone";

export type BeneficioPainel = {
  nome: string;
  telefone: string; // mascarado
  codigo: string;
  status: "emitido" | "resgatado" | "expirado";
  desconto: number | null;
  incremental: boolean | null;
};

export type CampanhaPainel = {
  campanha: CampanhaRegistro;
  resultado: LinhaResultado;
  beneficios: BeneficioPainel[];
};

export type TelefoneTeste = {
  nome: string;
  telefone: string; // completo, só para a demo
  campanha: CampanhaRegistro;
  esperadoIncremental: boolean;
};

export async function carregarPainel(id = RESTAURANTE_DEMO_ID): Promise<{
  campanhas: CampanhaPainel[];
  telefonesTeste: TelefoneTeste[];
}> {
  await expirarVencidos();
  const hoje = hojeNoFuso();
  const [{ campanhas, beneficios, resgates }, base] = await Promise.all([
    carregarCampanhasCompletas(id),
    carregarClientesComVisitas(id),
  ]);
  const cliente = new Map(base.clientes.map((c) => [c.id, c]));
  const resgateDe = new Map(resgates.map((r) => [r.beneficio_id, r]));

  const linhas: CampanhaPainel[] = campanhas.map((c) => {
    const bs = beneficios.filter((b) => b.campanha_id === c.id);
    const rs = bs.flatMap((b) => (resgateDe.has(b.id) ? [resgateDe.get(b.id)!] : []));
    const ordem = { resgatado: 0, emitido: 1, expirado: 2 } as const;
    return {
      campanha: c,
      resultado: resumirCampanha(bs, rs),
      beneficios: bs
        .map((b) => {
          const cl = cliente.get(b.cliente_id);
          const r = resgateDe.get(b.id);
          return {
            nome: cl?.nome ?? "—",
            telefone: cl ? mascararPorFinal(cl.telefone_final) : "—",
            codigo: b.codigo,
            status: b.status,
            desconto: r?.desconto ?? null,
            incremental: r?.incremental ?? null,
          };
        })
        .sort((a, b) => ordem[a.status] - ordem[b.status] || a.nome.localeCompare(b.nome)),
    };
  });

  // Telefones de teste: o banco só tem o hash; o seed regenera os telefones em claro.
  const telefonePorHash = new Map(
    gerarClientesCompletos(hoje).map((g) => [g.linha.telefone_hash, g.telefone]),
  );
  const campanhaPorId = new Map(campanhas.map((c) => [c.id, c]));
  const agora = Date.now();
  const candidatos: TelefoneTeste[] = [];
  const vistos = new Set<string>();
  for (const b of beneficios) {
    if (b.status !== "emitido" || new Date(b.valido_ate).getTime() <= agora || vistos.has(b.cliente_id)) continue;
    const cl = cliente.get(b.cliente_id);
    const tel = cl && telefonePorHash.get(cl.telefone_hash);
    const camp = campanhaPorId.get(b.campanha_id);
    if (!cl || !tel || !camp) continue;
    vistos.add(b.cliente_id);
    candidatos.push({
      nome: cl.nome,
      telefone: formatarTelefoneCompleto(tel),
      campanha: camp,
      esperadoIncremental: !visitouNaJanela(base.visitasDe(cl.id), janelaDa(camp), hoje),
    });
  }
  // Mistura os dois casos para a apresentação mostrar incremental e não incremental.
  const sim = candidatos.filter((t) => t.esperadoIncremental);
  const nao = candidatos.filter((t) => !t.esperadoIncremental);
  const telefonesTeste: TelefoneTeste[] = [];
  while (telefonesTeste.length < 10 && (sim.length || nao.length)) {
    const proximo = (telefonesTeste.length % 2 === 0 ? sim.shift() ?? nao.shift() : nao.shift() ?? sim.shift())!;
    telefonesTeste.push(proximo);
  }

  return { campanhas: linhas, telefonesTeste };
}
