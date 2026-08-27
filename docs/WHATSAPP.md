# Integração com WhatsApp

> **Status: implementado (Fase 3, reformulado na Fase 8).** Este documento
> descreve o comportamento real do código em
> `apps/api/src/whatsapp-webhook/`, `apps/api/src/integrations/whatsapp/` e
> `apps/api/src/worker/processors/`.

## Decisão (revista na Fase 8): dois providers, QR Code como padrão

Até a Fase 7 o produto suportava **apenas** a Cloud API oficial da Meta, e a
conexão por QR Code estava deliberadamente fora de escopo. Essa decisão foi
**revertida na Fase 8** por um motivo prático: exigir um número já verificado
no Meta for Developers, com webhook configurado à mão, tornava a integração
inutilizável na prática — e ela ainda só recebia mensagens, nunca enviava.

Hoje existem dois providers, escolhidos pelo campo `WhatsAppConnection.provider`:

| | `EVOLUTION` (QR Code) | `CLOUD_API` (oficial da Meta) |
|---|---|---|
| Como conecta | Lendo um QR Code no celular | `phoneNumberId` + webhook configurados na Meta |
| Recebe mensagens | Sim | Sim |
| Envia mensagens | Sim | Não (ver limitações) |
| Risco de bloqueio | **Sim** — automação não oficial | Não |
| Verificação de negócio | Não exige | Exige |

**O risco do QR Code continua real e não foi resolvido, apenas aceito:** a
Evolution API fala o protocolo do WhatsApp Web por engenharia reversa, o que
significa que (a) a Meta pode bloquear o número a qualquer momento e sem
aviso, (b) o protocolo pode mudar e quebrar a conexão, e (c) o uso pode
violar os termos de serviço do WhatsApp. Quem precisar de garantia
operacional deve usar `CLOUD_API`, que segue disponível e não foi removida.

**O pipeline a jusante é o mesmo para os dois.** Cada transporte apenas
normaliza o evento recebido para o mesmo `WhatsAppInboundMessageJob`; a
partir daí, criação de lead, atribuição (Fase 4), qualificação/venda
(Fase 5) e envio para a Conversions API (Fase 7) não sabem — nem precisam
saber — por qual provider a mensagem chegou.

## Conexão por QR Code (provider EVOLUTION)

O motor é a [Evolution API](https://doc.evolution-api.com), que sobe como um
container próprio no `docker-compose.yml`. Ela fica isolada de propósito: é
ela que mantém a sessão do WhatsApp Web viva, o que tornaria o nosso worker
*stateful* se fosse embutido — um restart derrubaria todas as conexões.

```
Integrações → WhatsApp → "Gerar QR Code"
         |
         v
POST /api/integrations/whatsapp/qr/connect
         |
         v
cria a instância na Evolution (nome = "org-<organizationId>") já registrando
o webhook, e grava a conexão como PENDING_QR
         |
         v
a tela busca GET /api/integrations/whatsapp/qr a cada 5s (a Evolution
rotaciona o código a cada ~30s) e mostra a imagem
         |
         v
usuário lê o QR no celular  ->  Evolution manda CONNECTION_UPDATE(state=open)
         |
         v
status vira CONNECTED e o número conectado é preenchido
```

- **O nome da instância é derivado do `organizationId`** (`org-<uuid>`):
  estável entre reconexões (não vaza instâncias órfãs a cada tentativa) e
  único por construção, o que o torna uma chave de roteamento multi-tenant
  segura — o papel que o `phoneNumberId` cumpre no provider `CLOUD_API`.
- **Trocar de provider limpa a chave do outro.** Conectar por QR zera o
  `phoneNumberId` e vice-versa: uma chave órfã continuaria roteando webhooks
  atrasados para um caminho que a organização não usa mais.
- **Queda de sessão vira `PENDING_QR`, não `DISCONNECTED`.** `DISCONNECTED`
  significa "o usuário desligou de propósito" e não deve ser inventado por
  uma queda (celular sem bateria, sessão expirada).

### Autenticidade do webhook da Evolution

Diferente da Meta, a Evolution **não assina** o corpo com HMAC. A
autenticidade vem de um segredo compartilhado no path
(`EVOLUTION_WEBHOOK_TOKEN`), registrado por nós ao criar a instância e
comparado em tempo constante em `WhatsAppWebhookService.verifyEvolutionToken`.
Sem isso, qualquer um que alcançasse a porta da API poderia injetar mensagens
e fabricar leads e vendas.

## Envio de mensagens (Fase 8)

```
Lead → caixa de resposta
   |
   v
POST /api/leads/:id/messages
   |
   v
grava a Message como OUTBOUND/PENDING  <- ANTES de enfileirar
   |
   v
enfileira em "whatsapp-send" (attempts: 3, backoff exponencial 3s)
   |
   v
(worker) WhatsAppSendService relê o estado atual do banco e envia
   |
   v
SENT (com o id real do provider) ou FAILED (com o motivo, visível na conversa)
```

- **A mensagem é persistida antes de ser enfileirada**, nunca depois: assim
  ela aparece na conversa imediatamente e, se o envio falhar, existe uma
  linha concreta para marcar como `FAILED` e mostrar o motivo — em vez de a
  mensagem simplesmente sumir.
- **`Message.externalId` é nulo até o provider aceitar.** Para mensagens
  recebidas ele é a chave de idempotência contra reentregas; para enviadas,
  só existe depois do envio. O índice único tolera múltiplos nulos.
- **Nunca reenvia.** O worker relê o estado a cada tentativa e para se já
  estiver `SENT` — a mesma lição das Fases 6 e 7 sobre jobs atrasados
  sobrevivendo a uma mudança de estado.
- **O eco da própria mensagem é ignorado na entrada** (`key.fromMe`), o que
  impede uma resposta do atendente de criar um lead ou disparar os gatilhos
  de qualificação/venda.

## Conexão pela Cloud API (provider CLOUD_API)

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
  (AES-256-GCM, `EncryptionService`) antes de ser salvo — mas **ainda não é
  usado por nada**: o envio pela Cloud API não foi implementado (ver
  limitações). Ele existe no schema para quando isso acontecer.
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
  leitura) são ignorados silenciosamente, não é erro: o envio pela Cloud API
  não está implementado, então não há status de entrega a processar por aqui.
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
- **Envio só pelo provider `EVOLUTION`.** Pela Cloud API o envio exigiria um
  template previamente aprovado pela Meta fora da janela de 24h de
  atendimento, além de um access token válido por organização — trabalho de
  uma fase futura. Tentar enviar por uma conexão `CLOUD_API` falha
  explicitamente ("disponível apenas na conexão por QR Code") em vez de
  fingir que a mensagem saiu.
- **Só texto.** Enviar imagem, áudio ou documento não está implementado.
- **Mídia recebida não é armazenada**, só o tipo (`TEXT` ou `OTHER`) — o
  conteúdo de mensagens não-texto nunca é persistido, por minimização de
  dados (Seção 61).
- **Sem rate limiting** no endpoint do webhook.
- **Sem reconexão automática do QR.** Se a sessão cair, a conexão volta para
  `PENDING_QR` e alguém precisa ler o código de novo — não há tentativa
  automática de restabelecer, porque o WhatsApp exige o aparelho presente.

## Credenciais e configuração

Já presentes em `.env.example`.

### Provider EVOLUTION (QR Code)

Nenhuma credencial de terceiros — os dois segredos são escolhidos por você:

- `EVOLUTION_API_KEY`: protege a API da Evolution. O mesmo valor é usado pelo
  container (no `docker-compose.yml`) e pela nossa API.
- `EVOLUTION_WEBHOOK_TOKEN`: autentica os webhooks que a Evolution nos envia
  (gere com `openssl rand -hex 24`).
- `EVOLUTION_API_URL` / `EVOLUTION_WEBHOOK_URL`: como os dois lados se
  enxergam **dentro da rede do Docker** — nunca `localhost`, que dentro de um
  container aponta para o próprio container.

O banco `evolution` (onde a sessão é persistida, para o número não cair a
cada restart) é criado automaticamente pelo script em
`docker/postgres-init/` quando o volume do Postgres nasce vazio. Num volume
que já existia antes da Fase 8, ele foi criado uma única vez à mão.

### Provider CLOUD_API (oficial da Meta)

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` — definidos por
  você mesmo ao registrar o webhook no Meta for Developers (não vêm da
  Meta, você que escolhe os valores e informa nos dois lugares).
- `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID` (documentado no `.env.example`, mas o
  `phoneNumberId` real de cada organização é inserido pela própria tela de
  conexão, não por variável de ambiente — a variável serve só para testes
  locais/seed).
- `WHATSAPP_CLOUD_API_TOKEN`: token de sistema, necessário apenas quando o
  envio pela Cloud API for implementado — não usado hoje.
