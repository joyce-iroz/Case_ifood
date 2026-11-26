import Link from "next/link";
import { Fragment } from "react";
import { BotaoResetar } from "@/components/BotaoResetar";
import { Marca } from "@/components/Marca";
import { FormCampanha } from "@/components/FormCampanha";
import { carregarRegras, carregarRestaurante, obterResumoOcupacao } from "@/lib/dados";
import { NOMES_DIA, formatarDataCurta, formatarMoeda, horaDoTime, horasDeFuncionamento, type Restaurante } from "@/lib/dominio";
import type { Regras } from "@/lib/campanha";
import { contextoDaJanela, type ContextoJanela } from "@/lib/emissao";
import { descreverErro } from "@/lib/erros";
import { carregarPainel, type CampanhaPainel, type TelefoneTeste } from "@/lib/painel";
import { textoBeneficio } from "@/lib/campanha";
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

  try {
    const restaurante = await carregarRestaurante();
    const janela = { dia: 2, inicio: 18, fim: 23 }; // terça à noite: a janela mais vazia da demo
    const [r, regras, p, ctx] = await Promise.all([
      obterResumoOcupacao(undefined, restaurante),
      carregarRegras(),
      carregarPainel(),
      contextoDaJanela(janela),
    ]);
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
          <div className="duas-colunas">
            <section className="cartao-painel ocupacao" aria-labelledby="t-ocup">
              <Grade resumo={resumo} limite={limite} />
            </section>
            {form && (
              <section className="cartao-painel campanha" aria-labelledby="t-camp">
                <h2 id="t-camp">Nova campanha</h2>
                <FormCampanha
                  dias={form.dias}
                  horas={form.horas}
                  fecha={form.fecha}
                  janelaInicial={form.janela}
                  contextoInicial={form.ctx}
                />
              </section>
            )}
          </div>
        )}

        {painel && (
          <section className="cartao-painel" aria-labelledby="t-res">
            <h2 id="t-res">Resultado das campanhas</h2>
            <Resultados campanhas={painel.campanhas} />
          </section>
        )}

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
  return `${NOMES_DIA[c.dia_semana]} ${c.hora_inicio}h–${c.hora_fim}h`;
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
              <th scope="col">Receita incremental</th>
              <th scope="col">Custo em descontos</th>
              <th scope="col">Custo por cliente incremental</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map(({ campanha: c, resultado: r }) => (
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
                  {r.taxaResgate !== null && <span className="sub">{fmt.format(r.taxaResgate)}%</span>}
                </td>
                <td>{moeda(r.somaContas)}</td>
                <td>
                  <span className={r.receitaIncremental > 0 ? "verde" : undefined}>{moeda(r.receitaIncremental)}</span>
                  <span className="sub">
                    {r.resgatesIncrementais} {r.resgatesIncrementais === 1 ? "incremental" : "incrementais"}
                  </span>
                </td>
                <td>{moeda(r.custoDescontos)}</td>
                <td><b>{moeda(r.custoPorIncremental)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="premissa">
        Incremental = cliente sem visita naquela janela nos últimos 60 dias.
        <br />
        Receita incremental = contas dos resgates incrementais, já descontado o benefício. Custo por cliente incremental =
        todo o custo em descontos da campanha dividido pelos resgates incrementais.
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
