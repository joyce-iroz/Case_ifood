import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { hojeNoFuso } from "@/lib/dominio";
import { randomUUID } from "node:crypto";
import { REGRAS_DEMO, RESTAURANTE_DEMO, gerarClientesCompletos, gerarOcupacao } from "@/lib/seed";
import { gerarHistorico } from "@/lib/seed-historico";
import { descreverErro } from "@/lib/erros";

export const dynamic = "force-dynamic";

/**
 * Seed e botão "Resetar demo". Apaga tudo e popula de novo.
 * Idempotente: apagar restaurantes leva o resto junto (on delete cascade), e o
 * restaurante tem id fixo, então dois resets simultâneos não duplicam dados.
 */
export async function POST() {
  const inicio = Date.now();
  try {
    const db = supabaseServidor();
    const hoje = hojeNoFuso();

    const apagar = await db.from("restaurantes").delete().not("id", "is", null);
    if (apagar.error) throw apagar.error;

    const rest = await db.from("restaurantes").insert(RESTAURANTE_DEMO);
    if (rest.error) throw rest.error;

    const ocupacao = gerarOcupacao(hoje);
    const gerados = gerarClientesCompletos(hoje).map((g) => ({ ...g, id: randomUUID() as string }));

    // Histórico: duas campanhas encerradas com resgates. Quem resgatou ganha a visita
    // daquele dia, como o resgate de verdade faz.
    const historico = gerarHistorico(hoje, gerados, () => randomUUID());
    const porId = new Map(gerados.map((g) => [g.id, g]));
    for (const v of historico.visitasNovas) {
      const g = porId.get(v.cliente_id)!;
      g.visitas.push({ data: v.data, hora: v.hora });
      g.linha = {
        ...g.linha,
        visitas: g.linha.visitas + 1,
        ultima_visita: !g.linha.ultima_visita || v.data > g.linha.ultima_visita ? v.data : g.linha.ultima_visita,
      };
    }

    const clientes = gerados.map((g) => ({ id: g.id, ...g.linha })); // telefone em claro não vai para o banco
    const visitas = gerados.flatMap((g) =>
      g.visitas.map((v) => ({ restaurante_id: RESTAURANTE_DEMO.id, cliente_id: g.id, data: v.data, hora: v.hora })),
    );

    const resultados = await Promise.all([
      db.from("regras").insert(REGRAS_DEMO),
      db.from("ocupacao").insert(ocupacao),
      db.from("clientes").insert(clientes),
      db.from("campanhas").insert(historico.campanhas),
    ]);
    const falha = resultados.find((r) => r.error);
    if (falha?.error) throw falha.error;

    const etapa2 = await Promise.all([
      db.from("visitas").insert(visitas),
      db.from("beneficios").insert(historico.beneficios),
      db.from("kits").insert(historico.kits),
    ]);
    const falha2 = etapa2.find((r) => r.error);
    if (falha2?.error) throw falha2.error;

    const r3 = await db.from("resgates").insert(historico.resgates);
    if (r3.error) throw r3.error;

    return NextResponse.json({
      ok: true,
      hoje,
      restaurante: RESTAURANTE_DEMO.nome,
      ocupacao: ocupacao.length,
      clientes: clientes.length,
      visitas: visitas.length,
      historico: { campanhas: historico.campanhas.length, resgates: historico.resgates.length, data: historico.data },
      ms: Date.now() - inicio,
    });
  } catch (e) {
    const { status, mensagem } = descreverErro(e);
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
