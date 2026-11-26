// Histórico da demo: duas campanhas de três semanas atrás, já encerradas, com resgates.
// Uma acerta o público (delivery que nunca veio: tudo incremental) e a outra erra
// (quem já vinha às terças: tudo canibalizado). Puro: gera linhas, a rota grava.
import { calcularDesconto, textoBeneficio, type PropostaCampanha } from "./campanha";
import { instanteNoFuso, somarDias, timeDaHora } from "./dominio";
import { janelaNatural, kitTemplate } from "./kit-regras";
import { rotuloSegmento } from "./segmentos";
import { REGRAS_DEMO, RESTAURANTE_DEMO, mulberry32, ultimaOcorrencia, type ClienteGerado } from "./seed";

type ClienteComId = ClienteGerado & { id: string };

type Plano = {
  proposta: PropostaCampanha;
  publico: (c: ClienteComId) => boolean;
  emitir: number;
  resgatar: number;
  kitEntregue: boolean;
};

export function gerarHistorico(hoje: string, clientes: ClienteComId[], novoId: () => string) {
  const rand = mulberry32(424242);
  // Terça de 15 a 21 dias atrás: a janela já passou e a oferta já saiu do intervalo de 15 dias.
  const data = ultimaOcorrencia(hoje, 2, 2);
  const criadoEm = `${somarDias(data, -2)}T15:00:00-03:00`;

  const planos: Plano[] = [
    {
      proposta: { dia_semana: 2, hora_inicio: 18, hora_fim: 23, segmento: "delivery_nunca_veio", tipo: "percentual", valor: 15, teto: 300 },
      publico: (c) => c.linha.origem === "delivery",
      emitir: 50,
      resgatar: 9,
      kitEntregue: true,
    },
    {
      proposta: { dia_semana: 2, hora_inicio: 18, hora_fim: 23, segmento: "frequenta_janela", tipo: "percentual", valor: 10, teto: 200 },
      publico: (c) => c.linha.dia_habitual === 2 && c.linha.turno_habitual === "jantar" && c.visitas.some((v) => v.data >= somarDias(hoje, -60)),
      emitir: 30,
      resgatar: 10,
      kitEntregue: false,
    },
  ];

  const campanhas: Record<string, unknown>[] = [];
  const beneficios: Record<string, unknown>[] = [];
  const resgates: Record<string, unknown>[] = [];
  const kits: Record<string, unknown>[] = [];
  const visitasNovas: { cliente_id: string; data: string; hora: number }[] = [];

  for (const plano of planos) {
    const p = plano.proposta;
    const campanhaId = novoId();
    campanhas.push({
      id: campanhaId,
      restaurante_id: RESTAURANTE_DEMO.id,
      dia_semana: p.dia_semana,
      hora_inicio: timeDaHora(p.hora_inicio),
      hora_fim: timeDaHora(p.hora_fim),
      segmento: p.segmento,
      tipo: p.tipo,
      valor: p.valor,
      teto: p.teto,
      status: "encerrada",
      data_janela: data,
      criado_em: criadoEm,
    });

    const alvo = clientes.filter(plano.publico).slice(0, plano.emitir);
    let gasto = 0;
    const passo = Math.max(1, Math.floor(alvo.length / plano.resgatar)); // resgata 1 a cada `passo`
    alvo.forEach((c, i) => {
      const beneficioId = novoId();
      const resgatou = i % passo === 0 && i / passo < plano.resgatar;
      beneficios.push({
        id: beneficioId,
        campanha_id: campanhaId,
        cliente_id: c.id,
        codigo: String(1000 + i * 37 + Math.floor(rand() * 30)).padStart(4, "0"),
        valido_de: instanteNoFuso(data, p.hora_inicio),
        valido_ate: instanteNoFuso(data, p.hora_fim),
        status: resgatou ? "resgatado" : "expirado",
        criado_em: criadoEm,
      });
      if (!resgatou) return;
      const hora = 19 + Math.floor(rand() * 3);
      const conta = Math.round((60 + rand() * 120) * 100) / 100;
      const { desconto } = calcularDesconto(p, conta, REGRAS_DEMO.desconto_max, p.teto - gasto);
      gasto += desconto;
      // Incremental gravado como o resgate grava: o cliente já vinha nessa janela?
      const incremental = p.segmento !== "frequenta_janela";
      resgates.push({
        beneficio_id: beneficioId,
        valor_conta: conta,
        desconto,
        incremental,
        criado_em: `${data}T${timeDaHora(hora + 0.5)}-03:00`,
      });
      visitasNovas.push({ cliente_id: c.id, data, hora });
    });

    const textos = kitTemplate({
      restaurante: { nome: RESTAURANTE_DEMO.nome, cozinha: RESTAURANTE_DEMO.cozinha, ticket_medio: RESTAURANTE_DEMO.ticket_medio },
      janela: janelaNatural(p.dia_semana, p.hora_inicio, p.hora_fim),
      beneficio: textoBeneficio(p.tipo, p.valor),
      segmento: rotuloSegmento(p.segmento),
    });
    kits.push({
      campanha_id: campanhaId,
      ...textos,
      modelo: null,
      criado_em: criadoEm,
      entregue_em: plano.kitEntregue ? `${somarDias(data, -1)}T11:00:00-03:00` : null,
    });
  }

  return { campanhas, beneficios, resgates, kits, visitasNovas, data };
}
