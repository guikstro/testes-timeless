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
  troca de status (`DISCONNECTED` + `disconnectedAt`), nunca um DELETE.
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
upsert campanhas (por externalId) -> upsert ad sets (linkados por campaignId
interno, via Map em memória — evita N+1) -> upsert ads (mesma técnica)
  |
  v
busca insights dos últimos 7 dias -> upsert AdSpend por (campaignId, date)
  |
  v
status = CONNECTED, lastSyncedAt = agora, lastSyncError = null
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
- **Gasto (`AdSpend.spendCents`)**: a Meta devolve `spend` como string
  decimal (`"750.00"`); a conversão para centavos é
  `Math.round(Number(spend) * 100)` — nunca ponto flutuante persistido.
- **Ad sets/ads órfãos são ignorados, não adivinhados**: se a Meta devolver
  um ad set cujo `campaign_id` não corresponde a nenhuma campanha desta
  sincronização, a linha é pulada silenciosamente em vez de criar um
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
  é que o registro só acontece na subida: se o Redis perder os dados com a
  API no ar, a agenda só volta na próxima subida da API.
- **Registro sem `await` na subida**: `onApplicationBootstrap()` chama
  `registraAgenda()` com `void`, sem esperar. Com o Redis fora do ar, o
  BullMQ não devolve erro: fica esperando a conexão para sempre. E o Nest só
  abre a porta HTTP depois que os hooks de bootstrap terminam, então, com
  `await`, a API ficava no ar sem porta e o Render derrubava o deploy. Se o
  Redis responder com erro, a falha vai para o log
  (`agenda_de_sincronia_falhou`) e a API continua de pé.
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
| HTTP 429, código 4/17/32/613 ou 80000 a 80014 (limite de uso) | Status **não muda**; `lastSyncError` guarda o motivo, que a tela mostra como aviso | Sim (a retentativa e a sincronia de hora em hora continuam; a próxima que der certo limpa o motivo) |
| Qualquer outro erro (rede, 5xx, etc.)  | `SYNC_FAILED`      | Sim |

Em todos os casos o erro é relançado após atualizar o status, para que o
BullMQ aplique o retry configurado no job: `attempts: 5` com backoff
exponencial a partir de 5s quando ele vem de `connect()` ou `POST /sync`, e
`attempts: 3` a partir de 30s quando vem da agenda automática. A UI
(`/integrations/meta`) mostra `lastSyncError` e um aviso específico para
pedir reconexão quando o status é `TOKEN_EXPIRED`.

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
- O app em modo de desenvolvimento tem limite baixo. A saída definitiva é o
  acesso padrão da API de Marketing (Ads Management Standard Access), pedido
  em developers.facebook.com, em Permissões e recursos.

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

## Modelo de dados desta fase

```
MetaConnection  (1 por organização, organizationId único)
        |
        v
    Campaign  (externalId único)
        |
        v
     AdSet  (externalId único, campaignId FK)
        |
        v
      Ad  (externalId único, adSetId FK)

Campaign
   |
   v
 AdSpend  (campaignId + date único, spendCents)
```

## Limitações conhecidas (deliberadas, não descuido)

- **Gasto só no nível de campanha.** `AdSpend` é agregado por campanha, não
  por ad set ou anúncio individual — suficiente para o dashboard desta fase
  (Seção 51). Gasto por ad set/anúncio fica para uma fase futura, sem exigir
  mudança de schema incompatível (bastaria um novo modelo `AdSetSpend`/
  `AdSpendByAd` seguindo o mesmo padrão de `@@unique`).
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
