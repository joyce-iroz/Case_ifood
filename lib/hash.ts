import { createHash } from "node:crypto";
import { normalizarTelefone } from "./telefone";

/** sha256 hex do telefone normalizado (só dígitos, com DDI 55). Seed e salão usam esta mesma função. */
export function hashTelefone(telefone: string): string {
  return createHash("sha256").update(normalizarTelefone(telefone)).digest("hex");
}
