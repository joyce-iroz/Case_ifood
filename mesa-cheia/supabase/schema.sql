-- Mesa Cheia: schema do banco (Supabase / Postgres 15+)
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Pode ser rodado de novo: derruba e recria as tabelas (apaga os dados).
-- Depois, popule com POST /api/reset (ou o botão "Resetar demo").

drop table if exists resgates   cascade;
drop table if exists beneficios cascade;
drop table if exists campanhas  cascade;
drop table if exists clientes   cascade;
drop table if exists ocupacao   cascade;
drop table if exists regras     cascade;
drop table if exists restaurantes cascade;

-- Convenção de dia da semana em todo o projeto: 0 = domingo ... 6 = sábado
-- (igual a extract(dow) do Postgres e Date.getUTCDay() do JavaScript).

create table restaurantes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cozinha       text not null,
  capacidade    integer not null check (capacidade > 0),
  ticket_medio  numeric(10,2) not null check (ticket_medio >= 0),
  abre          time not null,                 -- abertura do primeiro turno
  fecha         time not null,                 -- fechamento do último turno
  -- Extensões ao schema mínimo: a Cantina tem dois turnos e fecha às segundas.
  pausa_inicio  time,                          -- fim do almoço (null = sem pausa)
  pausa_fim     time,                          -- início do jantar
  dias_abertos  smallint[] not null default '{0,1,2,3,4,5,6}',
  check (fecha > abre),
  check ((pausa_inicio is null) = (pausa_fim is null)),
  check (pausa_inicio is null or (pausa_inicio > abre and pausa_fim > pausa_inicio and fecha > pausa_fim))
);

-- Uma linha por hora de funcionamento: "pessoas" sentadas naquela hora cheia.
create table ocupacao (
  id              bigint generated always as identity primary key,
  restaurante_id  uuid not null references restaurantes(id) on delete cascade,
  data            date not null,
  hora            smallint not null check (hora between 0 and 23),
  pessoas         integer not null check (pessoas >= 0),
  unique (restaurante_id, data, hora)          -- também serve à consulta por período
);

create table clientes (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    uuid not null references restaurantes(id) on delete cascade,
  telefone_hash     text not null,             -- sha256 hex do telefone normalizado (só dígitos, com 55)
  telefone_final    char(4) not null,          -- últimos 4 dígitos, para exibir "(••) •••••-1234"
  nome              text not null,
  visitas           integer not null default 0 check (visitas >= 0),   -- visitas ao salão
  ultima_visita     date,                      -- última visita ao salão; null se nunca veio
  origem            text not null check (origem in ('delivery', 'salao')),
  -- Extensões: janela habitual no salão e volume de delivery, para segmentar campanhas.
  dia_habitual      smallint check (dia_habitual between 0 and 6),
  turno_habitual    text check (turno_habitual in ('almoco', 'jantar')),
  pedidos_delivery  integer not null default 0 check (pedidos_delivery >= 0),
  unique (restaurante_id, telefone_hash)
);
create index clientes_segmento_idx on clientes (restaurante_id, dia_habitual, turno_habitual);
create index clientes_origem_idx   on clientes (restaurante_id, origem);
create index clientes_ultima_idx   on clientes (restaurante_id, ultima_visita);

create table campanhas (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid not null references restaurantes(id) on delete cascade,
  dia_semana      smallint not null check (dia_semana between 0 and 6),
  hora_inicio     time not null,
  hora_fim        time not null,
  segmento        text not null,
  tipo            text not null,               -- ex.: 'percentual', 'valor_fixo', 'item'
  valor           numeric(10,2) not null check (valor >= 0),
  teto            numeric(10,2) check (teto >= 0),   -- teto de gasto da campanha, em R$
  status          text not null default 'proposta',
  criado_em       timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);
create index campanhas_restaurante_idx on campanhas (restaurante_id, status);

create table beneficios (
  id           uuid primary key default gen_random_uuid(),
  campanha_id  uuid not null references campanhas(id) on delete cascade,
  cliente_id   uuid not null references clientes(id) on delete cascade,
  codigo       text not null unique,           -- índice único: busca direta no fechamento da conta
  valido_de    timestamptz not null,
  valido_ate   timestamptz not null,
  status       text not null default 'emitido' check (status in ('emitido', 'resgatado', 'expirado')),
  criado_em    timestamptz not null default now(),
  check (valido_ate > valido_de)
);
create index beneficios_campanha_idx on beneficios (campanha_id);
create index beneficios_cliente_idx  on beneficios (cliente_id, criado_em desc);  -- dias_entre_ofertas

create table resgates (
  id            uuid primary key default gen_random_uuid(),
  beneficio_id  uuid not null unique references beneficios(id) on delete cascade,  -- um resgate por benefício
  valor_conta   numeric(10,2) not null check (valor_conta >= 0),
  desconto      numeric(10,2) not null check (desconto >= 0),
  criado_em     timestamptz not null default now(),
  incremental   boolean not null default false
);
create index resgates_criado_idx on resgates (criado_em);  -- consumo do teto_mes

create table regras (
  restaurante_id      uuid primary key references restaurantes(id) on delete cascade,
  teto_mes            numeric(10,2) not null check (teto_mes >= 0),            -- R$ por mês
  desconto_max        numeric(5,2) not null check (desconto_max between 0 and 100),  -- % da conta
  dias_entre_ofertas  integer not null check (dias_entre_ofertas >= 0),
  ocupacao_min        numeric(5,2) not null check (ocupacao_min between 0 and 100)   -- % da capacidade
);

-- O app só acessa o banco pelo servidor, com a service_role key (que ignora RLS).
-- RLS ligado e sem políticas = a anon key não lê nem escreve nada.
alter table restaurantes enable row level security;
alter table ocupacao     enable row level security;
alter table clientes     enable row level security;
alter table campanhas    enable row level security;
alter table beneficios   enable row level security;
alter table resgates     enable row level security;
alter table regras       enable row level security;
