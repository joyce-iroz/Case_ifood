"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatarMoeda } from "@/lib/dominio";
import { textoBeneficio, type Bloqueio } from "@/lib/campanha";
import type { ApresentacaoProposta, PlanejamentoView } from "@/lib/planejador";
import type { ResultadoCriacao } from "@/lib/emissao";
import { Tentativas } from "./Tentativas";

export function Planejador({ inicial }: { inicial: PlanejamentoView | null }) {
  const router = useRouter();
  const [plano, setPlano] = useState<PlanejamentoView | null>(inicial);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState(false);
  const [valor, setValor] = useState<number | null>(null);
  const [decidindo, setDecidindo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCriacao | null>(null);
  const travado = useRef(false);

  async function gerar() {
    if (gerando) return;
    setGerando(true);
    setErro(null);
    setResultado(null);
    setAjustando(false);
    setValor(null);
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

  async function decidir(acao: "aprovar" | "descartar") {
    if (!plano || travado.current) return;
    travado.current = true;
    setDecidindo(true);
    setErro(null);
    try {
      const r = await fetch(`/api/planejador/${plano.id}/${acao}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(acao === "aprovar" && valor !== null ? { valor } : {}),
      });
      const corpo = await r.json();
      if (acao === "descartar") {
        if (!r.ok) throw new Error(corpo.erro ?? "Falha ao descartar");
        setPlano(null);
      } else {
        if (corpo.erro) throw new Error(corpo.erro);
        setResultado(corpo);
        if (corpo.ok) setPlano({ ...plano, status: "aprovada" });
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha");
    } finally {
      travado.current = false;
      setDecidindo(false);
    }
  }

  const ap = plano?.apresentacao && !("motivo" in plano.apresentacao && plano.apresentacao.motivo)
    ? (plano.apresentacao as ApresentacaoProposta)
    : null;
  const motivo = plano?.apresentacao && "motivo" in plano.apresentacao ? plano.apresentacao.motivo : null;
  const valorAtual = valor ?? ap?.valor ?? 0;

  return (
    <div className="planejador">
      <div className="planejador-topo">
        <div>
          <h2 id="t-plan">Planejador</h2>
          <p className="legenda">
            O modelo escolhe entre janelas, segmentos e valores que o código já calculou. Toda proposta passa pelas
            mesmas regras do formulário manual.
          </p>
        </div>
        <button className="botao primario" onClick={gerar} disabled={gerando}>
          {gerando ? "Gerando proposta…" : plano ? "Gerar outra proposta" : "Gerar proposta"}
        </button>
      </div>
      {erro && <p className="aviso">{erro}</p>}

      {plano && (
        <div className={`proposta ${plano.origem === "fallback" ? "fallback" : ""}`}>
          <div className="proposta-origem">
            {plano.origem === "modelo" && <span className="selo">proposta do modelo · {plano.modelo}</span>}
            {plano.origem === "fallback" && <span className="selo selo-demo">regra fixa: o modelo não passou na validação</span>}
            {plano.origem === "nenhuma" && <span className="selo">sem janela candidata</span>}
            {plano.status === "aprovada" && <span className="selo selo-resgatado">aprovada</span>}
          </div>

          {motivo && <p className="cartao-linha">{motivo}</p>}

          {ap && (
            <div className="proposta-corpo">
              <div className="proposta-lado">
              <div>
                <p className="proposta-janela">{ap.janela}</p>
                <p className="legenda">
                  vale {ap.validade} · ocupação média {String(ap.ocupacao).replace(".", ",")}% ·{" "}
                  {String(ap.cadeirasVazias).replace(".", ",")} cadeiras-hora vazias
                </p>
              </div>
              <dl className="proposta-dados">
                <div>
                  <dt>Segmento</dt>
                  <dd>
                    {ap.segmentoRotulo}
                    <span className="legenda"> · {ap.elegiveis} elegíveis</span>
                  </dd>
                </div>
                <div>
                  <dt>Benefício</dt>
                  <dd>
                    {ajustando ? (
                      <select
                        className="ajuste"
                        value={valorAtual}
                        onChange={(e) => setValor(Number(e.target.value))}
                        aria-label="Ajustar valor do benefício"
                      >
                        {ap.opcoesValor.map((v) => (
                          <option key={v} value={v}>
                            {textoBeneficio(ap.tipo, v)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        {textoBeneficio(ap.tipo, valorAtual)}
                        {valor !== null && valor !== ap.valor && <span className="legenda"> · ajustado</span>}
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Custo máximo</dt>
                  <dd>{formatarMoeda(ap.custoMaximo)}</dd>
                </div>
              </dl>
              </div>
              <div className="proposta-lado">
              <blockquote className="justificativa">
                <span className="legenda">Justificativa {plano.origem === "modelo" ? "do modelo" : "da regra fixa"}</span>
                {ap.justificativa}
              </blockquote>
              {ap.notas.map((n, i) => (
                <p key={i} className="legenda">{n}</p>
              ))}

              {plano.status === "proposta" && (
                <div className="proposta-acoes">
                  <button className="botao primario" onClick={() => decidir("aprovar")} disabled={decidindo}>
                    {decidindo ? "Emitindo…" : "Aprovar"}
                  </button>
                  <button className="botao" onClick={() => setAjustando((a) => !a)} disabled={decidindo}>
                    {ajustando ? "Pronto" : "Ajustar valor"}
                  </button>
                  <button className="botao" onClick={() => decidir("descartar")} disabled={decidindo}>
                    Descartar
                  </button>
                </div>
              )}
              {resultado && <ResultadoAprovacao r={resultado} />}
              </div>
            </div>
          )}

          {!ap && resultado && <ResultadoAprovacao r={resultado} />}

          <details className="recolhivel">
            <summary>
              Tentativas do modelo <span className="qtd">{plano.tentativas.length}</span>
            </summary>
            <div className="rolagem">
              <Tentativas tentativas={plano.tentativas} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function ResultadoAprovacao({ r }: { r: ResultadoCriacao }) {
  if (r.ok)
    return (
      <div className="sucesso">
        <b>Campanha criada.</b> {r.emitidos} benefícios emitidos, válidos {r.validade}.
        {r.foraPorIntervalo > 0 && <> {r.foraPorIntervalo} clientes ficaram de fora por oferta recente.</>}
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
