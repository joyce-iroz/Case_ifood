import Link from "next/link";
import { Fragment } from "react";
import { BotaoResetar } from "@/components/BotaoResetar";
import { Marca } from "@/components/Marca";
import { FormCampanha } from "@/components/FormCampanha";
import { FormRegras } from "@/components/FormRegras";
import { KitAtivacao } from "@/components/KitAtivacao";
import { Planejador } from "@/components/Planejador";
import { Tentativas } from "@/components/Tentativas";
import { listarPlanejamentos, type PlanejamentoView } from "@/lib/planejador";
import { carregarRegras, carregarRestaurante, obterResumoOcupacao } from "@/lib/dados";
import { NOMES_DIA, formatarDataCurta, formatarHora, formatarMoeda, horaDoTime, horasDeFuncionamento, type Restaurante } from "@/lib/dominio";
import type { Regras } from "@/lib/campanha";
import { contextoDaJanela, type ContextoJanela } from "@/lib/emissao";
import { descreverErro } from "@/lib/erros";
import { carregarPainel, type CampanhaPainel, type TelefoneTeste } from "@/lib/painel";
import { textoBeneficio } from "@/lib/campanha";
import { canibalizadoEmAlerta } from "@/lib/resultados";
import { rotuloSegmento } from "@/lib/segmentos";
import { janelaMaisVazia, type ResumoOcupacao } from "@/lib/ocupacao";

export const dynamic = "force-dynamic";

const OCUPACAO_MIN_PADRAO = 50;
const fmt = new Intl.NumberFormat("pt-BR");
const fmtData = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

export default async function Dono() {
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
    const janela = { dia: 2, inicio: 18, fim: 23 }; // terça à noite: a janela mais vazia da demo
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
    form = {
      dias: r.dias,
      horas: horasDeFuncionamento(restaurante),
      fecha: horaDoTime(restaurante.fecha),
      janela,
      ctx,
    };
  } catch (e) {
    falha = descreverErro(e).mensagem;
  }

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

        {resumo && resumo.celulas.length > 0 && painel && form?.ctx && regrasInfo && (
          <Indicadores resumo={resumo} painel={painel.campanhas} ctx={form.ctx} regras={regrasInfo} />
        )}

        {resumo && resumo.celulas.length > 0 && (
          <section className="cartao-painel" aria-labelledby="t-plan">
            <Planejador inicial={planejamentos.find((x) => x.status === "proposta") ?? null} />
          </section>
        )}

        {painel && painel.campanhas.length > 0 && <BlocoKits campanhas={painel.campanhas} />}

        {resumo && resumo.celulas.length > 0 && (
          <div className="duas-colunas">
            <section className="cartao-painel ocupacao" aria-labelledby="t-ocup">
              <Grade resumo={resumo} limite={limite} />
            </section>
            <div className="coluna-direita">
              {form && (
                <section className="cartao-painel" aria-labelledby="t-camp">
                  <h2 id="t-camp">Nova campanha manual</h2>
                  <FormCampanha
                    dias={form.dias}
                    horas={form.horas}
                    fecha={form.fecha}
                    janelaInicial={form.janela}
                    contextoInicial={form.ctx}
                  />
                </section>
              )}
              {regrasInfo && (
                <details className="cartao-painel recolhivel-cartao">
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

        {painel && (
          <section className="cartao-painel" aria-labelledby="t-res">
            <h2 id="t-res">Resultado das campanhas</h2>
            <Resultados campanhas={painel.campanhas} />
          </section>
        )}

        {planejamentos.length > 0 && <RegistroPlanejador planos={planejamentos} />}

        {painel && <TelefonesTeste telefones={painel.telefonesTeste} />}
      </main>
    </>
  );
}

function Indicadores({
  resumo,
  painel,
  ctx,
  regras,
}: {
  resumo: ResumoOcupacao;
  painel: CampanhaPainel[];
  ctx: ContextoJanela;
  regras: Regras;
}) {
  const pior = janelaMaisVazia(resumo);
  const resgates = painel.reduce((s, c) => s + c.resultado.resgatados, 0);
  const incrementais = painel.reduce((s, c) => s + c.resultado.resgatesIncrementais, 0);
  const custo = painel.reduce((s, c) => s + c.resultado.custoDescontos, 0);
  const restante = Math.max(0, ctx.tetoRestanteMes);
  const usado = regras.teto_mes > 0 ? Math.min(100, ((regras.teto_mes - restante) / regras.teto_mes) * 100) : 0;
  return (
    <section className="kpis" aria-label="Resumo">
      <div className="kpi">
        <span className="kpi-rotulo">Cadeiras-hora vazias · 30 dias</span>
        <span className="kpi-valor destaque">{fmt.format(resumo.cadeirasHoraVazias30d)}</span>
        <span className="kpi-nota">só nas horas em que o salão está aberto</span>
      </div>
      {pior && (
        <div className="kpi">
          <span className="kpi-rotulo">Janela mais vazia</span>
          <span className="kpi-valor">
            {NOMES_DIA[pior.dia]} {pior.inicio}h–{pior.fim}h
          </span>
          <span className="kpi-nota">{fmt.format(Math.round(pior.percentual))}% de ocupação média em 60 dias</span>
        </div>
      )}
      <div className="kpi">
        <span className="kpi-rotulo">Teto de descontos · {ctx.mes.split("-").reverse().join("/")}</span>
        <span className="kpi-valor">{formatarMoeda(restante).replace(",00", "")}</span>
        <div className="kpi-barra" aria-hidden="true">
          <span style={{ width: `${usado}%` }} />
        </div>
        <span className="kpi-nota">restantes de {formatarMoeda(regras.teto_mes).replace(",00", "")}</span>
      </div>
      <div className="kpi">
        <span className="kpi-rotulo">Resgates</span>
        <span className="kpi-valor">{resgates}</span>
        <span className="kpi-nota">
          <span className="verde">{incrementais} {incrementais === 1 ? "incremental" : "incrementais"}</span> · {formatarMoeda(custo)} em descontos
        </span>
      </div>
    </section>
  );
}

function descricaoCampanha(c: CampanhaPainel["campanha"]) {
  return `${NOMES_DIA[c.dia_semana]} ${formatarHora(c.hora_inicio)}–${formatarHora(c.hora_fim)}`;
}

function Resultados({ campanhas }: { campanhas: CampanhaPainel[] }) {
  if (campanhas.length === 0) {
    return <p className="legenda">Nenhuma campanha ainda. Crie uma acima.</p>;
  }
  const moeda = (v: number | null) => (v === null ? "—" : formatarMoeda(v));
  return (
    <>
      <div className="rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th scope="col">Campanha</th>
              <th scope="col">Emitidos</th>
              <th scope="col">Resgatados</th>
              <th scope="col">Soma das contas</th>
              <th scope="col">Incrementais</th>
              <th scope="col">Canibalizados</th>
              <th scope="col">Custo em descontos</th>
              <th scope="col">Custo por cliente incremental</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map(({ campanha: c, resultado: r }) => {
              const alerta = canibalizadoEmAlerta(r);
              return (
                <tr key={c.id}>
                  <th scope="row">
                    <b>{descricaoCampanha(c)}</b> <span className="legenda">{formatarDataCurta(c.data_janela)}</span>
                    <span className="sub">
                      {rotuloSegmento(c.segmento)} · {textoBeneficio(c.tipo, c.valor)} · teto {formatarMoeda(c.teto)}
                    </span>
                  </th>
                  <td>{r.emitidos}</td>
                  <td>
                    {r.resgatados}
                    {r.taxaResgate !== null && <span className="sub">{fmt.format(r.taxaResgate)}% dos emitidos</span>}
                  </td>
                  <td>{moeda(r.somaContas)}</td>
                  <td>
                    <span className={r.resgatesIncrementais > 0 ? "verde" : undefined}>{r.resgatesIncrementais}</span>
                    {r.percentualIncremental !== null && (
                      <span className="sub">{fmt.format(r.percentualIncremental)}% dos resgates</span>
                    )}
                    <span className="sub">receita {moeda(r.receitaIncremental)}</span>
                  </td>
                  <td className={alerta ? "alerta-canibal" : undefined}>
                    {r.resgatesCanibalizados}
                    <span className="sub">custo {moeda(r.custoCanibalizado)}</span>
                    {alerta && <span className="sub">acima de 40% do custo</span>}
                  </td>
                  <td>{moeda(r.custoDescontos)}</td>
                  <td>
                    <b>{moeda(r.custoPorIncremental)}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="premissa">
        Incremental = cliente sem visita naquela janela nos últimos 60 dias.
        <br />
        Receita incremental = contas dos resgates incrementais, já descontado o benefício. Custo por cliente incremental =
        todo o custo em descontos da campanha dividido pelos resgates incrementais.
        <br />
        Canibalizado = desconto dado a cliente que já frequentava aquela janela. Reduzir esse número é o objetivo de
        escolher janela e público, em vez de anunciar desconto para todo mundo.
      </p>

      {campanhas.map(({ campanha: c, beneficios }) => (
        <details key={c.id} className="recolhivel">
          <summary>
            Benefícios emitidos · {descricaoCampanha(c)} · {formatarDataCurta(c.data_janela)}
            <span className="qtd">{beneficios.length}</span>
          </summary>
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
      ))}
    </>
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
            beneficio: textoBeneficio(c.campanha.tipo, c.campanha.valor),
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
        <span className="legenda">últimas {planos.length} propostas · lista crua das janelas em <a href="/api/janelas">/api/janelas</a></span>
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
                {textoBeneficio(p.propostaAprovada.tipo, p.propostaAprovada.valor)} · teto{" "}
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

function TelefonesTeste({ telefones }: { telefones: TelefoneTeste[] }) {
  return (
    <details className="demo-cartao">
      <summary>
        <h2>Telefones de teste</h2>
        <span className="selo selo-demo">auxílio de demonstração</span>
      </summary>
      <div className="demo-corpo">
        <p className="legenda">
          Só existe para a apresentação. O banco guarda apenas o hash do telefone; estes números completos são
          regenerados a partir do seed. Digite um deles na <Link href="/salao">tela do salão</Link>. Qualquer número
          fora da lista mostra a resposta “sem benefício”.
        </p>
        {telefones.length === 0 ? (
          <p className="legenda">Nenhum benefício ativo agora. Crie uma campanha acima.</p>
        ) : (
          <ul className="lista-telefones">
            {telefones.map((t) => (
              <li key={t.telefone}>
                <span className="telefone">{t.telefone}</span>
                <span>{t.nome}</span>
                <span className="sub">
                  {descricaoCampanha(t.campanha)} · deve sair{" "}
                  {t.esperadoIncremental ? <span className="verde">incremental</span> : "não incremental"}
                </span>
              </li>
            ))}
          </ul>
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

function Grade({ resumo, limite }: { resumo: ResumoOcupacao; limite: number }) {
  const celula = new Map(resumo.celulas.map((c) => [`${c.dia}-${c.hora}`, c]));
  return (
    <>
      <div className="cabecalho-cartao">
        <h2 id="t-ocup">Ocupação média por hora</h2>
        <span className="legenda">
          % das {resumo.restaurante.capacidade} cadeiras · {fmtData(resumo.periodo.de)} a {fmtData(resumo.periodo.ate)}
        </span>
      </div>
      <div className="rolagem">
        <table className="grade">
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
                    return (
                      <td
                        key={d}
                        className={classeCelula(c.percentual, limite)}
                        title={`${NOMES_DIA[d]} ${h}h–${h + 1}h: média de ${c.amostras} dias`}
                      >
                        {fmt.format(Math.round(c.percentual))}%
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
