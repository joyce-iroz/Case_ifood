import { formatarMoeda } from "@/lib/dominio";
import type { Projecao } from "@/lib/projecao";

const pct = (v: number) => `${String(Math.round(v * 1000) / 10).replace(".", ",")}%`;

/** Retorno esperado de uma campanha. Sem estado: serve ao planejador e ao formulário. */
export function ProjecaoView({ projecao, controle }: { projecao: Projecao; controle: number }) {
  const p = projecao;
  return (
    <div className="projecao" aria-live="polite">
      <div className="projecao-cabeca">
        <b>Retorno esperado</b>
        <span className="legenda">
          {p.base === "historico"
            ? `pelo histórico deste segmento: ${pct(p.taxaResgate)} de resgate, ${pct(p.taxaIncremental)} incrementais`
            : `sem histórico deste segmento: ${pct(p.taxaResgate)} de resgate (padrão), ${pct(p.taxaIncremental)} incrementais pela definição do segmento`}
        </span>
      </div>
      <div className="projecao-numeros">
        <div>
          <span>Resgates</span>
          <b>{p.resgates}</b>
        </div>
        <div>
          <span>Clientes novos</span>
          <b className={p.incrementais > 0 ? "verde" : undefined}>{p.incrementais}</b>
        </div>
        <div>
          <span>Receita nova</span>
          <b className={p.receitaIncremental > 0 ? "verde" : undefined}>{formatarMoeda(p.receitaIncremental)}</b>
        </div>
        <div>
          <span>Custo esperado</span>
          <b>{formatarMoeda(p.custo)}</b>
        </div>
        <div>
          <span>Custo por cliente novo</span>
          <b className={p.custoPorIncremental === null ? "alerta-texto" : undefined}>
            {p.custoPorIncremental === null ? "sem cliente novo" : formatarMoeda(p.custoPorIncremental)}
          </b>
        </div>
      </div>
      <p className="legenda">
        {p.emitidos} recebem o benefício
        {controle > 0 ? `; ${controle} sorteados ficam no grupo de controle, sem benefício, para medir o efeito real.` : "."}{" "}
        Desconto típico de {formatarMoeda(p.descontoMedio)} por conta de ticket médio.
        {p.semanas > 1 &&
          ` Com ${p.semanas} semanas, premissa: cada semana extra soma metade da taxa de uma semana (${pct(p.taxaBase)}), até dobrar; cada benefício continua valendo um resgate só.`}
      </p>
    </div>
  );
}
