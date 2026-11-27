"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NOMES_DIA, formatarMoeda } from "@/lib/dominio";
import { formatarNumeroBR, lerNumeroBR } from "@/lib/numero";
import { SEGMENTOS, type Segmento } from "@/lib/segmentos";
import type { Bloqueio, TipoBeneficio } from "@/lib/campanha";
import type { ContextoJanela, ResultadoCriacao } from "@/lib/emissao";
import { projetar } from "@/lib/projecao";
import { ProjecaoView } from "./Projecao";

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
  const [semanas, setSemanas] = useState(1);
  const [limiteConta, setLimiteConta] = useState(""); // só %: desconto máximo por conta, em R$; vazio = sem limite
  const [ctx, setCtx] = useState<ContextoJanela | null>(contextoInicial);
  const [carregandoCtx, setCarregandoCtx] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCriacao | { erro: string } | null>(null);
  const versao = useRef(0);
  const primeira = useRef(true);

  // Depois de router.refresh() (campanha criada aqui ou pelo planejador), o servidor manda
  // um contexto novo; se a janela mostrada é a inicial, usa os números atualizados.
  useEffect(() => {
    if (contextoInicial && dia === janelaInicial.dia && inicio === janelaInicial.inicio && fim === janelaInicial.fim)
      setCtx(contextoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextoInicial]);

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
    const valorNum = lerNumeroBR(valor);
    const tetoNum = lerNumeroBR(teto);
    if (!Number.isFinite(valorNum) || !Number.isFinite(tetoNum)) {
      setResultado({
        erro: `Não entendi ${!Number.isFinite(valorNum) ? `o valor "${valor}"` : `o teto "${teto}"`}. Use, por exemplo, 15 ou 2.400,00.`,
      });
      return;
    }
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
          valor: valorNum,
          teto: tetoNum,
          semanas,
          limite_por_conta: tipo === "percentual" && limiteConta.trim() ? lerNumeroBR(limiteConta) : null,
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

  // Projeção ao vivo: mesma função pura do servidor, com as taxas que o contexto trouxe.
  const projecao = (() => {
    if (!ctx) return null;
    const elegiveis = ctx.contagens[segmento].elegiveis;
    const v = lerNumeroBR(valor);
    const t = lerNumeroBR(teto);
    if (!elegiveis || !Number.isFinite(v) || !Number.isFinite(t)) return null;
    const controle = elegiveis >= ctx.controleMinimo ? Math.round((elegiveis * ctx.controlePct) / 100) : 0;
    return {
      controle,
      p: projetar({
        emitidos: elegiveis - controle,
        horas: fim - inicio,
        semanas,
        tipo,
        valor: v,
        limite: tipo === "percentual" && limiteConta.trim() && lerNumeroBR(limiteConta) > 0 ? lerNumeroBR(limiteConta) : null,
        teto: t,
        ticketMedio: ctx.ticketMedio,
        descontoMax: ctx.regras.desconto_max,
        taxa: ctx.taxas[segmento],
      }),
    };
  })();

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
        <legend className="campo">Público</legend>
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
                    {c.elegiveis < c.total ? <> · {c.elegiveis} podem receber</> : " clientes"}
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
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => setValor((v) => reformatar(v, tipo === "percentual" ? [0, 2] : 2))}
              required
            />
            {tipo === "percentual" && <span>%</span>}
          </span>
        </label>
        <label className="campo">
          Teto de gasto
          <span className="entrada">
            <span>R$</span>
            <input
              inputMode="decimal"
              value={teto}
              onChange={(e) => setTeto(e.target.value)}
              onBlur={() => setTeto((v) => reformatar(v, 2))}
              required
            />
          </span>
        </label>
      </div>

      {tipo === "percentual" && (
        <label className="campo">
          Limite por conta (opcional)
          <span className="entrada">
            <span>R$</span>
            <input
              inputMode="decimal"
              placeholder="sem limite"
              value={limiteConta}
              onChange={(e) => setLimiteConta(e.target.value)}
              onBlur={() => setLimiteConta((v) => (v.trim() ? reformatar(v, 2) : ""))}
            />
          </span>
        </label>
      )}

      <label className="campo">
        Duração
        <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "só a próxima ocorrência" : `${n} semanas seguidas`}
            </option>
          ))}
        </select>
      </label>

      {projecao && <ProjecaoView projecao={projecao.p} controle={projecao.controle} />}

      <button className="botao primario" disabled={enviando}>
        {enviando ? "Criando…" : "Criar campanha"}
      </button>

      {resultado && <Resultado r={resultado} />}
    </form>
  );
}

/** Ao sair do campo, mostra o número como foi entendido ("2400" → "2.400,00"); texto inválido fica como está. */
function reformatar(texto: string, casas: number | [number, number]) {
  const n = lerNumeroBR(texto);
  return Number.isFinite(n) ? formatarNumeroBR(n, casas) : texto;
}

function Resultado({ r }: { r: ResultadoCriacao | { erro: string } }) {
  if ("erro" in r) return <p className="aviso">{r.erro}</p>;
  if (r.ok) {
    return (
      <div className="sucesso">
        <b>Campanha criada.</b> {r.emitidos} benefícios emitidos, válidos {r.validade}.
        {r.controle > 0 && <> {r.controle} clientes sorteados para o grupo de controle.</>}
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
  cardapio: "Cardápio do planejador",
};
