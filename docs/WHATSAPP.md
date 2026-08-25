# Integração com WhatsApp

> **Status: implementado (Fase 3).** Este documento descreve o comportamento
> real do código em `apps/api/src/whatsapp-webhook/`,
> `apps/api/src/integrations/whatsapp/` e
> `apps/api/src/worker/processors/`. A conexão do clique rastreado (Fase 2)
> com o lead criado aqui é a Fase 4 (`docs/ATTRIBUTION.md`) — ainda não
> implementada.

## Decisão: WhatsApp Business Cloud API, não QR Code

O produto suporta apenas a **WhatsApp Cloud API oficial da Meta**. Uma
conexão não oficial via QR Code (bibliotecas como Baileys/whatsapp-web.js,
que emulam o WhatsApp Web) foi deliberadamente **não implementada**:

- **Risco de banimento**: a Meta pode banir números que usam automação não
  oficial, a qualquer momento e sem aviso — inaceitável para uma plataforma
  cujo propósito é justamente não perder a atribuição de vendas.
- **Instabilidade**: essas bibliotecas dependem de engenharia reversa do
  protocolo do WhatsApp Web, que quebra a cada mudança da Meta.
- **Ambiguidade legal**: uso de automação não oficial pode violar os termos
  de serviço do WhatsApp.
- **Manutenção**: exigiria manter uma sessão de navegador/websocket viva por
  conexão, muito mais operacionalmente caro que receber webhooks HTTP.

A abstração ainda é limpa o suficiente (`WhatsAppConnection` com um campo
`provider` implícito de valor único hoje) para adicionar um segundo provider
no futuro, **se e somente se** a decisão acima for revisitada
explicitamente — não por conveniência de implementação.

## Como a conexão funciona hoje

Não há handshake OAuth com a Meta (exigiria um Meta App revisado com a
permissão `whatsapp_business_management`, fora do alcance deste ambiente).
Em vez disso, a organização conecta manualmente os identificadores que a
Meta já forneceu a ela ao configurar o número na própria plataforma da Meta:

```
Configurações → Integrações → WhatsApp
         |
         v
POST /api/integrations/whatsapp/connect
{ phoneNumberId, displayPhoneNumber, accessToken? }
```

- `phoneNumberId`: é a **chave de roteamento multi-tenant** — todo evento
  recebido no webhook único da aplicação carrega esse id
  (`value.metadata.phone_number_id`); é ele que diz a qual organização o
  evento pertence. Por isso é `@unique` no banco: dois tenants não podem
  reivindicar o mesmo número.
- `accessToken` é opcional e, se enviado, é criptografado em repouso
  (AES-256-GCM, `EncryptionService`) antes de ser salvo — mas **não é usado
  por nada ainda**, porque esta fase só recebe mensagens, não envia. Ele
  existe no schema para quando uma fase futura precisar chamar a Graph API
  (ex.: enviar confirmação, buscar perfil).
- Reconectar (chamar `connect` de novo, com o mesmo ou outro `phoneNumberId`)
  faz `upsert` na mesma linha — nunca cria uma segunda `WhatsAppConnection`
  para a mesma organização, e desconectar é só uma troca de status
  (`DISCONNECTED` + `disconnectedAt`), nunca um DELETE. Histórico de
  conversas/leads nunca é destruído por desconectar (Seção 88).

## Como o webhook funciona

```
Meta
  |
  v
POST /whatsapp-webhook          (público, fora do prefixo /api)
  |
  v
verifica X-Hub-Signature-256 (HMAC-SHA256 com WHATSAPP_APP_SECRET,
                               sobre os bytes crus do corpo — ver main.ts
                               `rawBody: true`)
  |
  v
para cada mensagem no payload: enfileira 1 job em "whatsapp-events" (BullMQ)
  |
  v
responde 200 imediatamente          <- nunca faz trabalho de banco aqui
  |
  v
(processo worker separado)
WhatsAppEventProcessor -> WhatsAppIngestionService.ingest(job)
```

- **GET `/whatsapp-webhook`**: responde ao handshake de verificação da Meta
  (`hub.mode`, `hub.verify_token`, `hub.challenge`) comparando com
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- **Eventos que não são mensagem** (`statuses` — confirmações de entrega/
  leitura de mensagens que a *própria plataforma* enviaria) são ignorados
  silenciosamente, não é erro: esta fase não envia mensagens, então não faz
  sentido processar status de entrega.
- **Nunca 4xx/5xx para a Meta por causa de assinatura inválida** — a
  resposta é sempre 200 com `{ received: false }`, porque um erro faria a
  Meta tentar de novo, e uma assinatura inválida não vai ficar válida numa
  segunda tentativa.

## Idempotência (ponta a ponta)

Uma mensagem processada duas vezes (Meta reenvia webhooks) **nunca** cria
dois leads, duas conversas ou duas mensagens:

1. **Nível fila**: o job é enfileirado com `jobId = messageId` do WhatsApp
   (`wamid.*`) — uma re-entrega quase simultânea (job ainda pendente/ativo/
   recém-concluído no Redis) é deduplicada pelo próprio BullMQ.
2. **Nível banco (a fonte real da verdade)**: `Message.externalId` é
   `@unique`. `WhatsAppIngestionService.ingest` primeiro verifica se aquele
   `externalId` já existe e, se sim, retorna sem fazer nada. Isso cobre
   reentregas que chegam depois do job original já ter sido limpo da fila
   (`removeOnComplete: true`), quando a dedup da fila não se aplica mais.
3. Cada passo de "buscar ou criar" (lead, conversa, mensagem) também trata a
   violação de constraint única como uma corrida esperada, não um erro —
   recarrega a linha vencedora em vez de falhar (mesma técnica usada em
   `AuthService.register`, Fase 1).

## Modelo de dados desta fase

```
WhatsAppConnection  (1 por organização, phoneNumberId único)
        |
        v
   Conversation  (1 por par lead+connection nesta fase — ver limitação abaixo)
        |
        v
     Message  (externalId único = idempotência)

Lead  (organizationId + normalizedPhone único = deduplicação)
  |
  v
LeadEvent  (LEAD_CREATED, CONVERSATION_STARTED, MESSAGE_RECEIVED)
```

## Normalização de telefone

`normalizePhone` (`common/utils/normalize-phone.ts`) usa `libphonenumber-js`
com uma ordem de tentativas pensada para a fonte real dos dados (o `wa_id`
da Meta, que já vem com código do país, sem `+`):

1. Tenta como já-internacional (`+` + dígitos) — cobre o `wa_id` da Meta.
2. Tenta como número nacional para `BR` — cobre entrada digitada à mão sem
   código de país, útil se um número for inserido manualmente em alguma
   tela futura.
3. Se nada validar, cai para um fallback `+<dígitos>` determinístico — uma
   única mensagem com telefone mal-formado nunca pode travar o webhook
   inteiro.

## Limitações conhecidas (deliberadas, não descuido)

- **Uma conversa por par (lead, conexão), reutilizada para sempre.** A
  Seção 59 do escopo pede leads e conversas conceitualmente separados, com
  um lead podendo ter várias conversas ao longo do tempo — implementado
  parcialmente: a separação Lead/Conversation existe, mas a regra de
  "quando começar uma conversa nova" (ex.: após N dias de silêncio) não foi
  definida nem implementada. Passível de refinamento numa fase futura sem
  quebrar o schema atual.
- **Sem envio de mensagens.** Só ingestão. `MessageDirection.OUTBOUND`
  existe no enum para quando isso mudar, mas nada escreve mensagens de
  saída ainda.
- **Mídia não é armazenada**, só o tipo (`TEXT` ou `OTHER`) — texto de
  mensagens não-texto nunca é persistido, por minimização de dados
  (Seção 61).
- **Sem rate limiting** no endpoint do webhook.

## Credenciais necessárias para homologação real

Já presentes em `.env.example`:

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` — definidos por
  você mesmo ao registrar o webhook no Meta for Developers (não vêm da
  Meta, você que escolhe os valores e informa nos dois lugares).
- `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID` (documentado no `.env.example`, mas o
  `phoneNumberId` real de cada organização é inserido pela própria tela de
  conexão, não por variável de ambiente — a variável serve só para testes
  locais/seed).
- `WHATSAPP_CLOUD_API_TOKEN`: token de sistema, necessário apenas quando uma
  fase futura precisar chamar a Graph API (envio de mensagem, etc.) — não
  usado hoje.
