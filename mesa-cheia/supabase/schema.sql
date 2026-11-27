-- Mesa Cheia: schema do banco (Supabase / Postgres 15+)
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Pode ser rodado de novo: derruba e recria as tabelas (apaga os dados).
-- Depois, popule com POST /api/reset (ou o botão "Resetar demo").

drop function if exists resgatar_beneficio(uuid, numeric, numeric, boolean, date, smallint);
drop function if exists resgatar_beneficio(uuid, numeric, numeric, boolean, date, smallint, smallint);
drop table if exists leads cascade;
drop table if exists controles cascade;
drop table if exists kits cascade;
drop table if exists planejamento_tentativas cascade;
drop table if exists planejamentos cascade;
drop table if exists resgates   cascade;
drop table if exists beneficios cascade;
drop table if exists campanhas  cascade;
drop table if exists visitas    cascade;
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
  origem            text not null check (origem in ('delivery', 'salao', 'regiao')),  -- regiao: cliente iFood de outros restaurantes
  -- Extensões: janela habitual no salão e volume de delivery, para segmentar campanhas.
  dia_habitual      smallint check (dia_habitual between 0 and 6),
  turno_habitual    text check (turno_habitual in ('almoco', 'jantar')),
  pedidos_delivery  integer not null default 0 check (pedidos_delivery >= 0),
  -- Extensões do segmento "mesma cozinha na região" (dado da plataforma, nunca exibido nominalmente ao restaurante).
  pedidos_cozinha_regiao integer not null default 0 check (pedidos_cozinha_regiao >= 0),  -- pedidos da mesma cozinha em outros restaurantes, 60 dias
  distancia_km      numeric(5,2),
  unique (restaurante_id, telefone_hash)
);
create index clientes_segmento_idx on clientes (restaurante_id, dia_habitual, turno_habitual);
create index clientes_origem_idx   on clientes (restaurante_id, origem);
create index clientes_ultima_idx   on clientes (restaurante_id, ultima_visita);

-- Histórico de visitas ao salão. Base dos segmentos e da classificação de incremental.
create table visitas (
  id              bigint generated always as identity primary key,
  restaurante_id  uuid not null references restaurantes(id) on delete cascade,
  cliente_id      uuid not null references clientes(id) on delete cascade,
  data            date not null,
  hora            smallint not null check (hora between 0 and 23)
);
create index visitas_periodo_idx on visitas (restaurante_id, data);
create index visitas_cliente_idx on visitas (cliente_id, data desc);

create table campanhas (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid not null references restaurantes(id) on delete cascade,
  dia_semana      smallint not null check (dia_semana between 0 and 6),
  hora_inicio     time not null,
  hora_fim        time not null,
  segmento        text not null check (segmento in
                    ('frequenta_janela', 'frequenta_outras', 'delivery_nunca_veio', 'sumiu_60_dias', 'cozinha_similar')),
  tipo            text not null check (tipo in ('percentual', 'valor_fixo')),
  valor           numeric(10,2) not null check (valor > 0),  -- % da conta ou R$, conforme tipo
  teto            numeric(10,2) not null check (teto > 0),   -- gasto máximo da campanha, em R$
  status          text not null default 'ativa' check (status in ('ativa', 'encerrada', 'pausada')),
  data_janela     date not null,                             -- a PRIMEIRA ocorrência do dia_semana em que os benefícios valem
  semanas         smallint not null default 1 check (semanas between 1 and 4),  -- repete a janela por N semanas
  controle_pct    numeric(4,2) not null default 0 check (controle_pct between 0 and 50),  -- % dos elegíveis no grupo de controle
  pausada_em      timestamptz,
  motivo_pausa    text,
  criado_em       timestamptz not null default now(),
  check (hora_fim > hora_inicio),
  check (extract(dow from data_janela) = dia_semana)
);
create index campanhas_restaurante_idx on campanhas (restaurante_id, data_janela);

create table beneficios (
  id           uuid primary key default gen_random_uuid(),
  campanha_id  uuid not null references campanhas(id) on delete cascade,
  cliente_id   uuid not null references clientes(id) on delete cascade,
  codigo       char(4) not null,               -- 4 dígitos, único dentro da campanha
  valido_de    timestamptz not null,
  valido_ate   timestamptz not null,
  status       text not null default 'emitido' check (status in ('emitido', 'resgatado', 'expirado')),
  criado_em    timestamptz not null default now(),
  check (valido_ate > valido_de),
  unique (campanha_id, codigo)                -- também serve de índice por campanha
);
create index beneficios_cliente_idx  on beneficios (cliente_id, criado_em desc);  -- consulta do salão e dias_entre_ofertas
create index beneficios_criado_idx   on beneficios (criado_em);                   -- dias_entre_ofertas na emissão

create table resgates (
  id            uuid primary key default gen_random_uuid(),
  beneficio_id  uuid not null unique references beneficios(id) on delete cascade,  -- um resgate por benefício
  valor_conta   numeric(10,2) not null check (valor_conta >= 0),
  desconto      numeric(10,2) not null check (desconto >= 0),
  criado_em     timestamptz not null default now(),
  incremental   boolean not null default false,
  pessoas       smallint not null default 2 check (pessoas between 1 and 20)  -- pessoas na mesa: base das cadeiras recuperadas
);
create index resgates_criado_idx on resgates (criado_em);  -- consumo do teto_mes

-- Grupo de controle: elegíveis sorteados para NÃO receber o benefício. Comparar as visitas
-- deles com as de quem recebeu mede o efeito real da campanha (lift), não só a aproximação
-- de "incremental" do resgate.
create table controles (
  campanha_id  uuid not null references campanhas(id) on delete cascade,
  cliente_id   uuid not null references clientes(id) on delete cascade,
  primary key (campanha_id, cliente_id)
);

-- Leads da página de diagnóstico (restaurantes interessados). Contato do dono, não de cliente final.
create table leads (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  nome        text not null,
  contato     text not null,
  diagnostico jsonb not null
);

-- Kit de ativação: textos para a equipe divulgar a campanha. Gerado uma vez, na aprovação.
-- Só texto exibido; não toca em valor, teto, emissão nem resgate.
create table kits (
  id               uuid primary key default gen_random_uuid(),
  campanha_id      uuid not null unique references campanhas(id) on delete cascade,  -- um kit por campanha
  script_garcom    text not null,
  mensagem_equipe  text not null,
  cartaz_titulo    text not null,
  cartaz_linha     text not null,
  modelo           text,                      -- null = montado por template fixo
  criado_em        timestamptz not null default now(),
  entregue_em      timestamptz                -- † quando o dono copiou a mensagem para a equipe
);

-- Planejador de campanhas (IA). Só auditoria: campanhas não sabem quem as criou.
-- Um planejamento é um clique em "Gerar proposta"; cada chamada ao modelo é uma tentativa.
create table planejamentos (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid not null references restaurantes(id) on delete cascade,
  criado_em       timestamptz not null default now(),
  origem          text not null check (origem in ('modelo', 'fallback', 'nenhuma')),
  modelo          text,                       -- id do modelo chamado
  cardapio        jsonb,                      -- opções calculadas em código que o modelo recebeu; o editor fica restrito a elas
  proposta        jsonb,                      -- array de PropostaCampanha validadas (as alternativas)
  apresentacao    jsonb,                      -- {alternativas: [...], aprovada} ou {motivo}
  status          text not null default 'proposta'
                    check (status in ('proposta', 'aprovada', 'descartada', 'sem_proposta')),
  alternativa_aprovada smallint,              -- índice da alternativa escolhida
  proposta_aprovada    jsonb,                 -- a proposta que virou campanha, já revalidada
  editada              boolean,               -- o dono mudou algum campo antes de aprovar
  campanha_id     uuid references campanhas(id) on delete set null,
  decidido_em     timestamptz
);
create index planejamentos_restaurante_idx on planejamentos (restaurante_id, criado_em desc);

create table planejamento_tentativas (
  id               bigint generated always as identity primary key,
  planejamento_id  uuid not null references planejamentos(id) on delete cascade,
  numero           smallint not null,
  resposta         text,                      -- texto cru devolvido pelo modelo (ou erro da chamada)
  aprovada         boolean not null,
  erros            jsonb not null default '[]',
  ms               integer,
  criado_em        timestamptz not null default now(),
  unique (planejamento_id, numero)
);

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
alter table visitas      enable row level security;
alter table planejamentos enable row level security;
alter table kits enable row level security;
alter table controles enable row level security;
alter table leads enable row level security;
alter table planejamento_tentativas enable row level security;
alter table regras       enable row level security;

-- Resgate atômico e idempotente. Trava o benefício (toque duplo espera o primeiro
-- terminar e recebe o mesmo resgate), limita o desconto ao que sobra do teto da
-- campanha, grava o resgate, marca o benefício e registra a visita. O cálculo do
-- desconto e a classificação de incremental chegam prontos do código (lib/resgate.ts).
create function resgatar_beneficio(
  p_beneficio_id uuid,
  p_valor_conta  numeric,
  p_desconto     numeric,
  p_incremental  boolean,
  p_data         date,
  p_hora         smallint,
  p_pessoas      smallint default 2
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ben   beneficios%rowtype;
  v_camp  campanhas%rowtype;
  v_res   resgates%rowtype;
  v_gasto numeric;
begin
  select * into v_ben from beneficios where id = p_beneficio_id for update;
  if not found then
    raise exception 'beneficio_inexistente';
  end if;

  select * into v_res from resgates where beneficio_id = p_beneficio_id;
  if found then
    return to_jsonb(v_res) || jsonb_build_object('novo', false);
  end if;

  if v_ben.status <> 'emitido' then
    raise exception 'beneficio_indisponivel';
  end if;

  select * into v_camp from campanhas where id = v_ben.campanha_id for update;
  select coalesce(sum(r.desconto), 0) into v_gasto
    from resgates r join beneficios b on b.id = r.beneficio_id
   where b.campanha_id = v_camp.id;

  insert into resgates (beneficio_id, valor_conta, desconto, incremental, pessoas)
  values (p_beneficio_id, p_valor_conta,
          greatest(0, least(p_desconto, v_camp.teto - v_gasto)),
          p_incremental, greatest(1, least(coalesce(p_pessoas, 2), 20)))
  returning * into v_res;

  update beneficios set status = 'resgatado' where id = p_beneficio_id;

  insert into visitas (restaurante_id, cliente_id, data, hora)
  values (v_camp.restaurante_id, v_ben.cliente_id, p_data, p_hora);

  update clientes
     set visitas = visitas + 1,
         ultima_visita = greatest(coalesce(ultima_visita, p_data), p_data)
   where id = v_ben.cliente_id;

  return to_jsonb(v_res) || jsonb_build_object('novo', true);
end;
$$;

revoke execute on function resgatar_beneficio(uuid, numeric, numeric, boolean, date, smallint, smallint) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function resgatar_beneficio(uuid, numeric, numeric, boolean, date, smallint, smallint) from anon, authenticated;
    grant  execute on function resgatar_beneficio(uuid, numeric, numeric, boolean, date, smallint, smallint) to service_role;
  end if;
end $$;

-- Faz a API do Supabase enxergar a função e as tabelas novas na hora.
notify pgrst, 'reload schema';
