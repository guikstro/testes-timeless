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
MetaConnectionsService.connect()
  |
  v
enfileira job em "meta-sync" (BullMQ) — attempts: 5, backoff exponencial (5s)
  |
  v
(processo worker separado)
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

## Tratamento de erro e mapeamento de status

`MetaSyncService.handleSyncError` decide o status da conexão a partir do
tipo de erro devolvido pela Graph API:

| Erro da Meta                          | Status da conexão | Job re-lançado? |
|----------------------------------------|--------------------|-----------------|
| Código 190 (token inválido/expirado)   | `TOKEN_EXPIRED`    | Sim (BullMQ tenta de novo, mas continuará falhando até reconectar com token válido) |
| HTTP 429 ou código 4/17/32/613 (rate limit) | Status **não muda** | Sim (deixa o backoff resolver, sem marcar falha falsa) |
| Qualquer outro erro (rede, 5xx, etc.)  | `SYNC_FAILED`      | Sim |

Em todos os casos o erro é relançado após atualizar o status, para que o
BullMQ aplique o retry configurado (`attempts: 5`, backoff exponencial a
partir de 5s). A UI (`/integrations/meta`) mostra `lastSyncError` e um aviso
específico para pedir reconexão quando o status é `TOKEN_EXPIRED`.

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
- **Sem sincronização automática periódica (cron).** Hoje a sincronização só
  ocorre ao conectar ou por acionamento manual (`POST /sync`). Uma
  sincronização periódica (ex.: a cada N horas via `@nestjs/schedule` ou um
  repeatable job do BullMQ) é uma extensão natural, não implementada nesta
  fase por não estar no escopo mínimo do dashboard.

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
