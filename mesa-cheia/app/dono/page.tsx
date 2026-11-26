import Link from "next/link";
import { Fragment } from "react";
import { BotaoResetar } from "@/components/BotaoResetar";
import { carregarRegras, obterResumoOcupacao } from "@/lib/dados";
import { NOMES_DIA } from "@/lib/dominio";
import { descreverErro } from "@/lib/erros";
import type { ResumoOcupacao } from "@/lib/ocupacao";

export const dynamic = "force-dynamic";

const OCUPACAO_MIN_PADRAO = 50;
const fmt = new Intl.NumberFormat("pt-BR");
const fmtData = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

export default async function Dono() {
  let resumo: ResumoOcupacao | null = null;
  let limite = OCUPACAO_MIN_PADRAO;
  let falha: string | null = null;
  try {
    const [r, regras] = await Promise.all([obterResumoOcupacao(), carregarRegras()]);
    resumo = r;
    limite = regras.ocupacao_min;
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

      {resumo && resumo.celulas.length > 0 && <Grade resumo={resumo} limite={limite} />}
    </main>
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
