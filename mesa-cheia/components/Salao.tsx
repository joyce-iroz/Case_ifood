"use client";

import { useEffect, useRef, useState } from "react";
import { calcularDesconto } from "@/lib/campanha";
import { FUSO, formatarMoeda } from "@/lib/dominio";
import { mascararTelefone } from "@/lib/telefone";
import { formatarNumeroBR, lerNumeroBR } from "@/lib/numero";
import { FALA_SEM_BENEFICIO, falaJaUsado } from "@/lib/kit-regras";
import type { RespostaConsulta, RespostaResgate } from "@/lib/resgate";

type Estado =
  | { fase: "digitando" }
  | { fase: "consultando" }
  | { fase: "falha"; mensagem: string }
  | { fase: "resposta"; r: RespostaConsulta }
  | { fase: "aplicado"; nome: string; r: Extract<RespostaResgate, { ok: true }> };

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });

export function Salao() {
  const [digitos, setDigitos] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "digitando" });

  async function consultar(tel: string) {
    setEstado({ fase: "consultando" });
    try {
      const r = await fetch("/api/salao/consultar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefone: tel }),
      });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo.erro ?? "Falha na consulta");
      setEstado({ fase: "resposta", r: corpo });
    } catch (e) {
      setEstado({ fase: "falha", mensagem: e instanceof Error ? e.message : "Falha na consulta" });
    }
  }

  function tecla(t: string) {
    if (estado.fase !== "digitando" && estado.fase !== "falha") return;
    if (t === "apagar") return setDigitos((d) => d.slice(0, -1));
    if (t === "limpar") return setDigitos("");
    if (digitos.length >= 11) return;
    const novo = digitos + t;
    setDigitos(novo);
    if (novo.length === 11) consultar(novo);
  }

  /** Telefone colado ou digitado no teclado físico: fica só com os dígitos, sem o 55 do país. */
  function receber(texto: string) {
    if (estado.fase !== "digitando" && estado.fase !== "falha") return false;
    let d = texto.replace(/\D/g, "");
    if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
    if (!d) return false;
    d = d.slice(0, 11);
    setDigitos(d);
    if (d.length === 11) consultar(d);
    return true;
  }

  const [colando, setColando] = useState(false);
  async function colar() {
    try {
      const t = await navigator.clipboard.readText();
      if (receber(t)) return;
    } catch {
      /* navegador sem permissão de leitura: mostra o campo para colar à mão */
    }
    setColando(true);
  }

  // Ctrl+V e teclado físico funcionam na tela inteira, para testar no computador.
  const receberRef = useRef(receber);
  receberRef.current = receber;
  const teclaRef = useRef(tecla);
  teclaRef.current = tecla;
  useEffect(() => {
    function aoColar(e: ClipboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      const t = e.clipboardData?.getData("text") ?? "";
      if (receberRef.current(t)) e.preventDefault();
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) teclaRef.current(e.key);
      else if (e.key === "Backspace") teclaRef.current("apagar");
    }
    document.addEventListener("paste", aoColar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("paste", aoColar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  function novoAtendimento() {
    setDigitos("");
    setColando(false);
    setEstado({ fase: "digitando" });
  }

  const emResposta = estado.fase === "resposta" || estado.fase === "aplicado";
  const ativo = estado.fase === "resposta" && estado.r.tipo === "ativo";

  return (
    <div className={`salao ${ativo ? "com-beneficio" : ""}`}>
      {!emResposta && <p className="visor-rotulo">Telefone do cliente</p>}
      <Visor digitos={digitos} compacto={emResposta} />

      {estado.fase === "digitando" && digitos.length < 11 && (
        <p className="salao-status">A busca começa sozinha no 11º dígito</p>
      )}
      {estado.fase === "consultando" && <p className="salao-status">Consultando…</p>}
      {estado.fase === "falha" && (
        <p className="salao-status">
          {estado.mensagem}{" "}
          <button className="link" onClick={() => consultar(digitos)} disabled={digitos.length !== 11}>
            Tentar de novo
          </button>
        </p>
      )}

      {estado.fase === "resposta" && estado.r.tipo === "ativo" && (
        <CartaoAtivo
          r={estado.r}
          aoAplicar={(res) => estado.r.tipo === "ativo" && setEstado({ fase: "aplicado", nome: estado.r.nome, r: res })}
        />
      )}

      {estado.fase === "resposta" && estado.r.tipo === "nenhum" && (
        <>
          <div className="cartao neutro">
            <p>Nenhum benefício ativo para este telefone.</p>
          </div>
          <Fala texto={FALA_SEM_BENEFICIO} />
        </>
      )}

      {estado.fase === "resposta" && estado.r.tipo === "resgatado" && (
        <div className="cartao">
          <p className="cartao-nome">{estado.r.nome}</p>
          <p className="cartao-linha">
            Benefício já usado em <b>{dataHora.format(new Date(estado.r.resgatadoEm))}</b>, numa conta de{" "}
            <b>{formatarMoeda(estado.r.valorConta)}</b> (desconto de {formatarMoeda(estado.r.desconto)}).
          </p>
        </div>
      )}
      {estado.fase === "resposta" && estado.r.tipo === "resgatado" && (
        <Fala texto={falaJaUsado(`em ${dataCurta.format(new Date(estado.r.resgatadoEm))}`)} />
      )}

      {estado.fase === "aplicado" && (
        <div className="cartao aplicado">
          <div className="aplicado-cabeca">
            <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="13" fill="none" stroke="#5bd08a" strokeWidth="2" />
              <path d="M8.5 14.5l3.8 3.8 7.2-8" fill="none" stroke="#5bd08a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Aplicado · {estado.nome}</span>
          </div>
          <div className="aplicado-valor">
            <span>Cobrar</span>
            <b>{formatarMoeda(estado.r.aPagar)}</b>
          </div>
          <div className="aplicado-detalhe">
            <div>
              <span>Conta</span>
              <b>{formatarMoeda(estado.r.valorConta)}</b>
            </div>
            <div>
              <span>Desconto</span>
              <b>− {formatarMoeda(estado.r.desconto)}</b>
            </div>
          </div>
          {!estado.r.novo && <p className="cartao-linha" style={{ color: "var(--verde-suave)" }}>Este resgate já estava registrado; nada foi duplicado.</p>}
        </div>
      )}

      {!emResposta && (
        <>
          <div className="espaco" />
          {colando ? (
            <label className="campo-colar">
              <span>Cole o telefone aqui</span>
              <input
                inputMode="tel"
                autoFocus
                placeholder="(11) 98765-4321"
                onPaste={(e) => {
                  e.preventDefault();
                  if (receber(e.clipboardData.getData("text"))) setColando(false);
                }}
                onChange={(e) => {
                  if (e.target.value.replace(/\D/g, "").length >= 11 && receber(e.target.value)) setColando(false);
                }}
              />
            </label>
          ) : (
            <button type="button" className="botao-colar" onClick={colar} disabled={estado.fase === "consultando"}>
              Colar telefone
            </button>
          )}
          <Teclado aoTeclar={tecla} desativado={estado.fase === "consultando"} />
        </>
      )}

      {emResposta && !ativo && <div className="espaco" />}
      {emResposta && (
        <button
          className={`botao-grande ${estado.fase === "aplicado" ? "claro" : ""}`}
          onClick={novoAtendimento}
        >
          Novo atendimento
        </button>
      )}
    </div>
  );
}

function Fala({ texto }: { texto: string }) {
  return (
    <figure className="fala">
      <figcaption>O que dizer ao cliente</figcaption>
      <blockquote>{texto}</blockquote>
    </figure>
  );
}

/** Mostra a máscara com os dígitos ocultos apagados e o próximo dígito em vermelho. */
function Visor({ digitos, compacto }: { digitos: string; compacto: boolean }) {
  const mascara = mascararTelefone(digitos);
  const primeiroVazio = mascara.indexOf("_");
  return (
    <div className={`visor ${compacto ? "compacto" : ""}`} aria-label={`Telefone, ${digitos.length} de 11 dígitos`}>
      {[...mascara].map((ch, i) => (
        <span key={i} className={ch === "•" ? "oculto" : ch === "_" ? (i === primeiroVazio ? "falta" : "oculto") : undefined}>
          {ch}
        </span>
      ))}
    </div>
  );
}

function Teclado({ aoTeclar, desativado }: { aoTeclar: (t: string) => void; desativado: boolean }) {
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "limpar", "0", "apagar"];
  return (
    <div className="teclado">
      {teclas.map((t) => (
        <button
          key={t}
          className={`tecla ${t.length > 1 ? "tecla-acao" : ""}`}
          onClick={() => aoTeclar(t)}
          disabled={desativado}
          aria-label={t === "apagar" ? "Apagar último dígito" : t === "limpar" ? "Limpar" : t}
        >
          {t === "apagar" ? "⌫" : t === "limpar" ? "Limpar" : t}
        </button>
      ))}
    </div>
  );
}

function CartaoAtivo({
  r,
  aoAplicar,
}: {
  r: Extract<RespostaConsulta, { tipo: "ativo" }>;
  aoAplicar: (res: Extract<RespostaResgate, { ok: true }>) => void;
}) {
  const [conta, setConta] = useState("");
  const [pessoas, setPessoas] = useState(2);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const travado = useRef(false); // segura toque duplo antes do re-render

  const valorConta = lerNumeroBR(conta);
  const previa = calcularDesconto(r.calculo, valorConta, r.calculo.descontoMax, r.calculo.tetoRestante);
  const podeAplicar = valorConta > 0 && !enviando;

  async function aplicar() {
    if (travado.current || !podeAplicar) return;
    travado.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/salao/aplicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ beneficio_id: r.beneficioId, valor_conta: valorConta, pessoas }),
      });
      const corpo = (await resp.json()) as RespostaResgate;
      if (!corpo.ok) throw new Error(corpo.mensagem);
      aoAplicar(corpo);
    } catch (e) {
      // Reenviar é seguro: o servidor devolve o mesmo resgate se o primeiro já tiver gravado.
      setErro(e instanceof Error && e.message ? e.message : "Sem conexão. Toque em Aplicar de novo.");
      travado.current = false;
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="cartao ativo">
        <div>
          <div className="cartao-topo">
            <p className="cartao-nome">{r.nome}</p>
            {r.antesDaJanela && <p className="cartao-demo">demo: antes da janela</p>}
          </div>
          <p className="cartao-destaque">{r.beneficio}</p>
          <p className="cartao-linha">
            Vale {r.validade} · código <b className="mono">{r.codigo}</b>
          </p>
        </div>

        <div className="conta-e-mesa">
        <label className="campo-conta">
          <span className="so-leitor">Valor da conta</span>
          <span className="campo-moeda">
            <span>R$</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="valor da conta"
              value={conta}
              onChange={(e) => setConta(e.target.value.replace(/[^\d,.]/g, ""))}
              onBlur={() => {
                const n = lerNumeroBR(conta);
                if (Number.isFinite(n)) setConta(formatarNumeroBR(n));
              }}
              autoFocus
            />
          </span>
        </label>
        <div className="mesa" role="group" aria-label="Pessoas na mesa">
          <button type="button" aria-label="Menos uma pessoa" onClick={() => setPessoas((n) => Math.max(1, n - 1))}>
            −
          </button>
          <span>
            <b>{pessoas}</b>
            <small>{pessoas === 1 ? "pessoa" : "pessoas"}</small>
          </span>
          <button type="button" aria-label="Mais uma pessoa" onClick={() => setPessoas((n) => Math.min(20, n + 1))}>
            +
          </button>
        </div>
        </div>

        <div className="parciais">
          <div>
            <span>Desconto</span>
            <b>{valorConta > 0 ? formatarMoeda(previa.desconto) : "—"}</b>
            {previa.limitadoPor === "desconto_max" && <small>limitado a {r.calculo.descontoMax}% da conta</small>}
            {previa.limitadoPor === "teto" && <small>limitado pelo teto da campanha</small>}
          </div>
          <div>
            <span>Cobrar</span>
            <b>{valorConta > 0 ? formatarMoeda(valorConta - previa.desconto) : "—"}</b>
          </div>
        </div>
        {erro && <p className="salao-status">{erro}</p>}
      </div>

      {r.script && <Fala texto={r.script} />}

      <div className="espaco" />
      <button className="botao-grande primario" onClick={aplicar} disabled={!podeAplicar}>
        {enviando ? "Aplicando…" : "Aplicar"}
      </button>
    </>
  );
}
