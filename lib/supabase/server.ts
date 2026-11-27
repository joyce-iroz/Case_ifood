import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente com a service_role key. O import "server-only" faz o build falhar
// se este módulo for importado, direta ou indiretamente, por um componente de cliente.
let cliente: SupabaseClient | null = null;

export class ConfiguracaoAusenteError extends Error {}

export function supabaseServidor(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new ConfiguracaoAusenteError(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja .env.example).",
    );
  }
  cliente = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
