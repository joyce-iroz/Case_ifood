# Mesa Cheia

> **REGRA DO PROJETO, VALE PARA TODO O DESENVOLVIMENTO**
>
> "A previsão de ocupação é aritmética sobre dados históricos, nunca um
> modelo. A validação de benefício no fechamento da conta é consulta direta
> ao banco, nunca uma chamada a LLM. A IA só entra para planejar campanhas
> dentro de regras validadas por código e para gerar texto."
>
> Na prática: `lib/ocupacao.ts` faz médias e somas, e assim deve continuar.
> Resgate de benefício é um `select` por `beneficios.codigo` mais checagem de
> `status` e `valido_de`/`valido_ate`. Toda proposta de campanha vinda de IA
> passa por uma função TypeScript que confere `regras` antes de ser gravada ou
> mostrada ao dono; se a função recusar, a campanha não existe.

## Produto

Ferramenta para dono de restaurante encher mesas vazias com benefícios
dirigidos a clientes específicos. Dois usuários:

- o dono, que vê os horários vazios e aprova campanhas;
- o atendente de salão, que aplica o benefício na conta.

Sem login e sem autenticação. A entrada do app (`/`) é um seletor de papel com
"Sou o dono" (`/dono`) e "Sou o salão" (`/salao`).

A demo usa um único restaurante, "Cantina do Bairro" (italiana, 64 lugares,
ticket médio R$ 78, terça a domingo, 11h–15h e 18h–23h), com id fixo
`RESTAURANTE_DEMO_ID` em `lib/dominio.ts`.

## Estado atual

Feito: schema, seed (`POST /api/reset`), `GET /api/ocupacao`, seletor de
papel, grade de ocupação do dono com botão "Resetar demo", placeholder do salão.

Ainda não existe: IA, campanhas, benefícios, resgate. As tabelas já estão
criadas e vazias.

## Stack

- Next.js 16 (App Router) + TypeScript, React 19. CSS puro em `app/globals.css`.
- Supabase (Postgres) via `@supabase/supabase-js`, só no servidor.
- Deploy na Vercel.
- Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ver `.env.example`).

## Comandos

```bash
npm run dev          # servidor local
npm run build        # build de produção (também roda o typecheck)
npm run typecheck
npm run check:seed   # imprime a grade gerada pelo seed, sem banco
```

## Estrutura

```
app/
  page.tsx               seletor de papel
  dono/page.tsx          grade de ocupação (server component)
  salao/page.tsx         placeholder
  api/reset/route.ts     POST: apaga tudo e popula de novo
  api/ocupacao/route.ts  GET: médias por dia da semana × hora
components/BotaoResetar.tsx   único componente de cliente
lib/
  supabase/server.ts     cliente com service_role ("server-only")
  dados.ts               leituras no banco ("server-only")
  dominio.ts             constantes, datas, horas de funcionamento (puro)
  ocupacao.ts            cálculo da grade (puro)
  seed.ts                gerador determinístico dos dados da demo (puro)
  erros.ts               erro → status HTTP
scripts/check-seed.ts
supabase/schema.sql      colar no SQL Editor do Supabase
```

## Convenções

- **service_role só no servidor.** O único ponto que lê
  `SUPABASE_SERVICE_ROLE_KEY` é `lib/supabase/server.ts`, que importa
  `server-only`; importá-lo de um componente `"use client"` quebra o build.
  Componentes de cliente falam com o banco só via rotas `/api/*` ou via props
  de server components. Nunca crie variável `NEXT_PUBLIC_` com chave.
- **RLS ligado, sem políticas**, em todas as tabelas. A anon key não acessa
  nada; a service_role ignora RLS. Não adicione políticas abertas.
- **Lógica de domínio é pura.** Cálculo e geração ficam em `lib/*.ts` sem
  importar o Supabase, para rodar em script e teste sem banco. O acesso ao
  banco fica em `lib/dados.ts` (e, no futuro, arquivos irmãos).
- **Dia da semana: 0 = domingo … 6 = sábado**, igual a `extract(dow)` do
  Postgres e `Date.getUTCDay()`. Na interface, a semana é exibida de segunda a
  domingo (`ordenarDiasSemana`).
- **Datas** são strings `YYYY-MM-DD`, manipuladas com `somarDias` e
  `diaDaSemana` (aritmética em UTC, sem depender do fuso do servidor). "Hoje" é
  sempre `hojeNoFuso()`, em `America/Sao_Paulo`. O servidor da Vercel roda em
  UTC, então não use `new Date()` para decidir o dia.
- **Hora de ocupação** é a hora cheia de início: `hora = 19` é 19h–20h.
- **Unidades**: dinheiro em reais (`numeric(10,2)`); percentuais de 0 a 100
  (`desconto_max`, `ocupacao_min`, `percentual` da API). O supabase-js devolve
  `numeric` como string: converta com `Number()` na fronteira (`lib/dados.ts`).
- **Leituras grandes paginam** de 1000 em 1000 (limite padrão do PostgREST),
  como em `carregarRegistros`.
- **Seed determinístico.** `lib/seed.ts` usa mulberry32 com semente fixa. O
  ruído de ocupação é sorteado por (dia da semana, n-ésima ocorrência desse dia
  contando de trás para frente, hora), então a grade fica praticamente igual
  em qualquer dia em que o reset rodar. Mexeu nos fatores? Rode
  `npm run check:seed` e confira que terça à noite continua perto de 34%.
- **Reset idempotente.** `DELETE` em `restaurantes` apaga o resto por
  `on delete cascade`; o id fixo do restaurante impede duplicação em resets
  simultâneos. Tabela nova precisa de FK com cascade até `restaurantes`, ou
  tem que ser limpa explicitamente em `/api/reset`.
- **Telefone** nunca é gravado em claro: `telefone_hash` = sha256 dos dígitos
  com DDI (`5511987654321`), via `hashTelefone` em `lib/seed.ts`; use a mesma
  função para buscar. Só os 4 últimos dígitos ficam em `telefone_final`, para
  exibir mascarado. Em produção, troque por HMAC com segredo: telefone
  brasileiro tem poucas combinações e sha256 puro é reversível por força bruta.
- Identificadores de domínio em português, sem acento no código
  (`ocupacao`, `beneficio`); texto de interface em português com acento.
- Schema mudou? Atualize `supabase/schema.sql` (ele derruba e recria tudo) e a
  seção abaixo, no mesmo commit.

## Schema

Fonte da verdade: `supabase/schema.sql`. Colunas marcadas com † são extensões
ao desenho original, necessárias para a demo.

### restaurantes
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | demo usa `RESTAURANTE_DEMO_ID` |
| nome | text | |
| cozinha | text | |
| capacidade | integer | lugares |
| ticket_medio | numeric(10,2) | R$ |
| abre | time | abertura do primeiro turno |
| fecha | time | fechamento do último turno |
| pausa_inicio † | time null | início do intervalo entre turnos |
| pausa_fim † | time null | fim do intervalo |
| dias_abertos † | smallint[] | dias da semana abertos (0 = dom) |

### ocupacao
| coluna | tipo | nota |
|---|---|---|
| id | bigint identity pk | |
| restaurante_id | uuid fk → restaurantes, cascade | |
| data | date | |
| hora | smallint 0–23 | hora cheia de início |
| pessoas | integer | sentadas naquela hora |

Único `(restaurante_id, data, hora)`, que também indexa a leitura por período.

### clientes
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| restaurante_id | uuid fk → restaurantes, cascade | |
| telefone_hash | text | sha256 hex; único por restaurante |
| telefone_final † | char(4) | últimos 4 dígitos |
| nome | text | |
| visitas | integer | visitas ao salão |
| ultima_visita | date null | null = nunca veio ao salão |
| origem | text | `'delivery'` \| `'salao'` |
| dia_habitual † | smallint null | janela habitual no salão |
| turno_habitual † | text null | `'almoco'` \| `'jantar'` |
| pedidos_delivery † | integer | |

Índices: `(restaurante_id, dia_habitual, turno_habitual)`,
`(restaurante_id, origem)`, `(restaurante_id, ultima_visita)`.

Seed: 60 de terça à noite, 120 de outras janelas (visita nos últimos 56 dias),
150 só delivery (`visitas = 0`, `ultima_visita` null), 70 sumidos (última
visita entre 61 e 240 dias atrás).

### campanhas
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| restaurante_id | uuid fk → restaurantes, cascade | |
| dia_semana | smallint 0–6 | |
| hora_inicio | time | |
| hora_fim | time | > hora_inicio |
| segmento | text | |
| tipo | text | ex.: `'percentual'`, `'valor_fixo'`, `'item'` (a definir) |
| valor | numeric(10,2) | |
| teto | numeric(10,2) null | gasto máximo da campanha, R$ |
| status | text | default `'proposta'`; valores a definir na próxima etapa |
| criado_em † | timestamptz | |

Índice: `(restaurante_id, status)`.

### beneficios
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| campanha_id | uuid fk → campanhas, cascade | |
| cliente_id | uuid fk → clientes, cascade | |
| codigo | text unique | chave da validação no fechamento da conta |
| valido_de | timestamptz | |
| valido_ate | timestamptz | > valido_de |
| status | text | `'emitido'` \| `'resgatado'` \| `'expirado'` |
| criado_em † | timestamptz | para `dias_entre_ofertas` |

Índices: `campanha_id`; `(cliente_id, criado_em desc)`.

### resgates
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| beneficio_id | uuid fk → beneficios, cascade, unique | um resgate por benefício |
| valor_conta | numeric(10,2) | |
| desconto | numeric(10,2) | |
| criado_em | timestamptz | default now() |
| incremental | boolean | a visita não teria acontecido sem o benefício |

Índice: `criado_em` (consumo do `teto_mes`).

### regras
| coluna | tipo | nota |
|---|---|---|
| restaurante_id | uuid pk, fk → restaurantes, cascade | |
| teto_mes | numeric(10,2) | R$ de desconto por mês; seed 1200 |
| desconto_max | numeric(5,2) | % da conta; seed 20 |
| dias_entre_ofertas | integer | seed 15 |
| ocupacao_min | numeric(5,2) | % da capacidade; abaixo disso a janela é "vazia"; seed 50 |

## API

- `POST /api/reset` → `{ ok, hoje, restaurante, ocupacao, clientes, ms }`.
- `GET /api/ocupacao` → `{ restaurante, periodo: {de, ate}, dias, horas,
  celulas: [{ dia, hora, percentual, amostras }], cadeirasHoraVazias30d }`.
  Média de `pessoas / capacidade` por (dia da semana, hora) nos 60 dias que
  terminam ontem. Cadeiras-hora vazias = soma de `capacidade − pessoas` nas
  horas de funcionamento dos 30 dias que terminam ontem.
