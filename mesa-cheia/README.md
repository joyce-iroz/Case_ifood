# Mesa Cheia

Benefícios dirigidos para encher as mesas vazias de um restaurante. Contexto completo em `CLAUDE.md`.

## Rodar

1. No Supabase, abra o SQL Editor, cole `supabase/schema.sql` e execute. Sempre
   que o arquivo mudar, rode de novo: ele apaga e recria as tabelas. Depois clique
   em "Resetar demo".
2. Copie `.env.example` para `.env.local` e preencha as duas variáveis.
3. Instale e suba:

```bash
npm install
```

```bash
npm run dev
```

4. Abra `/dono` e clique em "Resetar demo" (ou rode `curl -X POST http://localhost:3000/api/reset`).

Na Vercel, cadastre as variáveis em Settings → Environment Variables:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `GEMINI_API_KEY`
(sem a do Gemini, o planejador funciona só pela regra fixa).
