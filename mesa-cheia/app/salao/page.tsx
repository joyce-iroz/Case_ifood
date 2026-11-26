import Link from "next/link";
import { Salao } from "@/components/Salao";

export default function PaginaSalao() {
  return (
    <main className="pagina pagina-salao">
      <div className="topo topo-salao">
        <h1>Salão</h1>
        <Link href="/" className="voltar">Trocar papel</Link>
      </div>
      <Salao />
    </main>
  );
}
