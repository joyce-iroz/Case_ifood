import Link from "next/link";
import { Marca } from "@/components/Marca";
import { Diagnostico } from "@/components/Diagnostico";

export const metadata = { title: "Diagnóstico de mesas vazias · Mesa Cheia" };

export default function PaginaDiagnostico() {
  return (
    <>
      <header className="barra">
        <div className="barra-conteudo">
          <Marca />
          <nav className="papeis-nav" aria-label="Navegação">
            <Link href="/">Início</Link>
          </nav>
        </div>
      </header>
      <main className="pagina diagnostico">
        <div className="diagnostico-intro">
          <h1>Quantas mesas o seu salão deixa vazias?</h1>
          <p className="legenda">
            Marque como costuma estar cada turno. Em um minuto você vê as cadeiras-hora vazias por mês e quanto daria
            para recuperar trazendo clientes do iFood da sua região nos horários fracos.
          </p>
        </div>
        <Diagnostico />
      </main>
    </>
  );
}
