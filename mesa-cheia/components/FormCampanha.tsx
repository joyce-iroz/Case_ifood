"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NOMES_DIA, formatarMoeda } from "@/lib/dominio";
import { SEGMENTOS, type Segmento } from "@/lib/segmentos";
import type { Bloqueio, TipoBeneficio } from "@/lib/campanha";
import type { ContextoJanela, ResultadoCriacao } from "@/lib/emissao";

type Props = {
  dias: number[];
  horas: number[]; // horas cheias de funcionamento
  fecha: number;
  janelaInicial: { dia: number; inicio: number; fim: number };
  contextoInicial: ContextoJanela | null;
};

export function FormCampanha({ dias, horas, fecha, janelaInicial, contextoInicial }: Props) {
  const router = useRouter();
  const [dia, setDia] = useState(janelaInicial.dia);
  const [inicio, setInicio] = useState(janelaInicial.inicio);
  const [fim, setFim] = useState(janelaInicial.fim);
  const [segmento, setSegmento] = useState<Segmento>("frequenta_outras");
  const [tipo, setTipo] = useState<TipoBeneficio>("percentual");
  const [valor, setValor] = useState("15");
  const [teto, setTeto] = useState("300");
  const [ctx, setCtx] = useState<ContextoJanela | null>(contextoInicial);
  const [carregandoCtx, setCarregandoCtx] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCriacao | { erro: string } | null>(null);
  const versao = useRef(0);
  const primeira = useRef(true);

  const opcoesFim = [...horas.map((h) => h + 1), fecha].filter((h, i, a) => h > inicio && a.indexOf(h) === i);

  async function buscarContexto() {
    const v = ++versao.current;
    setCarregandoCtx(true);
    try {
      const r = await fetch(`/api/segmentos?dia=${dia}&inicio=${inicio}&fim=${fim}`);
      const corpo = await r.json();
      if (v === versao.current && r.ok) setCtx(corpo);
    } finally {
      if (v === versao.current) setCarregandoCtx(false);
    }
  }

  useEffect(() => {
    if (primeira.current && contextoInicial) {
      primeira.current = false;
      return;
    }
    primeira.current = false;
    buscarContexto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, inicio, fim]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dia_semana: dia,
          hora_inicio: inicio,
          hora_fim: fim,
          segmento,
          tipo,
          valor: Number(valor.replace(",", ".")),
          teto: Number(teto.replace(",", ".")),
        }),
      });
      const corpo = await r.json().catch(() => ({ erro: `Falha (${r.status})` }));
      setResultado(corpo);
      if (corpo.ok) {
        router.refresh();
        buscarContexto();
      }
    } catch {
      setResultado({ erro: "Sem conexão. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  }

  const limite = ctx ? (tipo === "percentual" ? `máx. ${ctx.regras.desconto_max}%` : `máx. ${formatarMoeda(ctx.limiteValorFixo)}`) : "";

  return (
    <form className="form-campanha" onSubmit={salvar}>
      <div className="campo">
        <span id="rot-dia">Dia</span>
        <div className="dias" role="group" aria-labelledby="rot-dia">
          {dias.map((d) => (
            <button key={d} type="button" className="opcao" aria-pressed={dia === d} onClick={() => setDia(d)}>
              {NOMES_DIA[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="duas">
        <label className="campo">
          Das
          <select
            value={inicio}
            onChange={(e) => {
              const n = Number(e.target.value);
              setInicio(n);
              if (fim <= n) setFim(n + 1);
            }}
          >
            {horas.map((h) => (
              <option key={h} value={h}>{h}h</option>
            ))}
          </select>
        </label>
        <label className="campo">
          Até
          <select value={fim} onChange={(e) => setFim(Number(e.target.value))}>
            {opcoesFim.map((h) => (
              <option key={h} value={h}>{h}h</option>
            ))}
          </select>
        </label>
      </div>

      {ctx && (
        <p className="contexto">
          <span>
            Ocupação{" "}
            <b className={ctx.ocupacaoJanela !== null && ctx.ocupacaoJanela < ctx.regras.ocupacao_min ? "alerta" : undefined}>
              {ctx.ocupacaoJanela === null ? "sem histórico" : `${Math.round(ctx.ocupacaoJanela)}%`}
            </b>
          </span>
          <span>
            Vale <b>{ctx.validade}</b>
          </span>
          <span>
            Teto restante <b>{formatarMoeda(Math.max(0, ctx.tetoRestanteMes))}</b>
          </span>
        </p>
      )}

      <fieldset className="segmentos" aria-busy={carregandoCtx}>
        <legend className="campo">Segmento</legend>
        {SEGMENTOS.map((s) => {
          const c = ctx?.contagens[s.id];
          return (
            <label key={s.id} className={segmento === s.id ? "segmento ativo" : "segmento"}>
              <input type="radio" name="segmento" value={s.id} checked={segmento === s.id} onChange={() => setSegmento(s.id)} />
              <span className="segmento-rotulo">{s.rotulo}</span>
              <span className="segmento-contagem">
                {c ? (
                  <>
                    <b>{c.total}</b>
                    {c.elegiveis < c.total ? <> · {c.elegiveis} elegíveis</> : " clientes"}
                  </>
                ) : (
                  "…"
                )}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="campo">
        <span id="rot-tipo">Benefício</span>
        <div className="alternador" role="group" aria-labelledby="rot-tipo">
          <button type="button" aria-pressed={tipo === "percentual"} onClick={() => setTipo("percentual")}>
            % da conta
          </button>
          <button type="button" aria-pressed={tipo === "valor_fixo"} onClick={() => setTipo("valor_fixo")}>
            R$ fixo
          </button>
        </div>
      </div>

      <div className="duas">
        <label className="campo">
          Valor{limite && ` · ${limite}`}
          <span className="entrada">
            {tipo === "valor_fixo" && <span>R$</span>}
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
            {tipo === "percentual" && <span>%</span>}
          </span>
        </label>
        <label className="campo">
          Teto de gasto
          <span className="entrada">
            <span>R$</span>
            <input inputMode="decimal" value={teto} onChange={(e) => setTeto(e.target.value)} required />
          </span>
        </label>
      </div>

      <button className="botao primario" disabled={enviando}>
        {enviando ? "Emitindo…" : "Criar campanha e emitir benefícios"}
      </button>

      {resultado && <Resultado r={resultado} />}
    </form>
  );
}

function Resultado({ r }: { r: ResultadoCriacao | { erro: string } }) {
  if ("erro" in r) return <p className="aviso">{r.erro}</p>;
  if (r.ok) {
    return (
      <div className="sucesso">
        <b>Campanha criada.</b> {r.emitidos} benefícios emitidos, válidos {r.validade}.
        {r.foraPorIntervalo > 0 && (
          <> {r.foraPorIntervalo} clientes do segmento ficaram de fora: receberam oferta há menos de {r.regras.dias_entre_ofertas} dias.</>
        )}
      </div>
    );
  }
  return (
    <div className="aviso">
      <b>Campanha não criada. Nenhum benefício foi emitido.</b>
      <ul>
        {r.bloqueios.map((b: Bloqueio, i: number) => (
          <li key={i}>
            <span className="regra">{ROTULO_REGRA[b.regra]}</span> {b.mensagem}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROTULO_REGRA: Record<Bloqueio["regra"], string> = {
  dados: "Dados",
  janela: "Horário",
  desconto_max: "Desconto máximo",
  ocupacao_min: "Ocupação mínima",
  teto_mes: "Teto do mês",
  dias_entre_ofertas: "Intervalo entre ofertas",
};
