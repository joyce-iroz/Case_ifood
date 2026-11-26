import "server-only";
import { carregarCampanhasCompletas, carregarClientesComVisitas, expirarVencidos, type CampanhaRegistro } from "./dados";
import { RESTAURANTE_DEMO_ID, hojeNoFuso, instanteNoFuso } from "./dominio";
import { carregarKits, type Kit } from "./kit";
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
  kit: Kit | null;
  ativa: boolean; // a janela ainda não terminou
};

export type TelefoneTeste = {
  nome: string;
  telefone: string; // completo, só para a demo
  campanha: CampanhaRegistro;
  esperadoIncremental: boolean;
};

export type TelefoneResgatado = {
  nome: string;
  telefone: string; // completo, só para a demo
  campanha: CampanhaRegistro;
  valorConta: number;
  desconto: number;
  resgatadoEm: string;
};

export async function carregarPainel(id = RESTAURANTE_DEMO_ID): Promise<{
  campanhas: CampanhaPainel[];
  telefonesTeste: TelefoneTeste[];
  jaResgataram: TelefoneResgatado[];
}> {
  await expirarVencidos();
  const hoje = hojeNoFuso();
  const [{ campanhas, beneficios, resgates }, base] = await Promise.all([
    carregarCampanhasCompletas(id),
    carregarClientesComVisitas(id),
  ]);
  const kits = await carregarKits(campanhas.map((c) => c.id));
  const agoraMs = Date.now();
  const cliente = new Map(base.clientes.map((c) => [c.id, c]));
  const resgateDe = new Map(resgates.map((r) => [r.beneficio_id, r]));

  const linhas: CampanhaPainel[] = campanhas.map((c) => {
    const bs = beneficios.filter((b) => b.campanha_id === c.id);
    const rs = bs.flatMap((b) => (resgateDe.has(b.id) ? [resgateDe.get(b.id)!] : []));
    const ordem = { resgatado: 0, emitido: 1, expirado: 2 } as const;
    return {
      campanha: c,
      kit: kits.get(c.id) ?? null,
      ativa: new Date(instanteNoFuso(c.data_janela, c.hora_fim)).getTime() > agoraMs,
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

  // Quem já usou: o benefício mais recente do cliente é o resgatado, então o salão
  // responde "já usado" (se ele tiver um benefício novo, a resposta seria "ativo").
  const maisRecente = new Map<string, (typeof beneficios)[number]>();
  for (const b of beneficios) {
    const atual = maisRecente.get(b.cliente_id);
    if (!atual || b.criado_em > atual.criado_em) maisRecente.set(b.cliente_id, b);
  }
  const jaResgataram: TelefoneResgatado[] = [];
  for (const r of [...resgates].sort((a, b) => b.criado_em.localeCompare(a.criado_em))) {
    const b = beneficios.find((x) => x.id === r.beneficio_id);
    if (!b || maisRecente.get(b.cliente_id)?.id !== b.id) continue;
    const cl = cliente.get(b.cliente_id);
    const tel = cl && telefonePorHash.get(cl.telefone_hash);
    const camp = campanhaPorId.get(b.campanha_id);
    if (!cl || !tel || !camp) continue;
    jaResgataram.push({
      nome: cl.nome,
      telefone: formatarTelefoneCompleto(tel),
      campanha: camp,
      valorConta: r.valor_conta,
      desconto: r.desconto,
      resgatadoEm: r.criado_em,
    });
    if (jaResgataram.length === 4) break;
  }

  return { campanhas: linhas, telefonesTeste, jaResgataram };
}
