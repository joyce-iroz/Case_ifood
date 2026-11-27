import Link from "next/link";
import { Salao } from "@/components/Salao";

export default function PaginaSalao() {
  return (
    <main className="salao-pagina">
      <div className="salao-topo">
        <div>
          <h1>Salão</h1>
          <span>Cantina do Bairro</span>
        </div>
        <Link href="/">Trocar papel</Link>
      </div>
      <Salao />
    </main>
  );
}
