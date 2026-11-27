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
"Sou o dono" (`/dono`) e "Sou o salão" (`/salao`), sob o rótulo "Restaurante
de demonstração · Cantina do Bairro". Abaixo, separado, um bloco para outros
restaurantes ("Tem um restaurante e quer usar o Mesa Cheia?") leva à página de
captação (`/diagnostico`), que tem "Ver a demonstração" de volta.

A demo usa um único restaurante, "Cantina do Bairro" (italiana, 64 lugares,
ticket médio R$ 78, terça a domingo, 11h–15h e 18h–23h), com id fixo
`RESTAURANTE_DEMO_ID` em `lib/dominio.ts`.

## Estado atual

Feito: schema, seed (`POST /api/reset`), grade de ocupação, criação de
campanha por formulário com emissão de benefícios, tela do salão (consulta por
telefone e resgate), resultado por campanha, painel "Telefones de teste",
editor de regras, planejador de campanhas com IA (três alternativas, editor
restrito ao cardápio, prévia ao vivo), kit de ativação gerado por IA, métricas
de incremental × canibalizado, grupo de controle (efeito medido), projeção de
retorno antes de aprovar, segmento "Pede italiana em outros restaurantes e nunca veio" (`cozinha_similar`) (clientes iFood de
outros restaurantes, anônimos para o restaurante), campanhas de 1 a 4 semanas com
pausa automática por ocupação, cadeiras-hora recuperadas e a página pública de
diagnóstico para captar restaurantes novos (`/diagnostico`, grava em `leads`).

A IA entra em dois pontos, e nos dois só escolhe ou escreve:
1. Planejador: escolhe alternativas dentro de um cardápio calculado em código.
   Ao aprovar, a proposta vai para `criarCampanha`, como o formulário.
2. Kit de ativação: escreve texto (script do garçom, mensagem da equipe,
   cartaz). Nunca número, nunca decisão de dinheiro.
Nada fora do planejador sabe quem criou a campanha.

## Stack

- Next.js 16 (App Router) + TypeScript, React 19. CSS puro em `app/globals.css`.
- Visual "black": só tema escuro. Cores em variáveis no topo de `globals.css`:
  `--vermelho` (#ff5a4e) para texto de destaque, `--vermelho-cheio` (#d92d20)
  com texto branco para botões e a célula mais vazia, tons escuros de vermelho
  para 30–50% de ocupação, cinzas para acima do mínimo, verde só para resultado
  bom. Fontes do Google Fonts no `layout.tsx`: Space Grotesk (títulos, números),
  Inter (texto), JetBrains Mono (telefones, códigos). Áreas de toque ≥ 44 px.
  Referência visual: canvas https://claude.ai/artifact/RRqWUYvcyMKsoQt6jxycQn
- Supabase (Postgres) via `@supabase/supabase-js`, só no servidor.
- Deploy na Vercel.
- Modelo de linguagem, em `lib/llm.ts`: Groq (padrão da demo, gratuito com
  limite) e xAI (Grok), ambos no formato da OpenAI, ou Gemini. Ordem sem
  `LLM_PROVEDOR`: Groq, xAI, Gemini, o primeiro que tiver chave. O provedor não
  muda nenhuma regra, validação ou fallback. Groq/xAI pedem
  `response_format: json_object`; se o modelo recusar (HTTP 400), pede de novo
  sem ele.
- Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e uma
  chave de modelo: `GROQ_API_KEY`, opcional `GROQ_MODEL` (padrão
  `openai/gpt-oss-120b`); ou `XAI_API_KEY` (ou `GROK_API_KEY`), opcional
  `XAI_MODEL` (padrão `grok-4.6`); ou `GEMINI_API_KEY` (ou
  `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`), opcional `GEMINI_MODEL`
  (padrão `gemini-3.5-flash-lite`). Ver `.env.example`. `GROQ_API_URL`,
  `XAI_API_URL` e `GEMINI_API_URL` existem só para apontar a servidores falsos
  em teste local.

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
  dono/page.tsx          painel do dono em abas (?aba=hoje|campanhas|configurar|demo):
                         Hoje = destaque + planejador + grade clicável; Campanhas = kits +
                         cartões de resultado; Configurar = campanha manual + regras
                         (?dia=&inicio=&fim= vem do clique na grade); Demo = telefones + registro
  salao/page.tsx         teclado do salão
  api/reset/route.ts     POST: apaga tudo e popula de novo
  api/ocupacao/route.ts  GET: médias por dia da semana × hora
  api/segmentos/route.ts GET: contagem por segmento + contexto da janela
  api/campanhas/route.ts POST: PropostaCampanha → valida, grava, emite
  api/salao/consultar    POST {telefone}: ativo | nenhum | resgatado
  api/salao/aplicar      POST {beneficio_id, valor_conta}: resgate idempotente
  api/janelas            GET: janelas candidatas cruas + cardápio enviado ao modelo
  api/planejador         GET: registro de auditoria · POST: gera proposta
  api/planejador/[id]/previa     POST {proposta}: revalida, devolve elegíveis/custo/saldo/bloqueios
  api/planejador/[id]/aprovar    POST {indice, proposta?}: revalida e chama criarCampanha
  api/planejador/[id]/descartar  POST
  api/planejador/diagnostico     GET: qual variável de chave existe + chamada de teste
  api/kits/[campanhaId]/entregue POST: dono copiou a mensagem da equipe
  api/kits/[campanhaId]/escrever POST: o modelo escreve o kit (requisição própria)
  api/regras             GET / PATCH
  api/ocupacao/registrar POST {data, hora, pessoas}: o que um caixa enviaria; confere pausas
  api/campanhas/[id]/simular-cheia  POST (DEMO): 85% na 1ª ocorrência, para mostrar a pausa
  api/leads              POST: restaurante interessado (diagnóstico recalculado no servidor)
  api/oferta/[token]/confirmar  POST: cliente garante a mesa (guarda a vaga)
  oferta/[token]/page.tsx       o que o cliente vê pelo link da oferta
  diagnostico/page.tsx   página pública de diagnóstico para restaurantes novos
components/
  BotaoResetar.tsx, FormCampanha.tsx, Salao.tsx, Planejador.tsx, FormRegras.tsx,
  KitAtivacao.tsx, BotaoSimularCheia.tsx, Diagnostico.tsx,
  CopiarTelefone.tsx, BotaoGarantir.tsx   componentes de cliente
  Info.tsx               ícone "i" com explicação (sem estado)
  Projecao.tsx           quadro de retorno esperado (sem estado)
  Tentativas.tsx         lista de tentativas do modelo (sem estado)
  Marca.tsx              logo (server)
lib/
  supabase/server.ts     cliente com service_role ("server-only")
  dados.ts               leituras no banco, paginar() ("server-only")
  emissao.ts             criarCampanha, contextoDaJanela ("server-only")
  resgate.ts             consultarTelefone, aplicarBeneficio ("server-only")
  painel.ts              resultado por campanha, telefones de teste ("server-only")
  campanha.ts            PropostaCampanha, regras, desconto, códigos (puro)
  janelas.ts             janelas candidatas (puro)
  planejador-regras.ts   cardápio, validação da saída do modelo, regra fixa (puro)
  planejador.ts          gerar/aprovar/descartar/listar ("server-only")
  llm.ts                 gerarJson para Groq, Grok ou Gemini, diagnóstico ("server-only")
  kit-regras.ts          validação e template do kit, conferência de números (puro)
  kit.ts                 gravarKitTemplate, escreverKitComModelo, carregarKits,
                         marcarKitEntregue ("server-only")
  vagas.ts               situacaoTeto, guardarVaga ("server-only")
  oferta.ts              carregarOferta, confirmarOferta ("server-only")
  copiar.ts              copiar para a área de transferência (navegador)
  numero.ts              lerNumeroBR, formatarNumeroBR, lerCampoNumero (puro)
  projecao.ts            taxas por segmento e projeção de retorno (puro)
  controle.ts            sorteio e medição do grupo de controle (puro)
  diagnostico.ts         conta da página de diagnóstico (puro)
  pausa.ts               verificarPausas, registrarOcupacao, simular ("server-only")
  leads.ts               salvarLead ("server-only")
  seed-historico.ts      campanhas antigas com resgates e controle (puro)
  segmentos.ts           segmentos e visitouNaJanela (puro)
  resultados.ts          métricas por campanha (puro)
  ocupacao.ts            cálculo da grade (puro)
  dominio.ts             constantes, datas, fuso, formatação (puro)
  telefone.ts            normalizar e mascarar telefone (puro, roda no navegador)
  hash.ts                hashTelefone (node:crypto)
  seed.ts                gerador determinístico dos dados da demo
  erros.ts               erro → status HTTP
scripts/check-seed.ts
scripts/check-numero.ts  npm run test:numero
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
  com DDI (`5511987654321`), via `hashTelefone` em `lib/hash.ts`; use a mesma
  função para buscar. Só os 4 últimos dígitos ficam em `telefone_final`, para
  exibir mascarado. Em produção, troque por HMAC com segredo: telefone
  brasileiro tem poucas combinações e sha256 puro é reversível por força bruta.
- **Uma porta de entrada para campanha.** `criarCampanha(entrada)` em
  `lib/emissao.ts` recebe um objeto desconhecido, converte com `lerProposta`,
  valida com `validarProposta` e emite. Formulário e planejador chamam a mesma
  função (via `POST /api/campanhas` ou direto no servidor). Não existe coluna
  de origem e nenhum código pode ramificar por criador.
- **Regras de campanha** (todas bloqueiam e nada é gravado):
  janela dentro do horário de funcionamento; `percentual` ≤ `desconto_max`;
  `valor_fixo` ≤ `desconto_max`% do ticket médio; ocupação média da janela
  abaixo de `ocupacao_min`; `teto` da campanha ≤ teto mensal restante;
  pelo menos um cliente elegível. `dias_entre_ofertas` tira do lote quem
  recebeu oferta recente; se tirar todos, bloqueia.
- **Teto mensal comprometido** (`comprometidoNoMes`): no mês de `data_janela`,
  campanha com janela ainda aberta reserva o `teto` inteiro; campanha
  encerrada conta só o que gastou.
- **Segmentos** (`lib/segmentos.ts`), em relação à janela, sem sobreposição:
  `frequenta_janela` = visita nos últimos 60 dias naquele dia da semana e faixa
  de hora; `frequenta_outras` = visita nos últimos 60 dias, nenhuma na janela;
  `sumiu_60_dias` = tem visitas, nenhuma nos últimos 60 dias;
  `delivery_nunca_veio` = origem delivery e nenhuma visita.
- **Incremental** = `!visitouNaJanela(...)`, a mesma função do segmento
  `frequenta_janela`. Calculado no resgate e gravado em `resgates.incremental`;
  nunca recalcular depois.
- **Desconto no resgate** (`calcularDesconto`): nominal do benefício, limitado
  a `desconto_max`% da conta e ao que resta do teto da campanha. A função SQL
  `resgatar_beneficio` aplica de novo o limite do teto, com trava na campanha.
- **Limite por conta** (`campanhas.limite_por_conta`, só para %): "20% de desconto,
  até R$ 30". `calcularDesconto` aplica o menor entre o %, o limite, `desconto_max`%
  da conta e o que a mesa pode levar do teto (`limitadoPor: "limite"`).
  `textoBeneficio(tipo, valor, limite)` escreve o limite. O planejador escolhe de
  `LIMITES_POR_CONTA` (lista fechada; `limites_por_conta` no cardápio; cardápio
  antigo: só null); a regra fixa usa o menor limite que cobre o dobro do desconto numa
  conta média. O kit pode citar "R$ limite" além do %.
- **Vagas do teto** (lib/vagas.ts, `valorDaVaga`, `vagasDoTeto`). Cada vaga separa do
  teto o desconto máximo de uma mesa: valor fixo = o valor; % com limite = o limite;
  % sem limite = desconto numa conta de ticket médio (não garante conta grande; a
  tela sugere o limite). Vaga é guardada (`beneficios.reserva_ate`,
  `reserva_origem`) quando o cliente confirma na página da oferta
  (`/oferta/[token]`, `confirmacao`) ou quando o salão consulta o telefone
  (`chegada`). Quem tem vaga guardada nunca fica sem desconto; quem não tem pega uma
  livre ou recebe `nenhum` com `motivo: "sem_vaga"` (fala `FALA_SEM_VAGA`). A função
  SQL `reservar_beneficio` trava a campanha: duas pessoas nunca pegam a mesma
  última vaga. A vaga vale até o fim da próxima ocorrência
  (`fimDaProximaOcorrencia`); não usada, volta ao teto (expiração preguiçosa, por
  `reserva_ate > now()`). O que uma mesa pode levar no resgate = teto − gasto −
  vagas guardadas por outras × valor da vaga.
  **Teto acabou, campanha para** (`tetoEsgotado`): quando o gasto não deixa nenhuma
  vaga e ninguém tem vaga guardada, a campanha vira `pausada` ("O teto de R$ X
  acabou") e os benefícios `emitido` expiram (`encerrarPorTeto`). Confere-se no
  resgate, na consulta sem vaga e em `verificarPausas`.
  O cartão mostra "Ofertas enviadas" e "N vagas de até R$ X: usadas, garantidas,
  livres". A projeção usa o mesmo valor de vaga (`cabeNoTeto`, `valorVaga`).
- **Página da oferta** (`/oferta/[token]`, lib/oferta.ts): o que o cliente recebe
  pela mensagem. Token aleatório do benefício (`beneficios.token`, 32 hex), nunca o
  telefone; sem nome nem dado do cliente; `noindex`. Estados: disponível (vagas
  livres + "Garantir minha mesa"), garantida, esgotada, usada, encerrada. Na demo, o
  painel "Telefones de teste" tem "ver a oferta que ele recebeu". A mensagem da
  equipe manda digitar o telefone quando o cliente senta (guarda a vaga) e de novo na
  conta.
- **Resgate idempotente.** `resgatar_beneficio` trava a linha do benefício;
  se já existe resgate, devolve o mesmo com `novo: false`. `resgates.beneficio_id`
  é único como segunda barreira. O cliente pode reenviar à vontade.
- **Validade do benefício**: a janela da campanha na próxima ocorrência do
  dia (`proximaJanela`): hoje, se a janela ainda não terminou, senão na
  semana seguinte. `DEMO_ACEITA_ANTES_DA_JANELA = true` em `lib/campanha.ts`
  deixa resgatar antes de `valido_de` para a apresentação funcionar em
  qualquer dia; depois de `valido_ate` sempre recusa. Em produção, `false`.
- **Expiração** é preguiçosa: `expirarVencidos()` roda nas leituras do painel
  e do salão e marca `emitido` vencido como `expirado`.
- **Salão** tem três respostas e só três: `ativo`, `nenhum`, `resgatado`.
  Telefone que não existe no banco é `nenhum`, igual a cliente sem benefício.
  Telefone sempre mascarado (`mascararTelefone`, formato `(11) 9••••-••41`).
  O telefone viaja em corpo de POST, nunca em URL.
  Além do teclado, o salão aceita telefone colado (botão "Colar telefone" ou
  Ctrl+V) e teclado físico; tira o 55 do país. Os telefones de teste têm botão
  de copiar. Copiar e colar é o caminho da demo, já que URL com telefone é proibida.
- **Telefones de teste** (painel do dono) são regenerados do seed em memória
  (`gerarClientesCompletos`); o banco continua só com hash e 4 últimos
  dígitos. Os telefones do seed não dependem da data.
- **Planejador (IA).** A IA não calcula número e não decide dinheiro.
  1. Código calcula as janelas candidatas (`calcularCandidatas`): de 1h a 3h,
     em passos de 30 min, sem os primeiros e últimos 30 min de cada turno,
     toda meia hora abaixo de `ocupacao_min`, ordenadas por cadeiras-hora
     vazias absolutas. Vão ao modelo 12, escolhidas por `espalharPorDia`
     (rodízio entre os dias, para terça não tomar a lista e quarta aparecer). O
     editor mostra os dias como botões e as janelas do dia embaixo; dia sem
     janela de 1h abaixo do mínimo não aparece (use o formulário manual).
  2. Código monta o cardápio (`montarCardapio`): por janela, elegíveis por
     segmento, saldo do teto do mês e tetos permitidos (`opcoesTeto`: de R$ 50
     em R$ 50 até o saldo); valores permitidos por tipo (`opcoesValor`, todos
     ≤ `desconto_max`).
  3. O modelo devolve um array de 3 alternativas no contrato (`aposta`,
     `dia_semana` "terca", `hora_inicio` "18:30", `tipo` "desconto_percentual" |
     "desconto_valor", `valor`, `clientes_alvo`, `custo_maximo`,
     `justificativa`), diferindo em janela ou segmento.
  4. `validarAlternativas` confere cada uma sozinha (formato + `validarContraCardapio`).
     O campo `segmento` aceita o código ou o nome exato do segmento (`lerSegmento`,
     sem acento nem caixa): o modelo às vezes copia o nome que a justificativa
     exige. Qualquer outro texto reprova;
     duplicadas em janela+segmento são descartadas; as que sobram passam por
     `avaliarProposta`. Basta uma sobrar para a tentativa valer. Nenhuma: chama
     de novo com os erros, até 3 vezes. Depois, `propostaFallback`: janela com
     mais cadeiras vazias, segmento com mais elegíveis, 10% (ou o máximo
     permitido, se menor), metade do saldo do mês como teto. `origem` = `fallback`.
  5. Cada tentativa vai para `planejamento_tentativas` (resposta crua, passou,
     erros, inclusive das alternativas descartadas). O cardápio fica gravado em
     `planejamentos.cardapio`. Só um planejamento aguarda decisão por vez.
  6. O dono seleciona uma alternativa e pode editá-la; cada campo é lista
     fechada do cardápio gravado (trocar a janela recarrega segmento e teto).
     A prévia (`previaPlanejamento`) e a aprovação (`aprovarPlanejamento`)
     passam pela mesma `revalidar`: **a proposta do navegador é entrada não
     confiável**, relida com `lerProposta`, conferida contra o cardápio DAQUELE
     planejamento e contra `avaliarProposta`. Nada entra porque o cliente disse
     que é válido. Se bloquear, a proposta volta a aguardar decisão.
  O formulário manual NÃO tem restrição de cardápio, de propósito: quem quer
  campanha em janela cheia usa ele. O editor é restrito porque existe para
  fazer yield.
  **Gerar outras não repete.** Sem temperatura (a linha 3.5 do Gemini não
  aceita; no Groq/Grok não usamos), a mesma entrada dá a mesma saída. `propostasRecentes` lê as
  alternativas das últimas 3 gerações; elas vão ao modelo em
  `propostas_ja_mostradas`, e uma alternativa com a mesma janela + segmento
  (`chaveCombo`) de uma delas é descartada com o motivo. A regra fixa também
  pula as já mostradas e deixa `frequenta_janela` por último (só canibaliza).
  Passadas 3 gerações, as combinações podem voltar.
  **Justificativa específica.** O cardápio leva `segmentos_fatos` (taxa de
  resgate e fonte, efeito medido contra controle, observação; para a região,
  pedidos médios e distância). `conferirJustificativa` reprova texto com menos
  de 2 números, número que não está na entrada (tolerância de 0,5) ou código de
  segmento no lugar do nome. Cada alternativa ganha `fatos` e `projecao`
  calculados em código, mostrados no cartão acima do texto do modelo.
  O modelo só é chamado no POST de "Gerar proposta", nunca ao carregar página.
  Sem chave, a tentativa registra o erro e vai direto à regra fixa
  (`provedorConfigurado` em lib/llm.ts decide provedor e variável).
  `GET /api/planejador/diagnostico` mostra provedor, qual variável o deploy
  enxerga (só o nome), os modelos que a chave lista e faz uma chamada mínima,
  com o erro exato se falhar. A resposta do planejador é o objeto
  `{"propostas": [...]}` (o modo JSON do formato OpenAI só devolve objeto);
  `validarAlternativas` aceita também o array puro.
  **Limites do plano gratuito.** O Groq gratuito tem 8.000 tokens por minuto.
  Ao modelo vai `cardapioParaModelo` (tetos como intervalo `custo_maximo_de`/
  `custo_maximo_ate`, elegíveis como mapa; ~35% menor); a validação usa o
  cardápio completo. Para `openai/gpt-oss` no Groq: `reasoning_effort: low` e
  `max_completion_tokens: 2000`. HTTP 429 com espera de até 20 s (cabeçalho
  Retry-After ou "try again in Xs") espera e repete uma vez (`pedirComEspera`);
  senão vira `LimiteError`, com mensagem legível e sem o id da organização. O
  planejador para no primeiro `LimiteError` (as tentativas 2 e 3 no mesmo minuto
  cairiam no limite e gastariam mais tokens) e vai à regra fixa; o selo diz
  "o limite por minuto do modelo acabou", não "reprovado na validação".
- **Kit de ativação (IA, só texto).** Duas etapas, em requisições separadas.
  `criarCampanha`, depois de emitir, grava só o texto fixo do público
  (`gravarKitTemplate`, sem modelo), para que aprovar uma proposta gaste uma
  chamada só e o limite por minuto do Groq gratuito não derrube proposta e kit
  juntos. O texto do modelo vem de `POST /api/kits/[id]/escrever`
  (`escreverKitComModelo`), disparado pelo botão "Escrever com IA" no kit; se
  passar na validação, substitui o texto atual, senão o atual fica e a tela mostra
  o motivo. Nunca no carregamento de página. Validação (`validarKit`): 4 campos de texto não
  vazios, `script_garcom` ≤ 45 palavras, `cartaz_titulo` ≤ 6 palavras, e
  `conferirNumeros`: todo "N%" ou "R$ N" escrito tem de ser o benefício da
  campanha (o garçom lê em voz alta); e `conferirEspecifico`: nenhuma frase de
  `FRASES_GENERICAS` ("benefício da casa", "aproveite"...), a mensagem da equipe
  cita o dia e a hora de início, e nenhum marcador (`{nome}` incluído): o script não
  diz o nome do cliente, porque na mesa pode haver quem não recebeu oferta
  (`publico.usar_nome` é sempre false). Só alguns clientes têm desconto, então nada
  pode soar como "para todos": o script não pede telefone (é lido depois que a tela
  confirmou o benefício) e tem uma marca pessoal ("sua conta tem", "você recebeu");
  `FRASES_PARA_TODOS` ("automaticamente", "todo mundo"...) reprova; o cartaz, que
  todas as mesas leem, não cita valor e fala com quem "recebeu" a mensagem; a
  mensagem da equipe diz que só quem recebeu tem desconto. A entrada leva
  `publico` (`publicoDoSegmento`: quem é o cliente e como falar com ele), montada
  por `entradaKit`. Kits antigos com `{nome}` ainda são trocados pelo primeiro nome
  (`aplicarNome`, no servidor). Para `nenhum` e `resgatado`, o salão mostra uma
  fala fixa em código (`FALA_SEM_BENEFICIO`, `falaJaUsado`), para o cliente sem
  oferta não se sentir passado para trás. O template também é por público. Falhou: mais uma tentativa com os erros;
  falhou de novo: fica o texto que já estava. HTTP 429 ou falta de chave param na
  hora, sem segunda tentativa. A campanha nunca quebra por causa do kit. Nome e cozinha do restaurante entram
  no prompt como dados não confiáveis; a saída só é exibida, não toca valor,
  teto, emissão nem resgate. O salão mostra o `script_garcom` acima do Aplicar
  ("O que dizer ao cliente"). Kit "entregue" = o dono copiou a mensagem da
  equipe (`kits.entregue_em`); a métrica "X de Y" no painel conta isso.
- **Números digitados** passam sempre por `lerNumeroBR` (lib/numero.ts):
  com vírgula, pontos são milhar e a vírgula é decimal; sem vírgula, pontos
  em grupos de três são milhar ("2.000" = 2000). Nenhum componente faz parsing
  próprio. Ao sair do campo, o valor é reformatado ("2.400,00"). No servidor,
  `lerCampoNumero`; NaN é recusado com mensagem própria.
- **Incremental × canibalizado** (`resumirCampanha`): `resgatesCanibalizados`
  = resgates com `incremental = false`; `custoCanibalizado` = soma dos
  descontos deles; `percentualIncremental` = incrementais / resgatados. O
  painel pinta o canibalizado de alerta acima de 40% do custo
  (`canibalizadoEmAlerta`).
- **Grupo de controle.** Na emissão, com 10 ou mais elegíveis, 20% são
  sorteados (`sortearControle`) para não receber; vão para `controles`.
  `medirControle` compara, nas ocorrências já passadas, a % de tratados com
  visita na janela contra a % do controle: `lift` em pontos e visitas causadas.
  É a medida do efeito real; `incremental` do resgate é a aproximação. Quem
  está no controle conta como "já teve oferta" para `dias_entre_ofertas`, para
  não contaminar a medição.
- **Projeção de retorno** (`projetar`, lib/projecao.ts): taxa de resgate e de
  incremental por segmento vêm das campanhas encerradas (`calcularTaxas`,
  mínimo de 20 emitidos / 3 resgates); sem isso, 8% de resgate e incremental
  pela definição do segmento (0 para `frequenta_janela`, 1 para os outros).
  A taxa vale para um desconto de referência: o desconto típico (R$ numa conta de
  ticket médio) das campanhas que formaram o histórico, ou 10% do ticket no padrão.
  Premissa de desconto: a taxa acompanha a raiz da razão entre o desconto proposto
  e o de referência (`ELASTICIDADE` 0,5; o dobro do desconto dá ~41% mais
  resgates), limitada entre metade e o dobro.
  Premissa de duração: a taxa acompanha a raiz da razão entre a duração da janela
  e a de referência (a do histórico, ou 2h), limitada entre metade e 1,5 vez.
  Premissa de semanas: cada semana extra soma metade da taxa, até dobrar.
  O teto corta: resgates = mín(procura, teto ÷ desconto típico), porque depois do
  teto o salão aplica desconto zero; a tela avisa quando o teto limita.
  Aparece na prévia do planejador e no formulário manual (mesma função).
- **Segmento `cozinha_similar`** = clientes `origem = 'regiao'`: pedem a mesma
  cozinha em outros restaurantes (2+ vezes em 60 dias, até 3 km) e nunca
  vieram. Dado da plataforma: o restaurante vê só contagens; na lista de
  benefícios aparecem como "Cliente da região (via iFood)" (`segmentoAnonimo`).
  O seed cria 214, gerados por último para não mudar os telefones da demo.
- **Duração e pausa.** `semanas` (1 a 4): `data_janela` é a primeira
  ocorrência; `valido_ate` é o fim da última (`ocorrencias`, `fimDaCampanha`).
  Fora da demo, o resgate só vale dentro de uma ocorrência
  (`dentroDeOcorrencia`). O teto inteiro conta no mês da primeira ocorrência.
  `motivoDePausa`: se uma ocorrência registrou ocupação média ≥ `ocupacao_min`
  (tabela `ocupacao`, alimentada por `/api/ocupacao/registrar`), a campanha
  vira `pausada` e os benefícios não usados expiram. `verificarPausas` roda ao
  carregar o painel e a cada registro.
- **Cadeiras-hora recuperadas** = soma de `resgates.pessoas` dos resgates
  incrementais × 1h30 (`PERMANENCIA_H`), nos últimos 30 dias, comparada às
  cadeiras-hora vazias. O salão pergunta quantas pessoas estão na mesa (padrão 2).
- **Diagnóstico de captação** (`/diagnostico`): abre com a promessa "Você só
  paga pelo cliente que nunca veio" (cobrança por cliente novo, medido contra o
  controle). Depois, o dono marca cada turno como
  cheio (90%), médio (60%) ou vazio (35%); a conta (`diagnosticar`) dá
  cadeiras-hora vazias por mês e quanto 5% de recuperação dos turnos vazios
  renderia. O interesse vai para `leads`, com o resultado recalculado no servidor.
- **Janelas em meia hora.** `hora_inicio`/`hora_fim` são números em horas com
  ,5 para meia hora (18.5 = 18h30); `timeDaHora`/`horaDoTime`/`formatarHora`
  convertem. Uma visita registrada na hora cheia h conta para a janela se a
  hora h–h+1 encosta nela.
- **Painel do dono (visual).** Topo em dois blocos: "O problema" (cadeiras-hora
  vazias em 30 dias, quantas nos horários abaixo do mínimo, `vaziasAbaixoMinimo30d`,
  e o dinheiro que não entrou nelas = vazias fracas ÷ 1h30 × ticket médio, um
  teto e não uma previsão) e "O que foi recuperado" (cadeiras-hora recuperadas,
  receita de clientes novos em 30 dias, barra até a meta de 5% das vazias dos
  horários fracos). Indicadores menores embaixo. Cartões de campanha com bloco
  "Dinheiro" (receita de clientes novos, desconto dado, soma das contas,
  quanto cada R$ 1 de desconto trouxe).
  Resultado de campanha em cartões: funil (emitidos → resgatados → clientes
  novos), barras recebeu × controle com o lift, custo por cliente novo em
  destaque; o resto em "Detalhes". Definições em ícones `Info` (tooltip por
  hover/foco), não em rodapé. Clicar numa célula da grade abre Configurar com a
  janela preenchida (`janelaDaCelula`: horas vizinhas abaixo do mínimo no mesmo
  turno). No planejador, a alternativa de menor custo projetado por cliente
  novo ganha o selo "melhor retorno".
- **Texto de interface curto e simples.** Uma frase por bloco, sem jargão
  ("público", não "segmento"; "clientes novos", não "incrementais"; "para quem já
  vinha", não "canibalizado"). Como a conta foi feita vai no ícone `Info`, não em
  parágrafo. O modelo e as premissas ficam na aba Demo e no CLAUDE.md.
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
| origem | text | `'delivery'` \| `'salao'` \| `'regiao'` (cliente iFood de outros restaurantes) |
| dia_habitual † | smallint null | janela habitual no salão |
| turno_habitual † | text null | `'almoco'` \| `'jantar'` |
| pedidos_delivery † | integer | |
| pedidos_cozinha_regiao † | integer | pedidos da mesma cozinha em outros restaurantes, 60 dias |
| distancia_km † | numeric null | |

Índices: `(restaurante_id, dia_habitual, turno_habitual)`,
`(restaurante_id, origem)`, `(restaurante_id, ultima_visita)`.

`visitas` e `ultima_visita` são atualizados pelo resgate.

### visitas †
| coluna | tipo | nota |
|---|---|---|
| id | bigint identity pk | |
| restaurante_id | uuid fk → restaurantes, cascade | |
| cliente_id | uuid fk → clientes, cascade | |
| data | date | |
| hora | smallint 0–23 | |

Índices: `(restaurante_id, data)`, `(cliente_id, data desc)`. Base dos
segmentos e de `incremental`. O seed grava cerca de 2.600 visitas coerentes
com `clientes.visitas` e `ultima_visita`; cada resgate grava mais uma.

Ocupação do seed: terça e quarta fracas; quinta e domingo com jantar fraco
(janelas de 18h30–20h e 21h–22h30 abaixo de 50%); sexta e sábado cheios. Assim o
planejador oferece quatro dias.

Seed: 60 de terça à noite, 120 de outras janelas (visita nos últimos 56 dias),
150 só delivery (`visitas = 0`, `ultima_visita` null), 70 sumidos (última
visita entre 61 e 240 dias atrás).

Histórico do seed (`lib/seed-historico.ts`): duas campanhas encerradas na
terça de 15 a 21 dias atrás, Ter 18h–23h. Uma para `delivery_nunca_veio`
(15%, 50 emitidos, 9 resgates incrementais, kit entregue) e outra para
`frequenta_janela` (10%, 30 emitidos, 10 resgates canibalizados, kit não
entregue). Quem resgatou ganha a visita daquele dia, como no resgate real; por
isso 9 clientes de delivery passam a contar em "já vem nesse horário". O painel
"Telefones de teste" lista também quem já usou o benefício, para mostrar a
resposta "já usado" no salão.

### campanhas
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| restaurante_id | uuid fk → restaurantes, cascade | |
| dia_semana | smallint 0–6 | igual ao dia de `data_janela` |
| hora_inicio | time | hora cheia ou meia hora |
| hora_fim | time | exclusiva, > hora_inicio |
| segmento | text | `frequenta_janela` \| `frequenta_outras` \| `delivery_nunca_veio` \| `sumiu_60_dias` |
| tipo | text | `percentual` (valor em %) \| `valor_fixo` (valor em R$) |
| valor | numeric(10,2) | > 0 |
| teto | numeric(10,2) | gasto máximo da campanha em descontos, R$ |
| limite_por_conta † | numeric(10,2) null | só %: desconto máximo numa conta, R$ |
| status | text | `ativa` \| `encerrada` \| `pausada` |
| data_janela † | date | primeira ocorrência |
| semanas † | smallint | 1 a 4 |
| controle_pct † | numeric | % sorteado para o controle (0 se < 10 elegíveis) |
| pausada_em †, motivo_pausa † | timestamptz, text | pausa automática |
| criado_em † | timestamptz | |

Índice: `(restaurante_id, data_janela)`.

### beneficios
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| campanha_id | uuid fk → campanhas, cascade | |
| cliente_id | uuid fk → clientes, cascade | |
| codigo | char(4) | 4 dígitos, único dentro da campanha |
| valido_de | timestamptz | |
| valido_ate | timestamptz | > valido_de |
| status | text | `'emitido'` \| `'resgatado'` \| `'expirado'` |
| criado_em † | timestamptz | para `dias_entre_ofertas` |
| token † | text unique | link da oferta, 32 hex aleatórios (default no banco) |
| reservado_em †, reserva_ate † | timestamptz null | vaga guardada e até quando vale |
| reserva_origem † | text null | `confirmacao` \| `chegada` |

Único `(campanha_id, codigo)`. Índices: `(cliente_id, criado_em desc)`
(consulta do salão), `criado_em` (dias_entre_ofertas). A busca no salão é por
`clientes.telefone_hash`, não pelo código.

### resgates
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| beneficio_id | uuid fk → beneficios, cascade, unique | um resgate por benefício |
| valor_conta | numeric(10,2) | |
| desconto | numeric(10,2) | |
| criado_em | timestamptz | default now() |
| incremental | boolean | a visita não teria acontecido sem o benefício |
| pessoas † | smallint | pessoas na mesa (1 a 20), base das cadeiras recuperadas |

Índice: `criado_em` (consumo do `teto_mes`).

### regras
| coluna | tipo | nota |
|---|---|---|
| restaurante_id | uuid pk, fk → restaurantes, cascade | |
| teto_mes | numeric(10,2) | R$ de desconto por mês; seed 1200 |
| desconto_max | numeric(5,2) | % da conta; seed 20 |
| dias_entre_ofertas | integer | seed 15 |
| ocupacao_min | numeric(5,2) | % da capacidade; abaixo disso a janela é "vazia"; seed 50 |

### planejamentos
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | um clique em "Gerar proposta" |
| restaurante_id | uuid fk → restaurantes, cascade | |
| criado_em | timestamptz | |
| origem | text | `modelo` \| `fallback` \| `nenhuma` |
| modelo | text null | id do modelo chamado |
| cardapio | jsonb null | opções calculadas que o modelo recebeu; o editor e a aprovação ficam restritos a elas |
| proposta | jsonb null | array das PropostaCampanha validadas (alternativas) |
| apresentacao | jsonb | `{alternativas: [...], aprovada}` ou `{motivo}` |
| status | text | `proposta` \| `aprovada` \| `descartada` \| `sem_proposta` |
| alternativa_aprovada | smallint null | índice da alternativa escolhida |
| proposta_aprovada | jsonb null | a proposta que virou campanha, já revalidada |
| editada | boolean null | o dono mudou algum campo antes de aprovar |
| campanha_id | uuid null fk → campanhas, set null | só auditoria |
| decidido_em | timestamptz null | |

### planejamento_tentativas
| coluna | tipo | nota |
|---|---|---|
| id | bigint identity pk | |
| planejamento_id | uuid fk → planejamentos, cascade | |
| numero | smallint | 1 a 3; único por planejamento |
| resposta | text null | texto cru do modelo |
| aprovada | boolean | passou na validação |
| erros | jsonb | frases que reprovaram (voltam ao modelo) |
| ms | integer | duração da chamada |

### kits
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| campanha_id | uuid fk → campanhas, cascade, unique | um kit por campanha |
| script_garcom | text | ≤ 45 palavras |
| mensagem_equipe | text | |
| cartaz_titulo | text | ≤ 6 palavras |
| cartaz_linha | text | |
| modelo | text null | null = template fixo |
| criado_em | timestamptz | |
| entregue_em † | timestamptz null | quando o dono copiou a mensagem da equipe |

### controles †
`(campanha_id, cliente_id)` pk, fk com cascade. Sorteados para não receber.

### leads †
`id, criado_em, nome, contato, diagnostico jsonb` (entrada + resultado).
Contato do dono do restaurante interessado. Não é ligado a `restaurantes`.

### Função `reservar_beneficio`
`(p_beneficio_id, p_origem, p_reserva_ate, p_valor_vaga) → text`: trava a campanha,
confere teto − gasto − vagas guardadas × valor da vaga, guarda a vaga. Devolve
`reservado`, `ja_reservado`, `sem_vaga` ou `indisponivel`. Só `service_role`.

### Função `resgatar_beneficio`
`(p_beneficio_id, p_valor_conta, p_desconto, p_incremental, p_data, p_hora, p_pessoas) → jsonb`.
Trava o benefício, devolve o resgate existente se houver (`novo: false`),
senão trava a campanha, limita o desconto ao teto restante, grava o resgate,
marca o benefício como `resgatado`, grava a visita e atualiza o cliente.
Execução só para `service_role`.

## API

- `POST /api/reset` → `{ ok, hoje, restaurante, ocupacao, clientes, ms }`.
- `GET /api/ocupacao` → `{ restaurante, periodo: {de, ate}, dias, horas,
  celulas: [{ dia, hora, percentual, amostras }], cadeirasHoraVazias30d }`.
  Média de `pessoas / capacidade` por (dia da semana, hora) nos 60 dias que
  terminam ontem. Cadeiras-hora vazias = soma de `capacidade − pessoas` nas
  horas de funcionamento dos 30 dias que terminam ontem.
- `GET /api/segmentos?dia=2&inicio=18&fim=23` → contagem `{total, elegiveis}`
  por segmento, ocupação média da janela, teto restante do mês, validade.
- `POST /api/campanhas` com `PropostaCampanha` → 201 `{ok: true, campanhaId,
  emitidos, foraPorIntervalo, validade}` ou 422 `{ok: false, bloqueios:
  [{regra, mensagem}]}`.
- `POST /api/salao/consultar {telefone}` → `{tipo: "ativo" | "nenhum" | "resgatado", ...}`.
  Consultar é a chegada: guarda a vaga se houver (`reserva`); sem vaga, `nenhum`
  com `motivo: "sem_vaga"`.
- `POST /api/salao/aplicar {beneficio_id, valor_conta, pessoas}` → `{ok, novo,
  valorConta, desconto, aPagar, resgatadoEm}`; 409 se o benefício não está ativo.
