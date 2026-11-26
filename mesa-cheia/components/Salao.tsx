"use client";

import { useRef, useState } from "react";
import { calcularDesconto } from "@/lib/campanha";
import { FUSO, formatarMoeda } from "@/lib/dominio";
import { mascararTelefone } from "@/lib/telefone";
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

/** "120,50", "1.234,50" e "120.50" viram número. */
const lerValor = (s: string) => Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);

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

  function novoAtendimento() {
    setDigitos("");
    setEstado({ fase: "digitando" });
  }

  const emResposta = estado.fase === "resposta" || estado.fase === "aplicado";
  const ativo = estado.fase === "resposta" && estado.r.tipo === "ativo";

  return (
    <div className="salao">
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
        <div className="cartao neutro">
          <p>Nenhum benefício ativo para este telefone.</p>
        </div>
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
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const travado = useRef(false); // segura toque duplo antes do re-render

  const valorConta = lerValor(conta);
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
        body: JSON.stringify({ beneficio_id: r.beneficioId, valor_conta: valorConta }),
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

        <label className="campo-conta">
          Valor da conta
          <span className="campo-moeda">
            <span>R$</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={conta}
              onChange={(e) => setConta(e.target.value.replace(/[^\d,.]/g, ""))}
              autoFocus
            />
          </span>
        </label>

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

      <div className="espaco" />
      <button className="botao-grande primario" onClick={aplicar} disabled={!podeAplicar}>
        {enviando ? "Aplicando…" : "Aplicar"}
      </button>
    </>
  );
}
