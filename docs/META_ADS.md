# Integração com Meta Ads

> **Status: implementado (Fase 6).** Este documento descreve o comportamento
> real do código em `apps/api/src/integrations/meta/`,
> `apps/api/src/campaigns/` e
> `apps/api/src/worker/processors/meta-sync.*`. A fase seguinte, Meta
> Conversions API (`docs/META_CAPI.md`), também está implementada — reusa o
> `MetaConnection` construído aqui, com um segundo par de credenciais
> (Pixel ID + token do Conversions API) configurado à parte.

## Decisão: sem credenciais reais neste ambiente

Não há um Meta App revisado nem uma conta de anúncio real disponível para
homologar contra a Graph API de verdade. Em vez de mockar os métodos do
`MetaSyncService` (o que validaria só a lógica interna, não o contrato HTTP
real), a Fase 6 foi validada assim:

- **`MetaGraphClient`** (`meta-graph-client.ts`) é código real de produção:
  monta URLs, injeta `access_token` como query param, segue paginação via
  `paging.next` (uma URL completa que a própria Meta devolve — não
  reconstruída manualmente), e faz o parsing do envelope de erro real da
  Meta (`{ error: { code, message, error_subcode } }`) para `MetaApiError`.
- **`test/meta-ads.e2e-spec.ts`** sobe um servidor HTTP local
  (`http.createServer`, porta efêmera) que reproduz fielmente esses formatos
  de resposta — incluindo paginação de verdade (duas páginas de campanhas) e
  os dois erros documentados (token expirado código 190, rate limit código
  17/HTTP 429). `META_GRAPH_API_BASE_URL` torna a base URL do
  `MetaGraphClient` trocável em teste, sem nenhum mock de método.
- **Adicionalmente**, durante a validação manual desta fase, uma conta de
  anúncio (`act_999888777`) foi conectada com um token propositalmente
  inválido contra a Graph API **real** (`https://graph.facebook.com`) — o
  worker, rodando em Docker, recebeu o erro genuíno da Meta ("Invalid OAuth
  access token — Cannot parse access token"), classificou como
  `TOKEN_EXPIRED` e a UI exibiu a mensagem real. Isso confirma que o cliente
  HTTP e o tratamento de erro funcionam contra a API de verdade, não só
  contra o double local.

## Como a conexão funciona hoje

Mesmo padrão da Fase 3 (WhatsApp): não há handshake OAuth (exigiria um Meta
App revisado com permissão de anúncios). A organização informa manualmente
o `adAccountId` e um `accessToken` de sistema já gerados por ela na própria
plataforma da Meta:

```
Configurações → Integrações → Meta Ads
         |
         v
POST /api/integrations/meta/connect
{ adAccountId, accessToken }
         |
         v
upsert em MetaConnection (status=CONNECTED) + enfileira job "sync" imediato
```

- `accessToken` é sempre criptografado em repouso (AES-256-GCM,
  `EncryptionService`) — nunca fica em texto puro no banco, e a API nunca
  devolve o valor descriptografado (`getCurrent` sempre redige o campo,
  expondo só `hasAccessToken: true`).
- Reconectar (`connect` de novo) faz `upsert` pela mesma `organizationId`
  única — nunca cria uma segunda `MetaConnection`, e desconectar é só uma
  troca de status (`DISCONNECTED` + `disconnectedAt`, limpando o
  `lastSyncError`, porque o erro era da conexão que acabou de ser
  desligada), nunca um DELETE.
  Campanhas, ad sets, ads e histórico de gasto sincronizados nunca são
  apagados por desconectar.
- `POST /sync` dispara uma resincronização manual a qualquer momento
  (botão "Sincronizar agora" na UI).

## Como a sincronização funciona

```
MetaConnectionsService.connect()        ao conectar a conta
MetaConnectionsService.triggerSync()    POST /sync, botão "Sincronizar agora"
AgendaDeSincronia.enfileirarTodas()     sozinha, a cada 60 min por padrão
  |
  v
enfileira job "sync" em "meta-sync" (BullMQ), um por organização
  |
  v
(worker dentro do processo da API: WorkerModule, importado pelo AppModule)
MetaSyncProcessor -> MetaSyncService.sync(organizationId)
  |
  v
busca campanhas + ad sets + ads em paralelo (Promise.all)
  |
  v
upsert campanhas (organização + externalId) -> upsert ad sets (campanha +
externalId, achada num Map em memória para evitar N+1) -> upsert ads
(conjunto + externalId, mesma técnica)
  |
  v
busca os números dos últimos 7 dias, uma linha por anúncio e por dia
(level=ad): gasto, impressões, cliques e conversas iniciadas
  |
  +-> upsert AdInsight por (adId, date), só para anúncio conhecido
  +-> soma por campanha e dia -> upsert AdSpend por (campaignId, date)
  |
  v
lê a saúde da conta (status, teto, acumulado, saldo); se falhar, segue sem
  |
  v
status = CONNECTED, lastSyncedAt = agora, lastSyncError = null, e as colunas
de saúde com healthSyncedAt, quando a leitura deu certo
```

- **O worker roda dentro do processo da API**: o `WorkerModule` é importado
  pelo `AppModule`, e não existe mais processo worker separado (saíram o
  `worker/main.ts` e o `start:worker`; ver "Backend num processo só" em
  `contexct.md`). O motivo é o WhatsApp por QR Code: a conexão fica em
  memória, e um worker à parte abriria uma segunda conexão para o mesmo
  número. A fila continua no meio mesmo assim: quem conecta ou clica em
  "Sincronizar agora" só enfileira e já recebe a resposta, e a retentativa
  fica por conta do BullMQ.
- **A retentativa depende de quem enfileirou**: `connect()` e `POST /sync`
  usam `attempts: 5` com backoff exponencial a partir de 5s; a agenda usa
  `attempts: 3` a partir de 30s.
- **Hierarquia sempre completa a cada sync**: campanhas/ad sets/ads são
  poucos por organização na prática, então cada sincronização busca e faz
  upsert do conjunto inteiro — não há sincronização incremental de
  metadados. Só os insights de gasto usam uma janela (7 dias, constante
  `INSIGHTS_LOOKBACK_DAYS`), evitando reprocessar o histórico completo a
  cada execução (Seção 86: "incremental").
- **Gasto por anúncio e por campanha, na mesma chamada**: os números vêm no
  nível do anúncio (`level=ad`), e o total da campanha sai da soma dessas
  mesmas linhas. Antes vinham no nível da campanha, e o produto sabia qual
  criativo trouxe cada lead, mas não quanto ele custou. A Meta devolve
  `spend` como string decimal (`"750.00"`), convertida para centavos com
  `Math.round(Number(spend) * 100)`: nunca ponto flutuante persistido.
- **O total da campanha é somado da resposta, e não da tabela de anúncios**:
  várias linhas caem na mesma campanha e no mesmo dia, e gravar uma a uma
  faria o total virar o gasto do último anúncio do laço. A soma parte da
  resposta inteira porque a conta pode devolver gasto de anúncio que já não
  está na lista sincronizada, e somar só os anúncios conhecidos encolheria o
  total sem ninguém perceber. O detalhe por anúncio (`AdInsight`), esse sim,
  só é gravado para anúncio conhecido.
- **Conversas iniciadas**: vêm nas `actions` de cada linha, no tipo
  `onsite_conversion.messaging_conversation_started_7d`, o mesmo número da
  coluna "Conversas por mensagem iniciadas" do Gerenciador. Ficam ao lado da
  contagem do próprio produto de propósito: a diferença entre as duas é o
  que o produto existe para mostrar.
- **Saúde da conta na mesma rodada**: a sincronia lê também o objeto da
  conta de anúncios (`account_status`, `spend_cap`, `amount_spent`,
  `balance`, `name`, `currency`) e grava na própria `MetaConnection`, junto
  com `healthSyncedAt`. Fica guardada, e não buscada a cada abertura de
  tela, porque a tela não pode depender de uma chamada externa para
  desenhar; a tela Verba lê por `GET /api/integrations/meta/saude`. Um
  `spend_cap` igual a zero quer dizer sem teto na Meta, e vira `null` já na
  leitura (`normalizaRespostaDaConta`). Se a leitura falhar, a sincronia
  segue: sem o gasto a tela mente sobre números, sem a saúde ela só deixa de
  mostrar um aviso. As colunas ficam como estavam, e `healthSyncedAt`
  continua apontando para a última leitura que funcionou.
- **Ad sets/ads órfãos são ignorados, não adivinhados**: se a Meta devolver
  um ad set cujo `campaign_id` não corresponde a nenhuma campanha conhecida
  da organização, a linha é pulada silenciosamente em vez de criar um
  relacionamento incorreto ou falhar a sincronização inteira.

### Agenda automática

Antes da agenda, nada disparava a sincronização sozinho: o gasto só era
buscado ao conectar a conta ou ao clicar em "Sincronizar agora". Quem
conectava e não clicava em mais nada seguia vendo o custo por lead da época
em que conectou, sem nenhuma marca de que o número estava velho, o que é pior
do que não ter número nenhum.

`AgendaDeSincronia` (`apps/api/src/worker/agenda-de-sincronia.ts`) registra
no Redis, pelo BullMQ, um job repetido com id fixo `meta-sync-periodica` na
fila `meta-sync` (`META_SYNC_QUEUE`):

```
subida da API: AgendaDeSincronia.onApplicationBootstrap()
  |
  v  sem await
registraAgenda()
  -> upsertJobScheduler("meta-sync-periodica", { every: minutos * 60_000 })
  |
  v  a cada intervalo, o BullMQ cria o job
job "sincronizar-todas" na fila "meta-sync" (sem organização, attempts: 1)
  |
  v
MetaSyncProcessor -> AgendaDeSincronia.enfileirarTodas()
  |
  v
um job "sync" por conexão em CONNECTED ou SYNC_FAILED
(attempts: 3, backoff exponencial a partir de 30s)
  |
  v
MetaSyncService.sync(organizationId), o mesmo caminho do diagrama acima
```

- **De quanto em quanto tempo**: a cada 60 minutos por padrão. Quando a
  agenda ainda não existe no Redis, a primeira rodada sai na hora do
  registro; as seguintes contam o intervalo a partir dali, e não da virada
  do relógio.
- **Como ajustar**: pela variável `META_SYNC_INTERVAL_MINUTES`, em minutos,
  que já está no `.env.example` (no Render, nas variáveis de ambiente do
  serviço da API). O mínimo é 5, porque abaixo disso não é sincronizar, é
  martelar a API da Meta: um valor como `1` vira 5. Sem a variável, ou com
  um valor vazio, zero, negativo ou que não seja número, vale o padrão de 60;
  fração é truncada. A agenda é registrada com o valor lido na subida da
  API, então a mudança vale a partir do próximo início. Como o id é sempre o
  mesmo, a agenda nova substitui a antiga no Redis, e com o intervalo trocado
  a primeira rodada no ritmo novo sai na hora.
- **Por que a agenda vive no Redis, e não num `setInterval` do processo**:
  para sobreviver a reinício (reiniciar a API mantém a próxima rodada no
  mesmo horário, em vez de recomeçar a contagem) e não disparar em dobro
  quando houver dois processos da API no ar, cada um com o seu worker.
  Registrar de novo com o mesmo id substitui a agenda em vez de criar outra,
  e o próprio BullMQ garante uma execução só por intervalo. A contrapartida
  é depender do Redis para guardar a agenda (ver "Vigia", abaixo).
- **Registro sem `await` na subida**: `onApplicationBootstrap()` chama
  `registraAgenda()` com `void`, sem esperar. Com o Redis fora do ar, o
  BullMQ não devolve erro: fica esperando a conexão para sempre. E o Nest só
  abre a porta HTTP depois que os hooks de bootstrap terminam, então, com
  `await`, a API ficava no ar sem porta e o Render derrubava o deploy. Se o
  Redis responder com erro, a falha vai para o log
  (`agenda_de_sincronia_falhou`) e a API continua de pé.
- **Vigia**: o Redis de produção é o Key Value gratuito do Render, que não
  guarda nada em disco, e a Render pode reiniciá-lo a qualquer momento: ele
  volta vazio, e a agenda some junto, sem erro nenhum. Antes da vigia, ela
  só voltava na próxima subida da API, e até lá nada sincronizava sozinho.
  Agora, depois do registro da subida, `mantemAgenda`
  (`apps/api/src/worker/vigia-de-agenda.ts`) confere a cada 5 minutos se a
  agenda continua no Redis e a registra de novo quando ela some
  (`agenda_sumiu_do_redis` no log). Agenda recém-criada roda na hora, então
  a volta já cobre o intervalo perdido. A vigia só lê uma agenda viva, nunca
  registra por cima dela, e o relógio dela não sincroniza nada. Também é ela
  que refaz um registro que falhou na subida. A faxina diária usa a mesma
  vigia.
- **Um job por organização, e não um que percorre todas**: o job repetido
  não traz organização. Quando ele chega, o `MetaSyncProcessor` chama
  `enfileirarTodas()`, que enfileira um job `sync` para cada conexão. Assim
  a falha de um cliente não interrompe a sincronização dos outros, e cada um
  tem a própria retentativa. O job repetido em si roda com `attempts: 1`:
  repetir uma rodada que falhou não adianta, porque o próximo intervalo
  refaz o mesmo trabalho.
- **Quem entra na rodada**: conexões em `CONNECTED` e em `SYNC_FAILED`,
  porque falha passageira é justamente o que uma nova tentativa resolve.
  `TOKEN_EXPIRED` fica de fora de propósito: o acesso só volta quando alguém
  reconecta com um token válido, e insistir a cada intervalo com um token
  morto só rende chamada recusada. `DISCONNECTED` também fica de fora.
- **Sem sincronização empilhada**: o id de cada job junta a organização e o
  número do intervalo (`sync:<organizationId>:<intervalo>`). Enquanto o job
  de uma organização ainda estiver na fila, outro do mesmo intervalo não
  entra, e uma rodada atrasada não vira duas sincronizações empilhadas.
- **Como conferir**: na subida, a API escreve
  `agenda_de_sincronia_registrada` no log, com o intervalo em minutos, e cada
  rodada escreve `sincronia_periodica_enfileirada`, com quantas organizações
  entraram.

## Tratamento de erro e mapeamento de status

`MetaSyncService.handleSyncError` decide o status da conexão a partir do
tipo de erro devolvido pela Graph API:

| Erro da Meta                          | Status da conexão | Job re-lançado? |
|----------------------------------------|--------------------|-----------------|
| Código 190 (token inválido/expirado)   | `TOKEN_EXPIRED`    | Sim (BullMQ tenta de novo, mas continuará falhando até reconectar com token válido) |
| HTTP 429, código 4/17/32/613 ou 80000 a 80014 (limite de uso) | Status **não muda**; `lastSyncError` guarda o motivo e `limitadaAte` guarda até quando dura o bloqueio | **Não**: nada chama a Meta até `limitadaAte`, e uma única tentativa fica marcada para essa hora (ver "Limite de uso") |
| Qualquer outro erro (rede, 5xx, etc.)  | `SYNC_FAILED`      | Sim |

Nos outros casos o erro é relançado após atualizar o status, para que o
BullMQ aplique o retry configurado no job: `attempts: 5` com backoff
exponencial a partir de 5s quando ele vem de `connect()` ou `POST /sync`, e
`attempts: 3` a partir de 30s quando vem da agenda automática. A UI
(`/integrations/meta`) mostra `lastSyncError` e um aviso específico para
pedir reconexão quando o status é `TOKEN_EXPIRED`.

**Aviso no sino.** Quando a conexão passa de saudável para `TOKEN_EXPIRED`
("Meta Ads desconectou") ou para `SYNC_FAILED` ("Sincronização do Meta Ads
falhou", com a causa no texto), a organização recebe um aviso do tipo
`sistema.erro`. Só na passagem: se a conexão já estava quebrada, a falha
seguinte não avisa de novo, porque a sincronia roda de hora em hora e um
sino cheio do mesmo problema é um sino que ninguém lê. O limite de uso não
avisa. E o aviso nunca derruba a sincronia: `NotificationsService.notificar`
registra no log a própria falha em vez de lançar.

**Limite de uso.** Até 2026-09-30 o limite não gravava nada: uma conta
recém-conectada que batia nele ficava em "Conectado, última sincronização:
nunca", sem erro na tela, e parecia um erro no passo a passo do token. Agora:

- O motivo fica em `lastSyncError`, em português, com a mensagem da Meta
  entre parênteses. A tela de integração mostra como aviso, e a linha de
  frescor das telas de números diz o motivo.
- A Saúde da plataforma lista a conta como "limitada pela Meta", e também
  como "primeira sincronia não terminou" quando passam 15 minutos da conexão
  sem nenhuma sincronia completa.
- Para gastar menos do limite, as listas pedem 500 itens por página e os
  números por anúncio, 100. Sem `limit`, a Meta devolve 25, e cada página é
  uma chamada contada.
- No acesso limitado da API de Marketing, o padrão de todo app novo, a conta
  de anúncios tem teto de 60 pontos (cada leitura vale 1), o saldo se renova
  em 5 minutos, e quem estoura fica 5 minutos bloqueado (código 17, subcódigo
  2446079, "User request limit reached"). A saída definitiva é o acesso
  completo, pedido em developers.facebook.com no recurso Marketing API Access
  Tier ("+Upgrade"). A Meta exige pelo menos 500 chamadas bem-sucedidas nos
  últimos 15 dias e menos de 15% de erro nas últimas 500.

**Esperar o bloqueio, em vez de tentar dentro dele (2026-10-01).** Tentar
dentro do bloqueio só o renovava e contava como erro contra os 15%. Agora:

- O bloqueio grava `limitadaAte`: o que a Meta disser nos cabeçalhos
  (`X-Business-Use-Case-Usage`, em minutos, e `X-Ad-Account-Usage`, em
  segundos; vale o maior), nunca menos que os 5 minutos do bloqueio padrão,
  mais 1 minuto de folga (`limite-da-meta.ts`). O erro não é relançado, então
  o BullMQ não tenta de novo em segundos.
- Enquanto `limitadaAte` não passa, `MetaSyncService.sync` não chama a Meta,
  e a agenda de hora em hora pula a conta.
- O processador marca uma única tentativa para o fim do bloqueio
  (`sincronia-apos-limite`, com id pelo minuto, para dois bloqueios no mesmo
  minuto não virarem duas). Se ela também for bloqueada, não marca outra: a
  agenda de hora em hora assume, e o erro não vira laço.
- `POST /sync`, e reconectar a mesma conta, durante o bloqueio enfileiram a
  sincronia com atraso até `limitadaAte`; vários cliques viram um pedido só.
  Trocar de conta de anúncios começa sem o bloqueio da anterior.
- A tela de integração diz a que horas a Meta libera, e que não precisa
  clicar de novo.
- Uma sincronia completa limpa `limitadaAte` e `lastSyncError`.

### Correção de bug: job atrasado podia "ressuscitar" uma conexão desconectada

Durante a validação manual desta fase (conectar com um token inválido,
observar as tentativas reais contra a Graph API, depois desconectar), foi
identificada uma condição de corrida real: `disconnect()` só troca o status
para `DISCONNECTED` — nunca cancela jobs pendentes na fila `meta-sync`. Um
retry já enfileirado (por exemplo, a 5ª tentativa aguardando o backoff
exponencial) processava depois do usuário desconectar e sobrescrevia o
status de volta para `TOKEN_EXPIRED`/`CONNECTED`/`SYNC_FAILED`, desfazendo
silenciosamente a ação do usuário.

Corrigido em `MetaSyncService.sync()`: além do `if (!connection) return`
já existente (conexão apagada entre o enfileiramento e o processamento — não
ocorre na prática, já que `disconnect` nunca deleta, mas mantido por
segurança), agora também retorna cedo quando
`connection.status === "DISCONNECTED"`, para que nenhum job atrasado possa
reverter uma desconexão explícita. Coberto por teste em
`meta-sync.service.spec.ts`.

## Métricas de entrega na tela de campanhas (2026-10-01)

- A sincronia grava impressões e cliques no gasto da campanha
  (`ad_spend.impressoes` e `.cliques`, as colunas que o Google já usava),
  somados da resposta inteira, como o gasto. O objetivo de cada campanha
  vem na mesma chamada das campanhas (`campaigns.objetivo`).
- O desempenho por campanha devolve impressões, cliques, CTR, CPM, CPC e
  custo por conversa. Cada custo divide só o gasto dos dias que trouxeram o
  número de baixo. Os dias de antes desta mudança são completados pela soma
  dos anúncios da campanha (`ad_insights`).
- A tela deixa escolher as colunas (conjuntos prontos ou uma a uma, na URL)
  e sugere um conjunto pelo objetivo de onde está o investimento.

## Insights da Página do Facebook (2026-10-01)

Os números da tela de Insights da Página na Meta, guardados por dia em
`metricas_da_pagina` e mostrados no painel, na aba Página.

**O que é lido** (`insights-da-pagina.ts`), com os nomes de depois de junho
de 2026, quando a Meta aposentou boa parte das métricas antigas:
visualizações (`page_media_view`), visitas (`page_views_total`), interações
(`page_post_engagements`), seguidores novos e perdidos
(`page_daily_follows_unique`, `page_daily_unfollows_unique`), total de
seguidores (`page_follows`), vídeos de 3 segundos (`page_video_views`) e
tempo assistido (`page_video_view_time`, em milissegundos).

**Visualizadores únicos** não podem ser somados dia a dia, e a Meta não dá o
total de um período qualquer. São lidos em 7 e 28 dias
(`page_total_media_view_unique` com `period=week` e `days_28`) e a tela diz
a data da janela.

**Como configurar**

1. Em Configurações do negócio, Usuários do sistema, a Página entra nos
   ativos do usuário do sistema, com permissão de ver o desempenho.
2. O token desse usuário é gerado com `pages_show_list`,
   `pages_read_engagement` e `read_insights`, além de `ads_read`.
3. Em Integrações, Meta Ads, o id da Página (o `asset_id` do endereço do
   Business) vai na seção Página do Facebook.

**Como roda**

- `PUT /integrations/meta/pagina` escolhe, troca ou tira a Página e lê o
  histórico que cabe numa chamada (89 dias; o teto da Meta é 90).
  `POST /integrations/meta/pagina/sync` lê agora.
- A leitura usa o token da própria Página, que a Meta devolve em
  `GET /{pagina}?fields=access_token` quando o usuário do sistema tem a
  Página entre os ativos.
- A agenda de hora em hora lê os últimos três dias de cada Página
  (`sincronia-da-pagina`), porque a Meta continua acertando os números
  recentes. É outro limite de uso na Meta, então a leitura da Página não
  olha o bloqueio da conta de anúncios.
- Se a Meta recusar um nome de métrica, a leitura pede uma a uma e guarda as
  que vierem. Erro da Meta fica em `pagina_erro`, sem retentativa em
  segundos; erro de rede volta ao BullMQ.
- O valor diário chega marcado com o fim do dia no fuso da Página; o dia
  guardado é esse instante menos 12 horas (`diaDoValor`).

**Fora, por enquanto:** a divisão entre seguidores e não seguidores (a Meta
tem o recorte `is_from_followers`, ainda não lido) e o Instagram.

## Modelo de dados desta fase

```
MetaConnection  (1 por organização, organizationId único; guarda também a
                 saúde da conta e o Pixel e o token do Conversions API)
        |
        v
    Campaign  (organizationId + externalId único)
        |
        v
     AdSet  (campaignId + externalId único)
        |
        v
      Ad  (adSetId + externalId único)
        |
        v
  AdInsight  (adId + date único: spendCents, impressions, clicks,
              conversasIniciadas)

Campaign
   |
   v
 AdSpend  (campaignId + date único: spendCents, conversasIniciadas)
```

Os ids externos são únicos dentro do pai, e não no sistema inteiro. Eram
globais, e isso vazava entre clientes: registrar uma campanha à mão com um
id já usado revelava que outra organização o usava (e bloqueava quem
tentasse), e a sincronização, que casa a linha por esse campo, escreveria o
nome da campanha de um cliente dentro da linha de outro. O `AdSpend` tem
outras colunas (impressões, cliques, conversões na plataforma), preenchidas
pelo script do Google Ads; a sincronia da Meta grava só `spendCents` e
`conversasIniciadas`.

## Limitações conhecidas (deliberadas, não descuido)

- **Gasto por anúncio só para anúncio conhecido.** `AdInsight` só grava a
  linha de um anúncio que está na hierarquia sincronizada. Gasto de anúncio
  que a Meta devolve nos números, mas que não está na lista de anúncios,
  entra no total da campanha (`AdSpend`) e para por aí, então a soma dos
  anúncios pode ficar abaixo do total da campanha. Não há tabela de gasto
  por conjunto de anúncios.
- **Sem OAuth/App Review da Meta.** Conexão manual via `adAccountId` +
  `accessToken` de sistema, mesma decisão e mesmos motivos documentados em
  `docs/WHATSAPP.md`.
- **Sincronização de metadados sempre completa, nunca incremental** (só o
  gasto usa janela de datas) — aceitável para os volumes esperados de
  campanhas/ad sets/ads por organização.
- **A agenda automática não tenta token expirado.** Conexão em
  `TOKEN_EXPIRED` só volta a sincronizar depois que alguém reconecta com um
  token válido; até lá, o gasto fica parado na última sincronização que
  funcionou (ver "Agenda automática").

## Credenciais necessárias para homologação real

Já presentes em `.env.example`:

- `META_APP_ID`, `META_APP_SECRET`: necessários apenas se uma fase futura
  implementar OAuth de verdade (login com Facebook) em vez da conexão manual
  atual — não usados hoje.
- `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`: valores de exemplo para
  testes locais/seed — em produção, cada organização informa os seus
  próprios via a tela de conexão, não por variável de ambiente.
- `META_GRAPH_API_BASE_URL` (uso interno, não documentado no `.env.example`
  como credencial): permite apontar o `MetaGraphClient` para um servidor
  diferente do real da Meta — usado só pela suíte e2e para o double local.
