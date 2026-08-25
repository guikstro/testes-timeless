# Meta Conversions API

> **Status: implementado (Fase 7 — última fase do escopo).** Este documento
> descreve o comportamento real do código em
> `apps/api/src/integrations/meta/conversion-events.*`,
> `apps/api/src/worker/processors/meta-conversion-send.*` e os pontos de
> disparo em `whatsapp-ingestion.service.ts`, `conversation-classifier.service.ts`
> e `leads.service.ts`. Reaproveita o `MetaConnection`/`MetaGraphClient`/
> `MetaApiError` já construídos na Fase 6 — ver [`docs/META_ADS.md`](META_ADS.md).

## Decisão: sem credenciais reais neste ambiente

Mesma decisão e mesmos motivos documentados em `docs/META_ADS.md`: não há um
Pixel real nem um token de sistema com permissão de Conversions API
disponível para homologar contra a Graph API de verdade. A Fase 7 foi
validada assim:

- **`test/meta-capi.e2e-spec.ts`** sobe o mesmo tipo de servidor HTTP local
  usado na Fase 6, mas simulando `POST /{pixel_id}/events` — capturando o
  corpo exato de cada evento enviado para afirmar sobre `event_name`,
  `event_id`, `user_data.ph` (hash) e `custom_data.value/currency` sem
  nenhum mock dos métodos do `MetaConversionSendService`. Cobre o caminho
  feliz (Lead, QualifiedLead, Purchase) e um pixel/token propositalmente
  rejeitado pela Meta (código 190).
- **Adicionalmente**, durante a validação manual desta fase (em Docker), uma
  conexão foi configurada com Pixel ID e token propositalmente inválidos
  contra a Graph API **real** (`https://graph.facebook.com`) — o worker
  recebeu o erro genuíno da Meta ("Invalid OAuth access token — Cannot parse
  access token") e o evento seguiu `PENDING → RETRYING → FAILED`
  corretamente, incluindo aguardar o backoff completo das 5 tentativas em
  tempo real (~75s) para confirmar que `FAILED` só acontece na última
  tentativa de verdade — foi essa mesma execução real que revelou o bug de
  `attemptsMade` descrito abaixo. Isso confirma que
  `MetaGraphClient.sendConversionEvent` funciona contra a API de verdade,
  não só contra o double local usado no e2e.

## Como a configuração funciona

Separada da conexão de anúncios da Fase 6 de propósito: o Pixel ID e o
token do Conversions API são um recurso/permissão diferente do acesso de
leitura à conta de anúncios, tipicamente configurados em um momento
diferente (às vezes por outra pessoa, no Meta Business Suite). Por isso é
um segundo passo, que **exige uma conexão de Meta Ads já existente**
(reflete a própria ordem mandatória das fases: Ads antes de Conversions
API):

```
Configurações → Integrações → Meta Ads → seção "Meta Conversions API"
         |
         v
POST /api/integrations/meta/capi/connect
{ pixelId, capiAccessToken }
         |
         v
requer MetaConnection existente (400 NOT_CONNECTED se não houver)
         |
         v
salva pixelId + capiAccessToken (criptografado) na mesma MetaConnection
         |
         v
drena (reenfileira) qualquer ConversionEvent PENDING ou FAILED desta organização
```

- `capiAccessToken` é sempre criptografado em repouso (mesmo
  `EncryptionService` da Fase 6) — a API nunca devolve o valor
  descriptografado (`hasCapiAccessToken: true` no lugar do token).
- Reconfigurar (chamar `connect` de novo) sobrescreve `pixelId`/token na
  mesma `MetaConnection` — nunca cria uma segunda conexão.

## O que dispara cada evento

| Evento Meta | Quando é registrado | Onde no código |
|---|---|---|
| `Lead` (padrão) | Um lead novo é criado (primeira mensagem de um número no WhatsApp) | `WhatsAppIngestionService.ingest()` |
| `QualifiedLead` (customizado) | Lead marcado como `QUALIFIED` — por gatilho automático ou correção manual | `ConversationClassifierService.markQualified()`, `markWon()` (qualificação implícita), `LeadsService.update()` |
| `Purchase` (padrão) | Uma venda (`Sale`) passa a ter um valor conhecido — na detecção automática, na criação manual, ou numa correção posterior | `ConversationClassifierService.markWon()`, `LeadsService.update()` (duas ramificações) |

`QualifiedLead` não é um evento padrão da Meta (a lista oficial não tem
equivalente de meio de funil) — em vez de forçar isso em um evento padrão
incompatível (proibido pelo espírito da Seção de mapeamento desta fase),
é enviado como evento customizado. A Meta aceita e exibe eventos
customizados no Gerenciador de Eventos normalmente, só sem os recursos de
otimização exclusivos dos eventos padrão.

### Nunca envia uma Purchase incompleta

Um `Sale` pode ser criado com `amountCents = null` (Fase 5: "nunca
adivinhar" um valor que a mensagem não deixou claro). `LeadsService`/
`ConversationClassifierService` só chamam `ConversionEventsService.recordPurchase`
quando um valor **já é conhecido** — nunca com `null`. Se o valor só é
descoberto depois, por correção manual (`PATCH /leads/:id`), é nesse
momento que a Purchase é registrada e enviada pela primeira vez. Uma
correção *posterior* a esse envio (ex.: valor errado corrigido de novo)
nunca reenvia — ver limitações conhecidas abaixo.

## Deduplicação (`event_id`)

Cada `ConversionEvent` é único por `(leadId, type)` — reforçado por
`@@unique([leadId, type])` no schema — e o `event_id` enviado para a Meta
é derivado deterministicamente disso (`buildMetaEventId`, formato
`<leadId>:<TYPE>`). Isso garante duas coisas ao mesmo tempo:

1. Um disparo duplicado do mesmo evento de domínio (ex.: uma correção
   chamando `recordPurchase` de novo) nunca cria uma segunda linha —
   `ConversionEventsService.record()` captura a violação de unicidade do
   Postgres e simplesmente não faz nada, em vez de reenviar.
2. Mesmo que isso falhasse, o `event_id` estável faz a própria Meta
   deduplicar o evento do lado dela.

## Estados e retry

```
PENDING --(sucesso)--> SENT
PENDING --(falha, ainda há tentativas)--> RETRYING --(sucesso)--> SENT
PENDING --(falha, ainda há tentativas)--> RETRYING --(falha, última tentativa)--> FAILED
```

- Fila `meta-conversions` (BullMQ), mesma política da Fase 6:
  `attempts: 5`, backoff exponencial a partir de 5s.
- `MetaConversionSendProcessor` decide `RETRYING` vs. `FAILED` comparando
  `job.attemptsMade` com `job.opts.attempts` — `FAILED` só quando esta é
  genuinamente a última tentativa configurada, não em qualquer falha.
- **Reconexão drena o que ficou para trás**: `connectCapi()` sempre
  reenfileira qualquer evento `PENDING` ou `FAILED` da organização — é
  assim que um `FAILED` (por token/pixel errados) se recupera: corrigindo a
  configuração, não esperando um retry automático que já se esgotou.
- Mesma lição da Fase 6 aplicada desde o início aqui: `MetaConversionSendService.send()`
  reconfere o estado real da conexão (`status`, `pixelId`,
  `capiAccessTokenEncrypted`) a cada tentativa, nunca confia no que existia
  quando o job foi enfileirado — um `disconnect()` no meio de um retry
  atrasado marca o evento como `FAILED` em vez de vazar para uma conexão já
  desligada.

### Bug encontrado na validação: `attemptsMade` do BullMQ é contado ao contrário do que parece

`MetaConversionSendProcessor` decide `RETRYING` vs. `FAILED` comparando
`job.attemptsMade` com o número de tentativas configurado — mas a primeira
versão assumia que `attemptsMade` já contava a tentativa **atual** (1 na
primeira chamada). Isso é o oposto do real: lendo o próprio código-fonte do
BullMQ (`job.js`, método `shouldRetryJob`, que decide se tenta de novo via
`this.attemptsMade + 1 < opts.attempts`), `attemptsMade` só conta tentativas
**já concluídas antes** da chamada atual — permanece `0` durante a
primeiríssima execução do processor, não `1`.

Com a fórmula errada, o evento nunca chegava a `FAILED`: mesmo depois do
BullMQ esgotar as 5 tentativas de verdade (confirmado inspecionando
`bull:meta-conversions:<id>` no Redis — campo `atm`, que é literalmente
`attemptsMade`, e `finishedOn` preenchido), o processor computava "não é a
última tentativa" na 5ª chamada e gravava `RETRYING` para sempre, um estado
que nunca mais seria reavaliado (o job já tinha acabado do lado do BullMQ).

Corrigido trocando `job.attemptsMade >= maxAttempts` por
`job.attemptsMade + 1 >= maxAttempts`, e validado de duas formas: um teste
unitário dedicado (`meta-conversion-send.processor.spec.ts`) fixando o
comportamento exato em cada tentativa, e uma execução real em Docker com um
token propositalmente inválido, aguardando o backoff completo (5 tentativas,
~75s) — o evento chegou a `FAILED` exatamente na 5ª tentativa, nunca antes.

## Dados enviados (`user_data`)

Não existe Pixel de navegador neste produto (a jornada é 100% WhatsApp), então:

- `user_data.ph`: sempre presente — SHA-256 do telefone normalizado
  (E.164, sem o `+`), nunca o número em texto puro.
- `user_data.ctwa_clid`: presente **somente** quando a atribuição do lead
  foi por `CTWA_REFERRAL` (Fase 4) — o `ctwa_clid` que a própria Meta deu
  na mensagem do anúncio Click-to-WhatsApp. Para atribuição via
  `TRACKING_LINK` ou `UNKNOWN`, o evento é enviado só com `ph` (ainda válido
  para a Meta, com attribution mais fraca).
- `action_source: "business_messaging"` e `messaging_channel: "whatsapp"`
  em todo evento — o par documentado pela Meta especificamente para leads
  originados de mensageria, não o `"website"` genérico.

## Modelo de dados desta fase

```
MetaConnection  (mesma linha da Fase 6)
   pixelId, capiAccessTokenEncrypted, capiConfiguredAt  (novos campos, nullable)

Lead
   |
   v
ConversionEvent  (único por leadId + type)
   type: LEAD | QUALIFIED_LEAD | PURCHASE
   status: PENDING | RETRYING | SENT | FAILED
   valueCents, currency  (só PURCHASE)
```

## Limitações conhecidas (deliberadas, não descuido)

- **Sem backfill.** Uma organização que conecta Meta Ads/CAPI depois de já
  ter leads/vendas não gera eventos retroativos — a Conversions API real
  rejeita `event_time` com mais de 7 dias, então backfill de eventos
  antigos não teria valor de qualquer forma.
- **Uma correção de valor após o envio não reenvia.** A Meta não tem uma
  forma de "atualizar" um evento já recebido — corrigir o valor de uma
  venda já enviada só afeta os relatórios internos deste produto, nunca o
  que já foi reportado à Meta. Documentado, não escondido.
- **Sem fbc/fbp de navegador.** Não há Pixel de site nesta jornada — o
  único sinal de clique é o `ctwa_clid` (Fase 4), quando existe.
- **Um `FAILED` não se recupera sozinho.** Depois que o BullMQ esgota as 5
  tentativas, o evento fica `FAILED` até a organização reconfigurar a
  conexão (o que aciona `drainPending`) — não há um cron tentando de novo
  sozinho. Aceitável: um Pixel/token errado não vai se corrigir com o
  tempo, só com uma ação humana.

## Credenciais necessárias para homologação real

Já presentes em `.env.example`:

- `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`: valores de exemplo para
  testes locais/seed — em produção, cada organização informa os seus
  próprios via a tela de conexão (`POST /integrations/meta/capi/connect`),
  não por variável de ambiente.
- `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
  `META_AD_ACCOUNT_ID`: já em uso desde a Fase 6, sem relação com esta fase.
