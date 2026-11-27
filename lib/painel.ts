import "server-only";
import { carregarCampanhasCompletas, carregarClientesComVisitas, carregarRegras, carregarRestaurante, expirarVencidos, reservaPendente, type CampanhaRegistro } from "./dados";
import { valorDaVaga, vagasDoTeto } from "./projecao";
import { RESTAURANTE_DEMO_ID, hojeNoFuso, somarDias } from "./dominio";
import { verificarPausas } from "./pausa";
import { medirControle, type MedidaControle } from "./controle";
import { carregarKits, kitAtual, type Kit } from "./kit";
import { fimDaCampanha, janelaDa } from "./campanha";
import { segmentoAnonimo, visitouNaJanela } from "./segmentos";
import { cadeirasRecuperadas, resumirCampanha, type LinhaResultado } from "./resultados";
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
  ativa: boolean; // ainda não terminou e não foi pausada
  controle: MedidaControle;
  // Vagas do teto: cada uma separa o desconto máximo de uma mesa.
  vagas: { valor: number; total: number; usadas: number; garantidas: number; livres: number };
};

export type TelefoneTeste = {
  nome: string;
  telefone: string; // completo, só para a demo
  campanha: CampanhaRegistro;
  esperadoIncremental: boolean;
  token: string; // link da oferta (/oferta/<token>), o que o cliente receberia
  garantida: boolean;
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
  cadeirasRecuperadas30d: number;
  receitaNova30d: number;
}> {
  await verificarPausas(id);
  await expirarVencidos();
  const hoje = hojeNoFuso();
  const [{ campanhas, beneficios, resgates, controles }, base, restaurante, regras] = await Promise.all([
    carregarCampanhasCompletas(id),
    carregarClientesComVisitas(id),
    carregarRestaurante(id),
    carregarRegras(id),
  ]);
  const kits = await carregarKits(campanhas.map((c) => c.id));
  const agoraMs = Date.now();
  const cliente = new Map(base.clientes.map((c) => [c.id, c]));
  const resgateDe = new Map(resgates.map((r) => [r.beneficio_id, r]));

  const linhas: CampanhaPainel[] = campanhas.map((c) => {
    const bs = beneficios.filter((b) => b.campanha_id === c.id);
    const rs = bs.flatMap((b) => (resgateDe.has(b.id) ? [resgateDe.get(b.id)!] : []));
    const ordem = { resgatado: 0, emitido: 1, expirado: 2 } as const;
    const vaga = valorDaVaga(c, restaurante.ticket_medio, regras.desconto_max);
    const gasto = rs.reduce((s, r) => s + r.desconto, 0);
    const garantidas = bs.filter((b) => reservaPendente(b, agoraMs)).length;
    const { total, livres } = vagasDoTeto(c.teto, gasto, garantidas, vaga);
    return {
      campanha: c,
      vagas: { valor: vaga, total, usadas: rs.length, garantidas, livres: c.status === "ativa" ? livres : 0 },
      kit: kits.has(c.id) ? kitAtual(kits.get(c.id)!, c, restaurante) : null,
      ativa: c.status === "ativa" && new Date(fimDaCampanha(c)).getTime() > agoraMs,
      controle: medirControle(
        c,
        bs.map((b) => b.cliente_id),
        controles.filter((k) => k.campanha_id === c.id).map((k) => k.cliente_id),
        base.visitasDe,
      ),
      resultado: resumirCampanha(bs, rs),
      beneficios: bs
        .map((b) => {
          const cl = cliente.get(b.cliente_id);
          const r = resgateDe.get(b.id);
          // Cliente da região é dado da plataforma: o restaurante vê o resgate, não a pessoa.
          const anonimo = segmentoAnonimo(c.segmento) && cl?.origem === "regiao";
          return {
            nome: anonimo ? "Cliente da região (via iFood)" : (cl?.nome ?? "—"),
            telefone: anonimo || !cl ? "—" : mascararPorFinal(cl.telefone_final),
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
      token: b.token,
      garantida: reservaPendente(b, agora),
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

  const desde = `${somarDias(hoje, -30)}T00:00:00-03:00`;
  const recentes = resgates.filter((r) => new Date(r.criado_em).getTime() >= new Date(desde).getTime());

  const receitaNova30d =
    Math.round(recentes.filter((r) => r.incremental).reduce((a, r) => a + r.valor_conta - r.desconto, 0) * 100) / 100;

  return {
    campanhas: linhas,
    telefonesTeste,
    jaResgataram,
    cadeirasRecuperadas30d: cadeirasRecuperadas(recentes),
    receitaNova30d,
  };
}
