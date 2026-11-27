import type { TentativaView } from "@/lib/planejador";

/** Cada chamada ao modelo: o que voltou, se passou e o que reprovou. Sem estado, serve a server e client. */
export function Tentativas({ tentativas }: { tentativas: TentativaView[] }) {
  if (!tentativas.length) return <p className="legenda">Nenhuma chamada ao modelo.</p>;
  return (
    <ol className="tentativas">
      {tentativas.map((t) => (
        <li key={t.numero} className={t.aprovada ? "ok" : "falhou"}>
          <div className="tentativa-cabeca">
            <b>Tentativa {t.numero}</b>
            <span className={`selo ${t.aprovada ? "selo-resgatado" : "selo-demo"}`}>{t.aprovada ? "passou" : "reprovada"}</span>
            {t.ms !== null && <span className="legenda">{(t.ms / 1000).toFixed(1).replace(".", ",")} s</span>}
          </div>
          {t.erros.length > 0 && (
            <ul className="tentativa-erros">
              {t.erros.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {t.resposta && <pre className="tentativa-resposta">{formatar(t.resposta)}</pre>}
        </li>
      ))}
    </ol>
  );
}

function formatar(texto: string) {
  try {
    return JSON.stringify(JSON.parse(texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")), null, 2);
  } catch {
    return texto;
  }
}
