import Link from "next/link";
import { Marca } from "@/components/Marca";

const MINI = ["c-v3", "c-v2", "c-v1", "c-n2", "c-n3", "c-n3", "c-v2", "c-v1", "c-n1", "c-n2", "c-n3", "c-n2"];

export default function Inicio() {
  return (
    <main className="inicio">
      <div>
        <Marca tamanho={32} />
        <span className="inicio-rotulo">Restaurante de demonstração</span>
        <h1>Cantina do Bairro</h1>
        <p className="legenda">Quem está usando?</p>
      </div>
      <div className="papeis">
        <Link href="/dono" className="papel">
          <div className="mini-grade" aria-hidden="true">
            {MINI.map((c, i) => (
              <span key={i} className={c} />
            ))}
          </div>
          <div>
            <strong>Sou o dono</strong>
            <p>Ver os horários vazios, criar campanhas e acompanhar o que voltou.</p>
          </div>
          <span className="chamada" style={{ color: "var(--vermelho)" }}>Abrir painel →</span>
        </Link>
        <Link href="/salao" className="papel">
          <div className="mini-teclado" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          <div>
            <strong>Sou o salão</strong>
            <p>Digitar o telefone do cliente e aplicar o benefício na conta.</p>
          </div>
          <span className="chamada">Abrir teclado →</span>
        </Link>
      </div>

      <Link href="/diagnostico" className="inicio-novo">
        <div>
          <strong>Tem um restaurante e quer usar o Mesa Cheia?</strong>
          <p>Veja em um minuto quantas mesas ficam vazias no seu salão e quanto dá para recuperar.</p>
        </div>
        <span className="chamada">Fazer diagnóstico →</span>
      </Link>
    </main>
  );
}
