import Link from "next/link";
import { Fragment } from "react";
import { BotaoResetar } from "@/components/BotaoResetar";
import { FormCampanha } from "@/components/FormCampanha";
import { carregarRegras, carregarRestaurante, obterResumoOcupacao } from "@/lib/dados";
import { NOMES_DIA, formatarDataCurta, formatarMoeda, horaDoTime, horasDeFuncionamento } from "@/lib/dominio";
import { contextoDaJanela, type ContextoJanela } from "@/lib/emissao";
import { descreverErro } from "@/lib/erros";
import { carregarPainel, type CampanhaPainel, type TelefoneTeste } from "@/lib/painel";
import { textoBeneficio } from "@/lib/campanha";
import { rotuloSegmento } from "@/lib/segmentos";
import type { ResumoOcupacao } from "@/lib/ocupacao";

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
    <main className="pagina">
      <div className="topo">
        <div>
          <Link href="/" className="voltar">← Trocar papel</Link>
          <h1>{resumo?.restaurante.nome ?? "Painel do dono"}</h1>
        </div>
        <BotaoResetar />
      </div>

      {falha && (
        <p className="aviso">
          {falha} Se o banco já tem as tabelas de <code>supabase/schema.sql</code>, clique em “Resetar demo”.
        </p>
      )}

      {resumo && resumo.celulas.length === 0 && (
        <p className="aviso">Ainda não há histórico de ocupação. Clique em “Resetar demo”.</p>
      )}

      {resumo && resumo.celulas.length > 0 && (
        <section>
          <Grade resumo={resumo} limite={limite} />
        </section>
      )}

      {form && (
        <section>
          <h2>Nova campanha</h2>
          <FormCampanha
            dias={form.dias}
            horas={form.horas}
            fecha={form.fecha}
            janelaInicial={form.janela}
            contextoInicial={form.ctx}
          />
        </section>
      )}

      {painel && (
        <section>
          <h2>Resultado das campanhas</h2>
          <Resultados campanhas={painel.campanhas} />
        </section>
      )}

      {painel && (
        <section>
          <TelefonesTeste telefones={painel.telefonesTeste} />
        </section>
      )}
    </main>
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
      <div className="grade-rolagem">
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
                  <b>{descricaoCampanha(c)}</b> · {formatarDataCurta(c.data_janela)}
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
                  {moeda(r.receitaIncremental)}
                  <span className="sub">{r.resgatesIncrementais} incrementais</span>
                </td>
                <td>{moeda(r.custoDescontos)}</td>
                <td>{moeda(r.custoPorIncremental)}</td>
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
            Benefícios emitidos: {descricaoCampanha(c)} · {formatarDataCurta(c.data_janela)} ({beneficios.length})
          </summary>
          <div className="grade-rolagem">
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
                    <td>{b.incremental === null ? "" : b.incremental ? "sim" : "não"}</td>
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
    <details className="recolhivel demo">
      <summary>
        Telefones de teste <span className="selo selo-demo">auxílio de demonstração</span>
      </summary>
      <p className="legenda">
        Só existe para a apresentação. O banco guarda apenas o hash do telefone; estes números completos são
        regenerados a partir do seed. Digite um deles na <Link href="/salao">tela do salão</Link>. Para ver a resposta
        “sem benefício”, digite qualquer número fora da lista.
      </p>
      {telefones.length === 0 ? (
        <p className="legenda">Nenhum benefício ativo agora. Crie uma campanha acima.</p>
      ) : (
        <ul className="lista-telefones">
          {telefones.map((t) => (
            <li key={t.telefone}>
              <span className="mono telefone">{t.telefone}</span>
              <span>{t.nome}</span>
              <span className="sub">
                {descricaoCampanha(t.campanha)} · deve sair {t.esperadoIncremental ? "incremental" : "não incremental"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Grade({ resumo, limite }: { resumo: ResumoOcupacao; limite: number }) {
  const celula = new Map(resumo.celulas.map((c) => [`${c.dia}-${c.hora}`, c]));
  return (
    <>
      <p className="resumo">
        <strong>{fmt.format(resumo.cadeirasHoraVazias30d)} cadeiras-hora</strong> ficaram vazias nos últimos 30 dias.
      </p>
      <p className="legenda">
        Ocupação média por hora, em % das {resumo.restaurante.capacidade} cadeiras, de{" "}
        {fmtData(resumo.periodo.de)} a {fmtData(resumo.periodo.ate)}. Em destaque, abaixo de {fmt.format(limite)}%.
      </p>
      <div className="grade-rolagem">
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
                  <th scope="row">{h}h–{h + 1}h</th>
                  {resumo.dias.map((d) => {
                    const c = celula.get(`${d}-${h}`);
                    if (!c) return <td key={d}>–</td>;
                    const abaixo = c.percentual < limite;
                    return (
                      <td
                        key={d}
                        className={abaixo ? "abaixo" : undefined}
                        title={`${NOMES_DIA[d]} ${h}h: média de ${c.amostras} dias`}
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
    </>
  );
}
