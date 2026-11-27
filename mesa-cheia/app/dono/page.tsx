import Link from "next/link";

/** Troque a cada entrega: mostra na aba Demo qual versão está no ar. */
const VERSAO = "27/11 · teto com gasto e reservado";
import { Fragment } from "react";
import { BotaoResetar } from "@/components/BotaoResetar";
import { Marca } from "@/components/Marca";
import { FormCampanha } from "@/components/FormCampanha";
import { FormRegras } from "@/components/FormRegras";
import { CopiarTelefone } from "@/components/CopiarTelefone";
import { KitAtivacao } from "@/components/KitAtivacao";
import { BotaoSimularCheia } from "@/components/BotaoSimularCheia";
import { Planejador } from "@/components/Planejador";
import { Tentativas } from "@/components/Tentativas";
import { Info } from "@/components/Info";
import { listarPlanejamentos, type PlanejamentoView } from "@/lib/planejador";
import { carregarRegras, carregarRestaurante, obterResumoOcupacao } from "@/lib/dados";
import { hojeNoFuso, nomeMes, NOMES_DIA, formatarDataCurta, formatarHora, formatarMoeda, horaDoTime, horasDeFuncionamento, type Restaurante } from "@/lib/dominio";
import type { Regras } from "@/lib/campanha";
import { contextoDaJanela, type ContextoJanela } from "@/lib/emissao";
import { descreverErro } from "@/lib/erros";
import { carregarPainel, type CampanhaPainel, type TelefoneResgatado, type TelefoneTeste } from "@/lib/painel";
import { textoBeneficio, comprometidoNoMes } from "@/lib/campanha";
import { canibalizadoEmAlerta } from "@/lib/resultados";
import { rotuloSegmento } from "@/lib/segmentos";
import { janelaMaisVazia, type ResumoOcupacao } from "@/lib/ocupacao";
import { META_RECUPERACAO } from "@/lib/diagnostico";
import { PERMANENCIA_H } from "@/lib/resultados";

export const dynamic = "force-dynamic";

const OCUPACAO_MIN_PADRAO = 50;
const fmt = new Intl.NumberFormat("pt-BR");
const fmtData = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

const ABAS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "campanhas", rotulo: "Campanhas" },
  { id: "configurar", rotulo: "Configurar" },
  { id: "demo", rotulo: "Demo" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

type Busca = { aba?: string; regras?: string; dia?: string; inicio?: string; fim?: string };

export default async function Dono({ searchParams }: { searchParams: Promise<Busca> }) {
  const q = await searchParams;
  const aba: Aba = ABAS.some((a) => a.id === q.aba) ? (q.aba as Aba) : "hoje";
  let resumo: ResumoOcupacao | null = null;
  let limite = OCUPACAO_MIN_PADRAO;
  let painel: Awaited<ReturnType<typeof carregarPainel>> | null = null;
  let form: { dias: number[]; horas: number[]; fecha: number; janela: { dia: number; inicio: number; fim: number }; ctx: ContextoJanela | null } | null = null;
  let falha: string | null = null;
  let restauranteInfo: Restaurante | null = null;
  let regrasInfo: Regras | null = null;
  let planejamentos: PlanejamentoView[] = [];

  try {
    const restaurante = await carregarRestaurante();
    const horas = horasDeFuncionamento(restaurante);
    const fecha = horaDoTime(restaurante.fecha);
    // Janela do formulário: a que veio da grade (?dia=&inicio=&fim=) ou terça à noite.
    const pedida = { dia: Number(q.dia), inicio: Number(q.inicio), fim: Number(q.fim) };
    const valida =
      restaurante.dias_abertos.includes(pedida.dia) &&
      horas.includes(pedida.inicio) &&
      Number.isInteger(pedida.fim) &&
      pedida.fim > pedida.inicio &&
      pedida.fim <= fecha;
    const janela = valida ? pedida : { dia: 2, inicio: 18, fim: 23 };
    const [r, regras, p, ctx, planos] = await Promise.all([
      obterResumoOcupacao(undefined, restaurante),
      carregarRegras(),
      carregarPainel(),
      contextoDaJanela(janela),
      listarPlanejamentos(10),
    ]);
    planejamentos = planos;
    resumo = r;
    restauranteInfo = restaurante;
    regrasInfo = regras;
    limite = regras.ocupacao_min;
    painel = p;
    form = { dias: r.dias, horas, fecha, janela, ctx };
  } catch (e) {
    falha = descreverErro(e).mensagem;
  }

  const temDados = !!resumo && resumo.celulas.length > 0;
  const contagem: Partial<Record<Aba, number>> = { campanhas: painel?.campanhas.length };

  return (
    <>
      <header className="barra">
        <div className="barra-conteudo">
          <div className="identidade">
            <Marca />
            {restauranteInfo && (
              <div className="restaurante">
                <b>{restauranteInfo.nome}</b>
                <span>
                  {restauranteInfo.cozinha} · {restauranteInfo.capacidade} lugares
                </span>
              </div>
            )}
          </div>
          <nav className="papeis-nav" aria-label="Papel">
            <Link href="/dono" aria-current="page">Dono</Link>
            <Link href="/salao">Salão</Link>
            <BotaoResetar />
          </nav>
        </div>
        <div className="abas-faixa">
          <nav className="abas" aria-label="Seções do painel">
            {ABAS.map((a) => (
              <Link key={a.id} href={`/dono?aba=${a.id}`} aria-current={aba === a.id ? "page" : undefined} className="aba">
                {a.rotulo}
                {contagem[a.id] ? <span className="aba-qtd">{contagem[a.id]}</span> : null}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="pagina">
        {falha && (
          <p className="aviso">
            {falha} Se o banco já tem as tabelas de <code>supabase/schema.sql</code>, clique em “Resetar demo”.
          </p>
        )}

        {resumo && resumo.celulas.length === 0 && (
          <p className="aviso">Ainda não há histórico de ocupação. Clique em “Resetar demo”.</p>
        )}

        {aba === "hoje" && temDados && painel && form?.ctx && regrasInfo && (
          <>
            <Destaque
              resumo={resumo!}
              painel={painel.campanhas}
              ctx={form.ctx}
              regras={regrasInfo}
              recuperadas={painel.cadeirasRecuperadas30d}
              receitaNova={painel.receitaNova30d}
              ticketMedio={restauranteInfo!.ticket_medio}
            />
            <section className="cartao-painel" aria-labelledby="t-plan">
              <Planejador inicial={planejamentos.find((x) => x.status === "proposta") ?? null} />
            </section>
            <section className="cartao-painel" aria-labelledby="t-ocup">
              <Grade resumo={resumo!} limite={limite} />
            </section>
          </>
        )}

        {aba === "campanhas" && painel && (
          <>
            {painel.campanhas.length > 0 && <BlocoKits campanhas={painel.campanhas} />}
            <section className="cartao-painel" aria-labelledby="t-res">
              <h2 id="t-res">Resultado das campanhas</h2>
              <Resultados campanhas={painel.campanhas} />
            </section>
          </>
        )}

        {aba === "configurar" && temDados && form && (
          <div className="duas-colunas">
            <section className="cartao-painel ocupacao" aria-labelledby="t-camp" id="nova">
              <h2 id="t-camp">Nova campanha manual</h2>
              <p className="legenda" style={{ marginBottom: 16 }}>Qualquer dia e horário.</p>
              <FormCampanha
                key={`${form.janela.dia}-${form.janela.inicio}-${form.janela.fim}`}
                dias={form.dias}
                horas={form.horas}
                fecha={form.fecha}
                janelaInicial={form.janela}
                contextoInicial={form.ctx}
              />
            </section>
            <div className="coluna-direita">
              {regrasInfo && (
                <details className="cartao-painel recolhivel-cartao" id="regras" open>
                  <summary>
                    <h2>Regras</h2>
                    <span className="legenda">
                      desconto até {fmt.format(regrasInfo.desconto_max)}% · teto {formatarMoeda(regrasInfo.teto_mes)}
                    </span>
                  </summary>
                  <FormRegras regras={regrasInfo} />
                </details>
              )}
            </div>
          </div>
        )}

        {aba === "demo" && (
          <>
            {painel && <TelefonesTeste telefones={painel.telefonesTeste} jaResgataram={painel.jaResgataram} />}
            {planejamentos.length > 0 && <RegistroPlanejador planos={planejamentos} />}
            <p className="legenda versao">
              Versão do app: {VERSAO}
              {process.env.VERCEL_GIT_COMMIT_SHA ? ` · ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ""}
            </p>
          </>
        )}
      </main>
    </>
  );
}

/**
 * Topo do painel: o problema (cadeiras vazias e o dinheiro que não entrou) ao lado do
 * que a ferramenta recuperou. Os outros indicadores ficam menores, embaixo.
 */
function Destaque({
  resumo,
  painel,
  ctx,
  regras,
  recuperadas,
  receitaNova,
  ticketMedio,
}: {
  resumo: ResumoOcupacao;
  painel: CampanhaPainel[];
  ctx: ContextoJanela;
  regras: Regras;
  recuperadas: number;
  receitaNova: number;
  ticketMedio: number;
}) {
  const pior = janelaMaisVazia(resumo);
  const resgates = painel.reduce((s, c) => s + c.resultado.resgatados, 0);
  const incrementais = painel.reduce((s, c) => s + c.resultado.resgatesIncrementais, 0);
  // Teto por mês, a mesma conta da criação de campanha (comprometidoNoMes): campanha
  // ainda aberta reserva o teto inteiro; encerrada conta o que gastou. Mostra o mês de
  // hoje e, embaixo, o mês da próxima janela, se for outro.
  const mesAtual = hojeNoFuso().slice(0, 7);
  const tetoDoMes = (mes: string) => {
    const doMes = painel.filter((c) => c.campanha.data_janela.startsWith(mes));
    const comprometido = comprometidoNoMes(
      doMes.map((c) => ({ ...c.campanha, gasto: c.resultado.custoDescontos })),
      mes,
    );
    // Campanha em andamento segura o teto inteiro; encerrada conta o que gastou.
    const reservado = doMes.filter((c) => c.ativa).reduce((s, c) => s + c.campanha.teto, 0);
    return {
      livre: Math.max(0, regras.teto_mes - comprometido),
      comprometido,
      gasto: Math.max(0, comprometido - reservado),
      reservado,
      n: doMes.length,
    };
  };
  const tetoAtual = tetoDoMes(mesAtual);
  const tetoProximo = ctx.mes !== mesAtual ? tetoDoMes(ctx.mes) : null;
  const restante = tetoAtual.livre;
  const usado = regras.teto_mes > 0 ? Math.min(100, (tetoAtual.comprometido / regras.teto_mes) * 100) : 0;
  const mesMaiusculo = (m: string) => nomeMes(m).replace(/^./, (c) => c.toUpperCase());
  const fracas = resumo.vaziasAbaixoMinimo30d;
  // Premissa: cada mesa fica 1h30; cada cadeira vazia nesse tempo é uma conta de ticket médio que não entrou.
  const naoEntrou = Math.round((fracas / PERMANENCIA_H) * ticketMedio);
  const meta = Math.max(1, Math.round(fracas * META_RECUPERACAO));
  const progresso = Math.min(100, (recuperadas / meta) * 100);
  const entregues = painel.filter((c) => c.kit?.entregue_em).length;
  const reais = (v: number) => formatarMoeda(v).replace(/,00$/, "");
  return (
    <>
      <section className="destaque" aria-label="Resumo do mês">
        <div className="destaque-bloco destaque-problema">
          <span className="kpi-rotulo">O problema · últimos 30 dias</span>
          <div className="destaque-numeros">
            <span className="destaque-valor vermelho">{fmt.format(resumo.cadeirasHoraVazias30d)}</span>
            <span className="destaque-de">cadeiras-hora vazias</span>
          </div>
          <p className="destaque-linha">
            <b>{fmt.format(fracas)}</b> delas nos horários abaixo de {fmt.format(regras.ocupacao_min)}%.
          </p>
          <div className="destaque-dinheiro">
            <span className="destaque-dinheiro-valor">{reais(naoEntrou)}</span>
            <span>
              que deixaram de entrar nesses horários{" "}
              <Info
                texto={`Cadeiras vazias nos horários fracos ÷ ${String(PERMANENCIA_H).replace(".", ",")}h por mesa × ticket médio de ${formatarMoeda(ticketMedio)}. É o máximo em jogo, não uma previsão.`}
              />
            </span>
          </div>
        </div>

        <div className="destaque-bloco destaque-recuperado">
          <span className="kpi-rotulo">O que o Mesa Cheia recuperou · 30 dias</span>
          <div className="destaque-numeros">
            <span className="destaque-valor verde">{fmt.format(recuperadas)}</span>
            <span className="destaque-de">
              cadeiras-hora{" "}
              <Info texto="Pessoas trazidas por clientes novos × 1h30 por mesa." />
            </span>
          </div>
          <div className="destaque-dinheiro">
            <span className="destaque-dinheiro-valor verde">{formatarMoeda(receitaNova)}</span>
            <span>em contas de clientes novos, já com desconto</span>
          </div>
          <div className="destaque-barra" role="img" aria-label={`${Math.round(progresso)}% da meta de ${fmt.format(meta)}`}>
            <span style={{ width: `${Math.max(progresso, recuperadas > 0 ? 2 : 0)}%` }} />
          </div>
          <span className="kpi-nota">
            {Math.round(progresso)}% da meta de {fmt.format(meta)} ({Math.round(META_RECUPERACAO * 100)}% das vazias nos horários fracos)
          </span>
        </div>
      </section>

      <section className="mini-kpis" aria-label="Indicadores">
        {pior && (
          <div className="mini-kpi">
            <span>Janela mais vazia</span>
            <b>
              {NOMES_DIA[pior.dia]} {pior.inicio}h–{pior.fim}h
            </b>
            <small>{fmt.format(Math.round(pior.percentual))}% de ocupação média</small>
          </div>
        )}
        <div className="mini-kpi">
          <span>
            Teto de {nomeMes(mesAtual)}{" "}
            <Info texto="O teto é por mês e conta no mês em que a campanha acontece. Campanha em andamento separa o teto inteiro dela; quando termina, só o que virou desconto fica contando e o resto volta para o mês." />
          </span>
          <b>{reais(restante)}</b>
          <div className="kpi-barra" aria-hidden="true">
            <span style={{ width: `${usado}%` }} />
          </div>
          <small>
            livres de {reais(regras.teto_mes)}
            {tetoAtual.n > 0 && ` · ${tetoAtual.n} ${tetoAtual.n === 1 ? "campanha" : "campanhas"}`} ·{" "}
            <Link href="/dono?aba=configurar&regras=1#regras">alterar</Link>
          </small>
          {tetoAtual.comprometido > 0 && (
            <small>
              {formatarMoeda(tetoAtual.gasto)} gastos
              {tetoAtual.reservado > 0 && ` · ${formatarMoeda(tetoAtual.reservado)} reservados em campanhas abertas`}
            </small>
          )}
          {tetoProximo && (
            <small>
              {mesMaiusculo(ctx.mes)}: {reais(tetoProximo.livre)} livres
              {tetoProximo.n > 0 && ` · ${tetoProximo.n} ${tetoProximo.n === 1 ? "campanha" : "campanhas"}`}
            </small>
          )}
        </div>
        <div className="mini-kpi">
          <span>Resgates</span>
          <b>{resgates}</b>
          <small>
            <span className="verde">{incrementais} de clientes novos</span>
          </small>
        </div>
        <div className="mini-kpi">
          <span>
            Kit entregue à equipe{" "}
            <Info texto="Campanhas em que você copiou a mensagem para a equipe." />
          </span>
          <b>
            {entregues} de {painel.length}
          </b>
          <small>
            <Link href="/dono?aba=campanhas">ver kits</Link>
          </small>
        </div>
      </section>
    </>
  );
}

function descricaoCampanha(c: CampanhaPainel["campanha"]) {
  return `${NOMES_DIA[c.dia_semana]} ${formatarHora(c.hora_inicio)}–${formatarHora(c.hora_fim)}`;
}

const pctFmt = (v: number) => `${fmt.format(Math.round(v * 10) / 10)}%`;

/** Uma campanha por cartão: funil, efeito contra o controle e custo por cliente novo em destaque. */
function Resultados({ campanhas }: { campanhas: CampanhaPainel[] }) {
  if (campanhas.length === 0) {
    return <p className="legenda">Nenhuma campanha ainda. Gere uma proposta na aba Hoje.</p>;
  }
  return (
    <div className="campanhas">
      {campanhas.map((cp) => (
        <CartaoCampanha key={cp.campanha.id} cp={cp} />
      ))}
    </div>
  );
}

function CartaoCampanha({ cp }: { cp: CampanhaPainel }) {
  const { campanha: c, resultado: r, controle: k, ativa, beneficios } = cp;
  const alerta = canibalizadoEmAlerta(r);
  const base = Math.max(1, r.emitidos);
  const largura = (n: number) => `${n > 0 ? Math.max(2, (n / base) * 100) : 0}%`;
  const status = c.status === "pausada" ? "pausada" : ativa ? "ativa" : "encerrada";
  return (
    <article className={`campanha campanha-${status}`}>
      <header className="campanha-cabeca">
        <div>
          <h3>
            {descricaoCampanha(c)} <span className="legenda">{formatarDataCurta(c.data_janela)}</span>
            {c.semanas > 1 && <span className="legenda"> · {c.semanas} semanas</span>}
          </h3>
          <p className="legenda">
            {rotuloSegmento(c.segmento)} · {textoBeneficio(c.tipo, c.valor, c.limite_por_conta)} · teto {formatarMoeda(c.teto)}
          </p>
        </div>
        <span className={`selo ${status === "ativa" ? "selo-resgatado" : status === "pausada" ? "selo-demo" : ""}`}>{status}</span>
      </header>
      {c.status === "pausada" && c.motivo_pausa && <p className="campanha-pausa">{c.motivo_pausa}</p>}

      <div className="campanha-corpo">
        <div className="campanha-bloco">
          <span className="bloco-titulo">Funil</span>
          <div className="funil">
            <div>
              <span>
                Ofertas enviadas{" "}
                <Info texto="Nem todo mundo que recebe a oferta vem. O teto limita quantos descontos são dados, não quantas ofertas saem." />
              </span>
              <i style={{ width: largura(r.emitidos) }} />
              <b>{r.emitidos}</b>
            </div>
            <div>
              <span>Resgatados</span>
              <i style={{ width: largura(r.resgatados) }} />
              <b>
                {r.resgatados}
                {r.taxaResgate !== null && r.resgatados > 0 && <small> {pctFmt(r.taxaResgate)}</small>}
              </b>
            </div>
            <div>
              <span>
                Clientes novos{" "}
                <Info texto="Quem usou e não vinha nesse horário nos últimos 60 dias." />
              </span>
              <i className="funil-verde" style={{ width: largura(r.resgatesIncrementais) }} />
              <b className={r.resgatesIncrementais > 0 ? "verde" : undefined}>{r.resgatesIncrementais}</b>
            </div>
          </div>
          <div className="vagas">
            <span className="vagas-titulo">
              {cp.vagas.total} vagas de até {formatarMoeda(cp.vagas.valor)}{" "}
              <Info
                texto={`O teto de ${formatarMoeda(c.teto)} vira vagas. ${c.tipo === "percentual" ? `Cada vaga separa o desconto de uma conta média; conta maior usa a folga do teto.` : "Cada vaga separa o valor do desconto."} Quem confirma pela oferta ou chega ao salão guarda uma e não fica sem desconto. Sem vaga livre, quem não confirmou ouve que as vagas acabaram.`}
              />
            </span>
            <span>
              <b>{cp.vagas.usadas}</b> usadas
            </span>
            <span>
              <b>{cp.vagas.garantidas}</b> garantidas
            </span>
            <span>
              <b className={cp.vagas.livres > 0 ? "verde" : undefined}>{cp.vagas.livres}</b> livres
            </span>
          </div>
        </div>

        <div className="campanha-bloco">
          <span className="bloco-titulo">
            Efeito vs controle{" "}
            <Info texto="Quantos vieram entre quem recebeu a oferta, comparado a um grupo sorteado que não recebeu." />
          </span>
          {k.estado === "sem_controle" && <p className="legenda">Campanha sem grupo de controle (menos de 10 elegíveis).</p>}
          {k.estado === "aguardando" && (
            <p className="legenda">Aguardando a janela. {k.tamanhoControle} clientes sorteados no grupo de controle.</p>
          )}
          {k.estado === "medido" && (
            <>
              <div className="controle">
                <div>
                  <span>Receberam</span>
                  <i style={{ width: `${Math.max(k.taxaTratados, 1)}%` }} />
                  <b>{pctFmt(k.taxaTratados)}</b>
                </div>
                <div>
                  <span>Controle</span>
                  <i className="controle-cinza" style={{ width: `${Math.max(k.taxaControle, 1)}%` }} />
                  <b>{pctFmt(k.taxaControle)}</b>
                </div>
              </div>
              <p className={`efeito ${k.lift > 2 ? "verde" : k.lift < -2 ? "alerta-texto" : ""}`}>
                <b>
                  {k.lift > 0 ? "+" : ""}
                  {fmt.format(k.lift)} pts
                </b>{" "}
                {k.visitasAMais > 0 ? `· ${k.visitasAMais} visitas causadas pela campanha` : "· viriam igual sem o desconto"}
              </p>
            </>
          )}
        </div>

        <div className="campanha-bloco campanha-dinheiro">
          <span className="bloco-titulo">Dinheiro</span>
          <div className="dinheiro-linha">
            <span>
              Receita de clientes novos <Info texto="Contas dos clientes novos, já com desconto." />
            </span>
            <b className={r.receitaIncremental > 0 ? "verde" : undefined}>{formatarMoeda(r.receitaIncremental)}</b>
          </div>
          <div className="dinheiro-linha">
            <span>Desconto dado</span>
            <b>− {formatarMoeda(r.custoDescontos)}</b>
          </div>
          <div className="dinheiro-linha">
            <span>Soma das contas</span>
            <b>{formatarMoeda(r.somaContas)}</b>
          </div>
          <p className="legenda">
            {r.custoDescontos > 0
              ? r.receitaIncremental > 0
                ? `Cada R$ 1 de desconto trouxe ${formatarMoeda(r.receitaIncremental / r.custoDescontos)} em contas novas.`
                : "O desconto não trouxe conta nova: foi para quem já vinha."
              : "Ainda sem resgates."}
          </p>
        </div>

        <div className="campanha-bloco campanha-chave">
          <span className="bloco-titulo">
            Custo por cliente novo{" "}
            <Info texto="Todo o desconto dado, dividido pelos clientes novos." />
          </span>
          <b
            className={`chave-valor ${r.custoPorIncremental === null && r.resgatados > 0 ? "alerta-texto chave-texto" : ""}`}
          >
            {r.custoPorIncremental === null ? (r.resgatados > 0 ? "sem cliente novo" : "—") : formatarMoeda(r.custoPorIncremental)}
          </b>
          <span className="legenda">
            {formatarMoeda(r.custoDescontos)} gastos de {formatarMoeda(c.teto)} de teto
          </span>
          {alerta && (
            <span className="alerta-canibal-linha">
              {formatarMoeda(r.custoCanibalizado)} de desconto para quem já vinha
            </span>
          )}
        </div>
      </div>

      {ativa && (
        <div className="campanha-acoes">
          <BotaoSimularCheia campanhaId={c.id} />
        </div>
      )}

      <details className="recolhivel">
        <summary>
          Detalhes e benefícios emitidos <span className="qtd">{beneficios.length}</span>
        </summary>
        <dl className="campanha-detalhes">
          <div>
            <dt>
              Para quem já vinha <Info texto="Desconto dado a quem já frequentava esse horário e viria de qualquer jeito." />
            </dt>
            <dd className={alerta ? "alerta-texto" : undefined}>
              {r.resgatesCanibalizados} · {formatarMoeda(r.custoCanibalizado)}
            </dd>
          </div>
        </dl>
        <div className="rolagem">
          <table className="tabela compacta">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Telefone</th>
                <th scope="col">Código</th>
                <th scope="col">Status</th>
                <th scope="col">Incremental</th>
              </tr>
            </thead>
            <tbody>
              {beneficios.map((b, i) => (
                <tr key={i}>
                  <td>{b.nome}</td>
                  <td className="mono">{b.telefone}</td>
                  <td className="mono">{b.codigo}</td>
                  <td>
                    <span className={`selo selo-${b.status}`}>{b.status}</span>
                    {b.desconto !== null && <span className="sub">desconto {formatarMoeda(b.desconto)}</span>}
                  </td>
                  <td>{b.incremental === null ? "" : b.incremental ? <span className="verde">sim</span> : "não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}

/** Métrica de divulgação no salão e o kit das campanhas cuja janela ainda não passou. */
function BlocoKits({ campanhas }: { campanhas: CampanhaPainel[] }) {
  const entregues = campanhas.filter((c) => c.kit?.entregue_em).length;
  const ativas = campanhas.filter((c) => c.ativa);
  return (
    <section className="cartao-painel" aria-labelledby="t-kit">
      <p className="metrica-kit">
        Campanhas com kit entregue à equipe:{" "}
        <b className={entregues === campanhas.length ? "verde" : undefined}>
          {entregues} de {campanhas.length}
        </b>
      </p>
      <h2 id="t-kit">Kit de ativação</h2>
      {ativas.length === 0 ? (
        <p className="legenda">Nenhuma campanha com janela por vir.</p>
      ) : (
        <KitAtivacao
          itens={ativas.map((c) => ({
            campanhaId: c.campanha.id,
            rotulo: `${descricaoCampanha(c.campanha)} · ${formatarDataCurta(c.campanha.data_janela)}`,
            beneficio: textoBeneficio(c.campanha.tipo, c.campanha.valor, c.campanha.limite_por_conta),
            kit: c.kit,
          }))}
        />
      )}
    </section>
  );
}

const STATUS_PLANO: Record<PlanejamentoView["status"], string> = {
  proposta: "aguardando decisão",
  aprovada: "aprovada",
  descartada: "descartada",
  sem_proposta: "sem proposta",
};

/** Auditoria: cada clique em "Gerar proposta" e cada resposta do modelo, com o motivo da reprovação. */
function RegistroPlanejador({ planos }: { planos: PlanejamentoView[] }) {
  const dataHora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <section className="cartao-painel" aria-labelledby="t-reg">
      <div className="cabecalho-cartao">
        <h2 id="t-reg">Registro do planejador</h2>
        <span className="legenda">últimas {planos.length} propostas</span>
      </div>
      {planos.map((p) => {
        const passaram = p.tentativas.filter((t) => t.aprovada).length;
        const aprovada = p.alternativaAprovada !== null ? p.alternativas[p.alternativaAprovada] : null;
        return (
          <details key={p.id} className="recolhivel">
            <summary>
              <span>
                {dataHora.format(new Date(p.criadoEm))} ·{" "}
                {p.alternativas.length
                  ? `${p.alternativas.length} ${p.alternativas.length === 1 ? "alternativa" : "alternativas"}`
                  : "sem proposta"}
                {aprovada && ` · aprovada: “${aprovada.aposta}”${p.editada ? " (editada)" : ""}`}
              </span>
              <span className="qtd">
                {p.origem === "fallback" ? "regra fixa" : p.origem === "modelo" ? "modelo" : "—"} · {p.tentativas.length}{" "}
                {p.tentativas.length === 1 ? "tentativa" : "tentativas"} ({passaram} valeu) · {STATUS_PLANO[p.status]}
              </span>
            </summary>
            {p.alternativas.length > 0 && (
              <ul className="registro-alternativas">
                {p.alternativas.map((a, i) => (
                  <li key={i}>
                    <b>{a.aposta}</b> · {a.janela} · {a.segmentoRotulo} · {a.beneficio} · teto {formatarMoeda(a.custoMaximo)}
                    {p.alternativaAprovada === i && <span className="selo selo-resgatado">aprovada</span>}
                  </li>
                ))}
              </ul>
            )}
            {p.propostaAprovada && p.editada && (
              <p className="legenda registro-editada">
                Aprovada com edição: {NOMES_DIA[p.propostaAprovada.dia_semana]}{" "}
                {formatarHora(p.propostaAprovada.hora_inicio)}–{formatarHora(p.propostaAprovada.hora_fim)} ·{" "}
                {rotuloSegmento(p.propostaAprovada.segmento)} ·{" "}
                {textoBeneficio(p.propostaAprovada.tipo, p.propostaAprovada.valor, p.propostaAprovada.limite_por_conta ?? null)} · teto{" "}
                {formatarMoeda(p.propostaAprovada.teto)}
              </p>
            )}
            <div className="rolagem">
              <Tentativas tentativas={p.tentativas} />
            </div>
          </details>
        );
      })}
    </section>
  );
}

function TelefonesTeste({ telefones, jaResgataram }: { telefones: TelefoneTeste[]; jaResgataram: TelefoneResgatado[] }) {
  return (
    <details className="demo-cartao">
      <summary>
        <h2>Telefones de teste</h2>
        <span className="selo selo-demo">auxílio de demonstração</span>
      </summary>
      <div className="demo-corpo">
        <p className="legenda">
          Copie um número e cole na <Link href="/salao">tela do salão</Link>. “Ver a oferta” abre o que o cliente recebe pela
          mensagem, onde ele garante a mesa. Número fora da lista mostra “sem benefício”.
        </p>
        <h3 className="demo-sub">Com benefício ativo</h3>
        {telefones.length === 0 ? (
          <p className="legenda">Nenhum benefício ativo agora. Crie uma campanha na aba Hoje.</p>
        ) : (
          <ul className="lista-telefones">
            {telefones.map((t) => (
              <li key={t.telefone}>
                <span className="telefone-linha">
                  <span className="telefone">{t.telefone}</span>
                  <CopiarTelefone telefone={t.telefone} />
                </span>
                <span>{t.nome}</span>
                <span className="sub">
                  {descricaoCampanha(t.campanha)} · {t.esperadoIncremental ? <span className="verde">cliente novo</span> : "já vinha"}
                  {t.garantida && <> · <span className="verde">mesa garantida</span></>}
                </span>
                <a className="link-oferta" href={`/oferta/${t.token}`} target="_blank" rel="noreferrer">
                  ver a oferta que ele recebeu →
                </a>
              </li>
            ))}
          </ul>
        )}
        {jaResgataram.length > 0 && (
          <>
            <h3 className="demo-sub">Já usaram o benefício · mostram a resposta “já usado”</h3>
            <ul className="lista-telefones">
              {jaResgataram.map((t) => (
                <li key={t.telefone}>
                  <span className="telefone-linha">
                  <span className="telefone">{t.telefone}</span>
                  <CopiarTelefone telefone={t.telefone} />
                </span>
                  <span>{t.nome}</span>
                  <span className="sub">
                    {descricaoCampanha(t.campanha)} · {formatarDataCurta(t.campanha.data_janela)} · conta{" "}
                    {formatarMoeda(t.valorConta)}, desconto {formatarMoeda(t.desconto)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

/** Classe da célula: três tons de vermelho abaixo do mínimo, três de cinza acima. */
function classeCelula(p: number, limite: number): string {
  if (p < limite) return p < 30 ? "c-v3" : p < 40 ? "c-v2" : "c-v1";
  return p < 70 ? "c-n1" : p < 90 ? "c-n2" : "c-n3";
}

/**
 * Janela sugerida ao clicar numa célula: a sequência de horas vizinhas abaixo do
 * mínimo, dentro do mesmo turno; numa célula acima do mínimo, só aquela hora.
 */
function janelaDaCelula(resumo: ResumoOcupacao, limite: number, dia: number, hora: number) {
  const pct = new Map(resumo.celulas.map((c) => [`${c.dia}-${c.hora}`, c.percentual]));
  const vazia = (h: number) => resumo.horas.includes(h) && (pct.get(`${dia}-${h}`) ?? 100) < limite;
  if (!vazia(hora)) return { inicio: hora, fim: hora + 1 };
  let inicio = hora;
  let fim = hora + 1;
  while (vazia(inicio - 1)) inicio--;
  while (vazia(fim)) fim++;
  return { inicio, fim };
}

function Grade({ resumo, limite }: { resumo: ResumoOcupacao; limite: number }) {
  const celula = new Map(resumo.celulas.map((c) => [`${c.dia}-${c.hora}`, c]));
  return (
    <>
      <div className="cabecalho-cartao">
        <h2 id="t-ocup">Ocupação média por hora</h2>
        <span className="legenda">
          {fmtData(resumo.periodo.de)} a {fmtData(resumo.periodo.ate)} · clique num horário para criar campanha
        </span>
      </div>
      <div className="rolagem">
        <table className="grade grade-clicavel">
          <thead>
            <tr>
              <th />
              {resumo.dias.map((d) => (
                <th key={d} scope="col">{NOMES_DIA[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumo.horas.map((h, i) => (
              <Fragment key={h}>
                {i > 0 && h - resumo.horas[i - 1] > 1 && (
                  <tr className="intervalo">
                    <th />
                    <td colSpan={resumo.dias.length}>
                      fechado das {resumo.horas[i - 1] + 1}h às {h}h
                    </td>
                  </tr>
                )}
                <tr>
                  <th scope="row">{h}h</th>
                  {resumo.dias.map((d) => {
                    const c = celula.get(`${d}-${h}`);
                    if (!c) return <td key={d} className="c-n1">–</td>;
                    const j = janelaDaCelula(resumo, limite, d, h);
                    return (
                      <td key={d} className={classeCelula(c.percentual, limite)}>
                        <Link
                          href={`/dono?aba=configurar&dia=${d}&inicio=${j.inicio}&fim=${j.fim}#nova`}
                          title={`${NOMES_DIA[d]} ${h}h–${h + 1}h: média de ${c.amostras} dias. Criar campanha ${j.inicio}h–${j.fim}h.`}
                          aria-label={`${NOMES_DIA[d]} ${h}h, ${Math.round(c.percentual)}% de ocupação. Criar campanha de ${j.inicio}h a ${j.fim}h.`}
                        >
                          {fmt.format(Math.round(c.percentual))}%
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legenda-grade">
        <span><i className="c-v3" />abaixo de 30%</span>
        <span><i className="c-v2" />30% a 40%</span>
        <span><i className="c-v1" />40% até o mínimo de {fmt.format(limite)}%</span>
        <span><i className="c-n2" />acima do mínimo</span>
      </div>
    </>
  );
}
