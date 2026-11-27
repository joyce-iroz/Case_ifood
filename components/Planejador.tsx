"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatarHora, formatarMoeda, NOMES_DIA, ordenarDiasSemana } from "@/lib/dominio";
import { textoBeneficio, type Bloqueio, type PropostaCampanha } from "@/lib/campanha";
import {
  DIAS_TEXTO,
  janelaDoCardapio,
  lerHHMM,
  tipoDoCardapio,
  type Cardapio,
  semanasDoCardapio,
  type JanelaCardapio,
  limitesDoCardapio,
} from "@/lib/planejador-regras";
import { SEGMENTOS, rotuloSegmento, type Segmento } from "@/lib/segmentos";
import type { Alternativa, PlanejamentoView, Previa } from "@/lib/planejador";
import type { ResultadoCriacao } from "@/lib/emissao";
import { Tentativas } from "./Tentativas";
import { ProjecaoView } from "./Projecao";

const num = (n: number) => String(n).replace(".", ",");
const chaveJanela = (j: JanelaCardapio) => `${j.dia_semana}|${j.hora_inicio}|${j.hora_fim}`;
const rotuloJanela = (j: JanelaCardapio) => {
  const dia = DIAS_TEXTO.indexOf(j.dia_semana);
  return `${NOMES_DIA[dia]} ${formatarHora(lerHHMM(j.hora_inicio)!)}–${formatarHora(lerHHMM(j.hora_fim)!)}`;
};

export function Planejador({ inicial }: { inicial: PlanejamentoView | null }) {
  const router = useRouter();
  const [plano, setPlano] = useState<PlanejamentoView | null>(inicial);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<PropostaCampanha | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [decidindo, setDecidindo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCriacao | null>(null);
  const travado = useRef(false);
  const versao = useRef(0);

  async function gerar() {
    if (gerando) return;
    setGerando(true);
    setErro(null);
    setResultado(null);
    setSel(null);
    setEdit(null);
    setPrevia(null);
    try {
      const r = await fetch("/api/planejador", { method: "POST" });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo.erro ?? `Falha (${r.status})`);
      setPlano(corpo);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar proposta");
    } finally {
      setGerando(false);
    }
  }

  function selecionar(i: number) {
    if (!plano || plano.status !== "proposta") return;
    setSel(i);
    setEdit({ ...plano.alternativas[i].proposta });
    setResultado(null);
  }

  // Prévia ao vivo: o servidor revalida a proposta editada a cada mudança.
  useEffect(() => {
    if (!plano || !edit || plano.status !== "proposta") return;
    const v = ++versao.current;
    setCarregandoPrevia(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/planejador/${plano.id}/previa`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proposta: edit }),
        });
        const corpo = await r.json();
        if (v !== versao.current) return;
        if (!r.ok) throw new Error(corpo.erro ?? "Falha na prévia");
        setPrevia(corpo);
      } catch (e) {
        if (v === versao.current)
          setPrevia({
            ok: false,
            elegiveis: null,
            custoMaximo: null,
            saldoAntes: null,
            saldoDepois: null,
            mes: null,
            bloqueios: [{ regra: "dados", mensagem: e instanceof Error ? e.message : "Falha na prévia" }],
            controle: null,
            projecao: null,
          });
      } finally {
        if (v === versao.current) setCarregandoPrevia(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [plano, edit]);

  async function aprovar() {
    if (!plano || !edit || sel === null || travado.current) return;
    travado.current = true;
    setDecidindo(true);
    setErro(null);
    try {
      const r = await fetch(`/api/planejador/${plano.id}/aprovar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ indice: sel, proposta: edit }),
      });
      const corpo = await r.json();
      if (corpo.erro) throw new Error(corpo.erro);
      setResultado(corpo);
      if (corpo.ok) setPlano({ ...plano, status: "aprovada", alternativaAprovada: sel, propostaAprovada: edit });
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao aprovar");
    } finally {
      travado.current = false;
      setDecidindo(false);
    }
  }

  async function descartar() {
    if (!plano || travado.current) return;
    travado.current = true;
    try {
      await fetch(`/api/planejador/${plano.id}/descartar`, { method: "POST" });
      setPlano(null);
      setSel(null);
      setEdit(null);
      router.refresh();
    } finally {
      travado.current = false;
    }
  }

  const aguardando = plano?.status === "proposta";
  const bloqueado = !previa || carregandoPrevia || previa.bloqueios.length > 0;
  const motivoBloqueio = !previa || carregandoPrevia ? "Conferindo a proposta…" : previa.bloqueios.map((b) => b.mensagem).join(" ");

  return (
    <div className="planejador">
      <div className="planejador-topo">
        <div>
          <h2 id="t-plan">Planejador</h2>
          <p className="legenda">Três sugestões para os horários mais vazios. Escolha uma e ajuste se quiser.</p>
        </div>
        <button className="botao primario" onClick={gerar} disabled={gerando}>
          {gerando ? "Gerando propostas…" : plano ? "Gerar outras propostas" : "Gerar proposta"}
        </button>
      </div>
      {erro && <p className="aviso">{erro}</p>}

      {plano && (
        <>
          <div className="proposta-origem">
            {plano.origem === "modelo" && <span className="selo">sugestões da IA</span>}
            {plano.origem === "fallback" && (
              <span className="selo selo-demo">
                {limiteAtingido(plano)
                  ? "sugestão automática: a IA atingiu o limite"
                  : "sugestão automática: a IA não acertou as regras"}
              </span>
            )}
            {plano.origem === "nenhuma" && <span className="selo">sem janela candidata</span>}
            {plano.status === "aprovada" && <span className="selo selo-resgatado">aprovada</span>}
          </div>

          {plano.motivo && <p className="cartao-linha">{plano.motivo}</p>}

          {plano.origem === "fallback" && plano.tentativas.length > 0 && (
            <div className="aviso motivo-fallback">
              <b>
                {limiteAtingido(plano)
                  ? "A IA atingiu o limite por minuto. Espere 1 minuto e gere de novo."
                  : "Por que as sugestões da IA foram recusadas:"}
              </b>
              <ul>
                {plano.tentativas
                  .at(-1)!
                  .erros.slice(0, 4)
                  .map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
              </ul>
            </div>
          )}

          {plano.alternativas.length > 0 && (
            <div className="alternativas" role="radiogroup" aria-label="Alternativas">
              {plano.alternativas.map((a, i) => (
                <CartaoAlternativa
                  key={i}
                  a={a}
                  melhor={plano.alternativas.length > 1 && i === melhorRetorno(plano.alternativas)}
                  selecionada={sel === i || plano.alternativaAprovada === i}
                  aprovada={plano.alternativaAprovada === i}
                  podeSelecionar={aguardando}
                  aoSelecionar={() => selecionar(i)}
                />
              ))}
            </div>
          )}

          {aguardando && edit && plano.cardapio && sel !== null && (
            <div className="editor">
              <h3>Ajustar “{plano.alternativas[sel].aposta}”</h3>
              <Editor cardapio={plano.cardapio} p={edit} aoMudar={setEdit} />
              <PreviaView previa={previa} carregando={carregandoPrevia} />
              <div className="proposta-acoes">
                <button className="botao primario" onClick={aprovar} disabled={decidindo || bloqueado}>
                  {decidindo ? "Emitindo…" : "Aprovar"}
                </button>
                <button className="botao" onClick={descartar} disabled={decidindo}>
                  Descartar
                </button>
                {bloqueado && !decidindo && (
                  <span className={`motivo-bloqueio ${previa && !carregandoPrevia ? "alerta" : ""}`}>{motivoBloqueio}</span>
                )}
              </div>
            </div>
          )}

          {aguardando && sel === null && plano.alternativas.length > 0 && (
            <div className="proposta-acoes">
              <span className="legenda">Escolha uma sugestão para aprovar.</span>
              <button className="botao" onClick={descartar}>
                Descartar todas
              </button>
            </div>
          )}

          {resultado && <ResultadoAprovacao r={resultado} />}

          <details className="recolhivel">
            <summary>
              Tentativas da IA <span className="qtd">{plano.tentativas.length}</span>
            </summary>
            <div className="rolagem">
              <Tentativas tentativas={plano.tentativas} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/** Índice da alternativa com menor custo projetado por cliente novo (-1 se nenhuma traz cliente novo). */
function melhorRetorno(alts: Alternativa[]): number {
  let melhor = -1;
  alts.forEach((a, i) => {
    const c = a.projecao?.custoPorIncremental;
    if (c == null || !a.projecao?.incrementais) return;
    const atual = melhor >= 0 ? alts[melhor].projecao!.custoPorIncremental! : Infinity;
    if (c < atual || (c === atual && a.projecao.incrementais > alts[melhor].projecao!.incrementais)) melhor = i;
  });
  return melhor;
}

function CartaoAlternativa({
  a,
  melhor,
  selecionada,
  aprovada,
  podeSelecionar,
  aoSelecionar,
}: {
  a: Alternativa;
  melhor: boolean;
  selecionada: boolean;
  aprovada: boolean;
  podeSelecionar: boolean;
  aoSelecionar: () => void;
}) {
  return (
    <article className={`alternativa ${selecionada ? "selecionada" : ""} ${melhor ? "melhor" : ""}`}>
      <div className="alternativa-cabeca">
        <span className="aposta">{a.aposta}</span>
        {melhor && <span className="selo selo-resgatado">melhor retorno</span>}
        {aprovada && <span className="selo selo-resgatado">aprovada</span>}
      </div>
      <div>
        <p className="proposta-janela">{a.janela}</p>
        {!a.fatos && (
          <p className="legenda">
            ocupação {num(a.ocupacao)}% · {num(a.cadeirasVazias)} cadeiras-hora vazias
          </p>
        )}
      </div>
      <dl className="proposta-dados">
        <div>
          <dt>Público</dt>
          <dd>
            {a.segmentoRotulo}
            <span className="legenda"> · {a.elegiveis} clientes</span>
          </dd>
        </div>
        <div>
          <dt>Benefício</dt>
          <dd>{a.beneficio}</dd>
        </div>
        <div>
          <dt>Gasto máximo</dt>
          <dd>{formatarMoeda(a.custoMaximo)}</dd>
        </div>
      </dl>
      {a.projecao && (
        <div className="alternativa-projecao" aria-label="Projeção">
          <div>
            <span>clientes novos</span>
            <b className={a.projecao.incrementais > 0 ? "verde" : undefined}>{a.projecao.incrementais}</b>
          </div>
          <div>
            <span>receita nova</span>
            <b>{formatarMoeda(a.projecao.receitaIncremental)}</b>
          </div>
          <div>
            <span>por cliente novo</span>
            <b className={a.projecao.custoPorIncremental === null ? "alerta-texto" : undefined}>
              {a.projecao.custoPorIncremental === null ? "—" : formatarMoeda(a.projecao.custoPorIncremental)}
            </b>
          </div>
        </div>
      )}
      {a.fatos && <p className="fatos">{a.fatos}</p>}
      <p className="justificativa">{a.justificativa}</p>
      {a.notas.map((n, i) => (
        <p key={i} className="legenda">
          {n}
        </p>
      ))}
      {podeSelecionar && (
        <button
          type="button"
          role="radio"
          aria-checked={selecionada}
          className={`botao ${selecionada ? "selecionado" : ""}`}
          onClick={aoSelecionar}
        >
          {selecionada ? "Selecionada" : "Selecionar"}
        </button>
      )}
    </article>
  );
}

/** Cada campo é uma lista fechada do cardápio. Trocar a janela recarrega segmento e teto. */
function Editor({ cardapio, p, aoMudar }: { cardapio: Cardapio; p: PropostaCampanha; aoMudar: (p: PropostaCampanha) => void }) {
  const janela = janelaDoCardapio(cardapio, p.dia_semana, p.hora_inicio, p.hora_fim) ?? cardapio.janelas_candidatas[0];
  const segmentos = SEGMENTOS.filter((s) => janela.segmentos[s.id].elegiveis > 0);
  const tipos = (["percentual", "valor_fixo"] as const).filter((t) => cardapio.valores_permitidos[tipoDoCardapio(t)].length);
  const valores = cardapio.valores_permitidos[tipoDoCardapio(p.tipo)];
  const tetos = janela.custos_maximos_permitidos;

  function trocarJanela(chave: string) {
    const j = cardapio.janelas_candidatas.find((x) => chaveJanela(x) === chave);
    if (!j) return;
    const disponiveis = SEGMENTOS.filter((s) => j.segmentos[s.id].elegiveis > 0);
    const segmento: Segmento = disponiveis.some((s) => s.id === p.segmento)
      ? p.segmento
      : ([...disponiveis].sort((a, b) => j.segmentos[b.id].elegiveis - j.segmentos[a.id].elegiveis)[0]?.id ?? p.segmento);
    const teto = j.custos_maximos_permitidos.includes(p.teto)
      ? p.teto
      : ([...j.custos_maximos_permitidos].reverse().find((v) => v <= p.teto) ?? j.custos_maximos_permitidos[0] ?? p.teto);
    aoMudar({
      ...p,
      dia_semana: DIAS_TEXTO.indexOf(j.dia_semana),
      hora_inicio: lerHHMM(j.hora_inicio)!,
      hora_fim: lerHHMM(j.hora_fim)!,
      segmento,
      teto,
    });
  }

  function trocarTipo(tipo: PropostaCampanha["tipo"]) {
    const lista = cardapio.valores_permitidos[tipoDoCardapio(tipo)];
    const valor = lista.includes(p.valor) ? p.valor : ([...lista].reverse().find((v) => v <= p.valor) ?? lista[0]);
    aoMudar({ ...p, tipo, valor, limite_por_conta: tipo === "percentual" ? p.limite_por_conta ?? null : null });
  }

  // Dias com janela candidata, na ordem da semana (seg → dom). O dono escolhe o dia e
  // depois a janela daquele dia; trocar de dia já seleciona a janela mais vazia dele.
  const diaDe = (j: { dia_semana: string }) => DIAS_TEXTO.indexOf(j.dia_semana as (typeof DIAS_TEXTO)[number]);
  const dias = ordenarDiasSemana([...new Set(cardapio.janelas_candidatas.map(diaDe))]);
  const diaAtual = diaDe(janela);
  const doDia = cardapio.janelas_candidatas.filter((j) => diaDe(j) === diaAtual);
  function trocarDia(d: number) {
    const melhor = cardapio.janelas_candidatas
      .filter((j) => diaDe(j) === d)
      .sort((a, b) => b.cadeiras_hora_vazias - a.cadeiras_hora_vazias)[0];
    if (melhor) trocarJanela(chaveJanela(melhor));
  }

  const iTeto = Math.max(0, tetos.indexOf(p.teto));
  const mudarTeto = (i: number) => aoMudar({ ...p, teto: tetos[Math.min(tetos.length - 1, Math.max(0, i))] });

  return (
    <div className="editor-campos">
      <fieldset className="campo editor-janelas">
        <legend>Dia e janela</legend>
        <div className="dias-editor" role="group" aria-label="Dia">
          {dias.map((d) => (
            <button
              key={d}
              type="button"
              className="opcao"
              aria-pressed={d === diaAtual}
              onClick={() => trocarDia(d)}
            >
              {NOMES_DIA[d]}
            </button>
          ))}
        </div>
        <div className="janelas-grade" role="radiogroup" aria-label="Janela">
          {doDia.map((j) => {
            const ativa = chaveJanela(j) === chaveJanela(janela);
            return (
              <button
                key={chaveJanela(j)}
                type="button"
                role="radio"
                aria-checked={ativa}
                className={`janela-opcao ${ativa ? "ativa" : ""}`}
                onClick={() => trocarJanela(chaveJanela(j))}
              >
                <b>{rotuloJanela(j)}</b>
                <span>
                  {num(Math.round(j.ocupacao_media_pct))}% ocupada
                </span>
              </button>
            );
          })}
        </div>
        <p className="legenda">
          Outros dias não têm horário abaixo de {num(cardapio.regras.ocupacao_min)}%. Para eles, use a{" "}
          <a href="/dono?aba=configurar#nova">campanha manual</a>.
        </p>
      </fieldset>
      <label className="campo">
        Público
        <select value={p.segmento} onChange={(e) => aoMudar({ ...p, segmento: e.target.value as Segmento })}>
          {segmentos.map((s) => (
            <option key={s.id} value={s.id}>
              {rotuloSegmento(s.id)} · {janela.segmentos[s.id].elegiveis} clientes
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        Tipo
        <select value={p.tipo} onChange={(e) => trocarTipo(e.target.value as PropostaCampanha["tipo"])}>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t === "percentual" ? "% da conta" : "R$ fixo"}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        Valor
        <select value={p.valor} onChange={(e) => aoMudar({ ...p, valor: Number(e.target.value) })}>
          {valores.map((v) => (
            <option key={v} value={v}>
              {textoBeneficio(p.tipo, v)}
            </option>
          ))}
        </select>
      </label>
      {p.tipo === "percentual" && limitesDoCardapio(cardapio).length > 0 && (
        <label className="campo">
          Limite por conta
          <select
            value={p.limite_por_conta ?? 0}
            onChange={(e) => aoMudar({ ...p, limite_por_conta: Number(e.target.value) || null })}
          >
            <option value={0}>sem limite</option>
            {limitesDoCardapio(cardapio).map((l) => (
              <option key={l} value={l}>
                até {formatarMoeda(l)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="campo">
        Duração
        <select value={p.semanas} onChange={(e) => aoMudar({ ...p, semanas: Number(e.target.value) })}>
          {semanasDoCardapio(cardapio).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "só a próxima ocorrência" : `${n} semanas seguidas`}
            </option>
          ))}
        </select>
      </label>
      <div className="campo editor-teto">
        <span id="rot-teto">Teto da campanha</span>
        <div className="teto-controle">
          <button type="button" className="opcao" aria-label="Diminuir teto" onClick={() => mudarTeto(iTeto - 1)} disabled={iTeto === 0}>
            −
          </button>
          <b className="teto-valor">{formatarMoeda(p.teto)}</b>
          <button
            type="button"
            className="opcao"
            aria-label="Aumentar teto"
            onClick={() => mudarTeto(iTeto + 1)}
            disabled={iTeto >= tetos.length - 1}
          >
            +
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, tetos.length - 1)}
          step={1}
          value={iTeto}
          onChange={(e) => mudarTeto(Number(e.target.value))}
          aria-labelledby="rot-teto"
          aria-valuetext={formatarMoeda(p.teto)}
        />
        <span className="legenda">
          até {formatarMoeda(tetos.at(-1) ?? 0)}, o que sobra no mês
        </span>
      </div>
    </div>
  );
}

function PreviaView({ previa, carregando }: { previa: Previa | null; carregando: boolean }) {
  if (!previa) return <p className="legenda">Conferindo a proposta…</p>;
  const mes = previa.mes ? previa.mes.split("-").reverse().join("/") : "";
  return (
    <div className={`previa ${carregando ? "carregando" : ""}`} aria-live="polite">
      <div>
        <span>Clientes</span>
        <b>{previa.elegiveis ?? "—"}</b>
      </div>
      <div>
        <span>Gasto máximo</span>
        <b>{previa.custoMaximo === null ? "—" : formatarMoeda(previa.custoMaximo)}</b>
      </div>
      <div>
        <span>Sobra no mês {mes}</span>
        <b className={previa.saldoDepois !== null && previa.saldoDepois < 0 ? "alerta-texto" : undefined}>
          {previa.saldoDepois === null ? "—" : formatarMoeda(previa.saldoDepois)}
        </b>
      </div>
      {previa.projecao && previa.controle !== null && (
        <div className="previa-largo">
          <ProjecaoView projecao={previa.projecao} controle={previa.controle} />
        </div>
      )}
      {previa.bloqueios.length > 0 && (
        <ul className="previa-bloqueios">
          {previa.bloqueios.map((b: Bloqueio, i: number) => (
            <li key={i}>{b.mensagem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A última tentativa caiu no limite por minuto (HTTP 429), não numa validação. */
function limiteAtingido(plano: { tentativas: { erros: string[] }[] }) {
  return plano.tentativas.at(-1)?.erros.some((e) => e.includes("HTTP 429")) ?? false;
}

function ResultadoAprovacao({ r }: { r: ResultadoCriacao }) {
  if (r.ok)
    return (
      <div className="sucesso">
        <b>Campanha criada.</b> {r.emitidos} clientes recebem a oferta, válida {r.validade}.{" "}
        {r.kit.gerado ? (
          <>
            Os textos para a equipe estão na <a href="/dono?aba=campanhas">aba Campanhas</a>.
          </>
        ) : (
          "Os textos para a equipe não foram gravados; a campanha segue ativa."
        )}
      </div>
    );
  return (
    <div className="aviso">
      <b>Não aprovada. Nenhum benefício foi emitido.</b>
      <ul>
        {r.bloqueios.map((b: Bloqueio, i: number) => (
          <li key={i}>{b.mensagem}</li>
        ))}
      </ul>
    </div>
  );
}
