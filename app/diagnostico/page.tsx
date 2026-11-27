import Link from "next/link";
import { Marca } from "@/components/Marca";
import { Diagnostico } from "@/components/Diagnostico";
import { formatarMoeda } from "@/lib/dominio";
import {
  EXEMPLO_DIAGNOSTICO,
  META_RECUPERACAO,
  OCUPACAO_NIVEL,
  PERMANENCIA_H,
  diagnosticar,
} from "@/lib/diagnostico";

export const metadata = { title: "Diagnóstico de mesas vazias · Mesa Cheia" };

const exemplo = EXEMPLO_DIAGNOSTICO;
const resultadoExemplo = diagnosticar(exemplo);
const reais = (v: number) => formatarMoeda(v).replace(/,00$/, "");

export default function PaginaDiagnostico() {
  return (
    <>
      <header className="barra">
        <div className="barra-conteudo">
          <Marca />
          <nav className="papeis-nav" aria-label="Navegação">
            <Link href="/">Ver a demonstração</Link>
          </nav>
        </div>
      </header>
      <main className="pagina diagnostico">
        <section className="diag-promessa" aria-labelledby="t-promessa">
          <h1 id="t-promessa">
            Você só paga pelo cliente <span className="vermelho">que nunca veio.</span>
          </h1>
          <p>
            A cobrança é por cliente novo na mesa: quem pede seu delivery e nunca entrou, quem come comida como a sua em
            outro lugar, quem sumiu. Quem já vinha naquele horário não conta.
          </p>
          <ul className="diag-provas">
            <li>
              <b>Medido, não estimado.</b> 20% dos clientes ficam sem a oferta. A diferença entre os grupos é o que a
              campanha trouxe.
            </li>
            <li>
              <b>Você põe o limite.</b> Teto do mês e desconto máximo. Nada passa disso.
            </li>
            <li>
              <b>Para sozinha.</b> Se o horário encheu, a campanha pausa.
            </li>
          </ul>
        </section>
        <section className="como-funciona" aria-labelledby="t-como">
          <div className="como-cabeca">
            <span className="como-selo">Simulação grátis · 1 minuto</span>
            <h2 id="t-como">Como funciona a simulação</h2>
            <p>Uma conta rápida com o que você já sabe do seu salão. Não precisa de cadastro nem de dados do caixa.</p>
          </div>
          <ol className="como-passos">
            <li>
              <span className="como-num" aria-hidden="true">1</span>
              <b>Conte o tamanho da casa</b>
              <p>Quantos lugares tem o salão e quanto cada pessoa gasta, em média.</p>
              <div className="como-fichas">
                <span>{exemplo.capacidade} lugares</span>
                <span>{reais(exemplo.ticketMedio)} por pessoa</span>
              </div>
            </li>
            <li>
              <span className="como-num" aria-hidden="true">2</span>
              <b>Marque cada turno</b>
              <p>Almoço e jantar de cada dia: vazio, médio ou cheio. Do jeito que costuma ser.</p>
              <div className="como-fichas">
                <span className="ficha-vazio">vazio ≈ {OCUPACAO_NIVEL.vazio * 100}%</span>
                <span className="ficha-medio">médio ≈ {OCUPACAO_NIVEL.medio * 100}%</span>
                <span className="ficha-cheio">cheio ≈ {OCUPACAO_NIVEL.cheio * 100}%</span>
              </div>
            </li>
            <li>
              <span className="como-num" aria-hidden="true">3</span>
              <b>Veja quanto fica na mesa</b>
              <p>
                Cadeiras vazias por mês, os turnos mais fracos e quanto entra se {Math.round(META_RECUPERACAO * 100)}%
                delas forem ocupadas.
              </p>
              <div className="como-fichas">
                <span className="ficha-ganho">+ {reais(resultadoExemplo.receitaMes)} por mês</span>
              </div>
            </li>
          </ol>
          <p className="como-aviso">
            <b>É uma estimativa.</b> Uma conta de ticket médio para cada cadeira ocupada, cada mesa fica{" "}
            {String(PERMANENCIA_H).replace(".", ",")}h. Com o Mesa Cheia ligado, a conta sai do histórico real do seu
            salão, hora a hora.
          </p>
        </section>

        <div className="diagnostico-intro">
          <h2>Quantas mesas o seu salão deixa vazias?</h2>
          <p className="legenda">Marque como costuma estar cada turno.</p>
        </div>
        <Diagnostico />
      </main>
    </>
  );
}
