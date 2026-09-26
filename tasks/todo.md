# Tarefas: backend num único Web Service

Plano e decisões: [`plan.md`](plan.md).

> Código de T1–T8 implementado em 2026-09-26, sem as variáveis de
> alternância (decisão do usuário). Os itens de aceite e os checkpoints no
> Render continuam abertos até o teste manual.

Comandos de verificação (rodar em `apps/api`):
- Testes focados: `pnpm exec jest <arquivo.spec.ts>`
- Tipos: `pnpm typecheck`
- Build: `pnpm build`

---

## Fase 1: processo único

### [x] T1: Worker rodando dentro do processo da API

**Descrição:** Separar do `WorkerModule` os processadores e agendas num
`WorkerProcessorsModule` sem `ConfigModule.forRoot`/`BullModule.forRoot`. O
`WorkerModule` standalone passa a ser só `forRoot` + esse módulo. O
`AppModule` importa `WorkerProcessorsModule` quando `WORKER_EMBUTIDO=true`.

**Aceite:**
- [ ] Com `WORKER_EMBUTIDO=true`, um único processo sobe a API e consome as
      filas (log dos processadores e das agendas de sincronia e faxina).
- [ ] Com a variável ausente, a API se comporta como hoje e o
      `start:worker` continua funcionando sozinho.
- [ ] Não há registro duplicado de fila nem de `forRoot` (sem aviso do Nest
      na subida).

**Verificação:**
- [ ] `pnpm typecheck` e `pnpm build` passam.
- [ ] Testes existentes do worker passam (`worker/**/*.spec.ts`).
- [ ] Manual: subir com a variável e confirmar no log que um job de
      manutenção ou de e-mail foi processado.

**Dependências:** nenhuma.
**Arquivos:** `src/worker/worker.module.ts`,
`src/worker/worker-processors.module.ts` (novo), `src/app.module.ts`,
`.env.example`.
**Tamanho:** S.

### [x] T2: Motor de WhatsApp como instância única compartilhada

**Descrição:** Tirar o `EvolutionClient` da lista de providers do
`WhatsAppConnectionsModule` e do módulo de processadores, e fornecer por um
`WhatsAppMotorModule` `@Global()`. É só a troca de provisionamento: o
comportamento não muda. Isso prepara o T3, em que duas instâncias
significariam duas conexões com o mesmo número.

**Aceite:**
- [ ] Existe uma única instância do cliente no processo unificado.
- [ ] As telas de integração de WhatsApp e o envio pelo worker funcionam como
      antes (com a Evolution no docker-compose local).

**Verificação:**
- [ ] `pnpm typecheck`, `pnpm build` e os specs de `integrations/whatsapp` e
      `worker/processors/whatsapp-send*` passam.

**Dependências:** T1.
**Arquivos:** `src/integrations/whatsapp/whatsapp-motor.module.ts` (novo),
`src/integrations/whatsapp/whatsapp-connections.module.ts`,
`src/worker/worker-processors.module.ts`.
**Tamanho:** S.

### Checkpoint 1
- [ ] Deploy no Render com `WORKER_EMBUTIDO=true`: `/health` ok e jobs sendo
      processados no log do serviço da API.
- [ ] RAM do serviço (Render → Metrics) abaixo de ~300 MB ociosa. Se passar
      disso, rever antes de seguir para a Fase 2.
- [ ] Revisão humana antes de seguir.

---

## Fase 2: WhatsApp embutido

### [x] T3: Motor embutido conecta e gera QR Code (sessão em memória)

**Descrição:** Adicionar o Baileys (versão exata fixada) e um
`MotorWhatsAppEmbutido` com os mesmos métodos do `EvolutionClient`:
- `createInstance`, `getQrCode`, `getConnectionState`, `getConnectedNumber`,
  `logout` e `deleteInstance` implementados com o Baileys;
- `lerWebhook`/`defineWebhook` sem efeito, porque não há webhook: o evento
  vai direto para o serviço;
- `getQrCode` devolve `{ base64, code }` no mesmo formato de hoje, com o
  data URI gerado pela lib `qrcode`;
- `connection.update` é entregue a `enqueueEvolutionEvent`, o que atualiza o
  status na tela.

A escolha do motor é por `WHATSAPP_MOTOR=embutido` no `WhatsAppMotorModule`.
Esta tarefa ataca primeiro o maior risco: confirmar que o Baileys compila no
build CommonJS da API e cabe na memória.

**Aceite:**
- [ ] No Render, "Conectar WhatsApp" mostra o QR Code.
- [ ] Ler o QR muda o status para "conectado" sem recarregar a página.
- [ ] Com `WHATSAPP_MOTOR` ausente, tudo continua indo para a Evolution.

**Verificação:**
- [ ] `pnpm build` passa com o Baileys.
- [ ] Spec do motor, com o socket do Baileys simulado: o evento de QR vira
      `{ base64, code }` e o de conexão chama `enqueueEvolutionEvent` com o
      formato certo.
- [ ] Manual: ler o QR com um número de teste.

**Dependências:** T2.
**Arquivos:** `apps/api/package.json`,
`src/integrations/whatsapp/motor-embutido.ts` (novo) e o spec dele,
`src/integrations/whatsapp/whatsapp-motor.module.ts`,
`src/whatsapp-webhook/whatsapp-webhook.service.ts` (assinar os eventos do
motor).
**Tamanho:** M.

### [x] T4: Sessão salva no Postgres e reconexão automática na subida

**Descrição:** Criar o model `SessaoWhatsApp` (instância, chave, valor em
JSON) com migration, e um adaptador de `AuthenticationState` do Baileys
(credenciais e chaves, com `BufferJSON`) lendo e gravando nessa tabela. Na
subida do módulo, o motor reabre toda instância com sessão salva. `logout` e
`deleteInstance` apagam a sessão.

**Aceite:**
- [ ] Reiniciar o serviço no Render reconecta o número sozinho, sem novo QR.
- [ ] Desconectar pela tela apaga a sessão do banco. Conectar de novo pede QR.

**Verificação:**
- [ ] Spec do adaptador: gravar e ler de volta as credenciais e as chaves
      (incluindo Buffers) dá o mesmo valor.
- [ ] `prisma migrate deploy` aplica a migration no Supabase.
- [ ] Manual: "Manual Deploy" no Render e o status continua "conectado".

**Dependências:** T3.
**Arquivos:** `prisma/schema.prisma`, `prisma/migrations/<data>_sessao_whatsapp/`,
`src/integrations/whatsapp/sessao-no-banco.ts` (novo) e o spec dele,
`src/integrations/whatsapp/motor-embutido.ts`.
**Tamanho:** M.

### [x] T5: Mensagem recebida vira lead

**Descrição:** Converter cada mensagem do evento `messages.upsert` do Baileys
para o formato da Evolution (`{ event: "messages.upsert", instance, data }`),
trazendo o `contextInfo` (origem Click-to-WhatsApp) para o nível de `data`,
como a Evolution faz. Entregar a `enqueueEvolutionEvent`. O parser atual já
ignora `fromMe`, grupos e status.

**Aceite:**
- [ ] Uma mensagem enviada de outro celular aparece como lead e conversa na
      tela.
- [ ] Uma mensagem vinda de anúncio (CTWA) chega com `ctwaClid` e é atribuída.

**Verificação:**
- [ ] Spec do conversor com uma mensagem real do Baileys (texto simples e com
      `contextInfo` de anúncio) passando pelo `parseEvolutionPayload` e
      gerando o job esperado.

**Dependências:** T4.
**Arquivos:** `src/integrations/whatsapp/motor-embutido.ts`,
`src/integrations/whatsapp/de-baileys-para-evolution.ts` (novo) e o spec dele.
**Tamanho:** S.

### [x] T6: Resposta enviada pela tela chega no celular

**Descrição:** `sendText` no motor com `sock.sendMessage`, devolvendo
`{ externalId }`. Sem sessão aberta, lança erro na hora, sem ficar
pendurado: é o mesmo problema que o `REQUEST_TIMEOUT_MS` resolve hoje.

**Aceite:**
- [ ] A resposta enviada em Conversas chega no celular, e a mensagem fica
      gravada com o `externalId`.
- [ ] Com o número desconectado, o job falha com uma mensagem clara, sem
      travar o worker.

**Verificação:**
- [ ] Spec: `sendText` com socket simulado devolve o id. Sem socket, rejeita.
- [ ] Specs existentes de `whatsapp-send.service` passam.

**Dependências:** T4.
**Arquivos:** `src/integrations/whatsapp/motor-embutido.ts` e o spec dele.
**Tamanho:** S.

### Checkpoint 2
- [ ] Fluxo completo no Render: QR → conectado → mensagem recebida → lead →
      resposta chega no celular → deploy → continua conectado.
- [ ] RAM estável abaixo de 512 MB por 24 h com o número conectado.
- [ ] Apagar os serviços de Evolution e de worker no Render.
- [ ] Revisão humana antes de seguir.

---

## Fase 3: acabamento

### [x] T7: Configuração final do Render e documentação

**Descrição:** Consolidar as variáveis do serviço único (`WORKER_EMBUTIDO`,
`WHATSAPP_MOTOR`, `NODE_OPTIONS`) no `.env.example`. Atualizar o
`docs/WHATSAPP.md` e o README com a arquitetura de um serviço. Remover do
`.env` do Render as variáveis que perderam o uso (`EVOLUTION_API_URL`,
`EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_*`).

**Aceite:**
- [ ] Alguém que nunca viu o projeto consegue subir o backend no Render só
      com o README.

**Verificação:**
- [ ] Revisão da documentação.

**Dependências:** Checkpoint 2.
**Arquivos:** `.env.example`, `README.md`, `docs/WHATSAPP.md`.
**Tamanho:** S.

### [x] T8: Remover a Evolution (opcional, depois de 1 a 2 semanas estável)

**Descrição:** Apagar o `EvolutionClient`, a rota de webhook da Evolution, o
serviço `evolution` do docker-compose e a variável `WHATSAPP_MOTOR`. O motor
embutido passa a ser o único caminho, inclusive no desenvolvimento local.

**Aceite:**
- [ ] Nenhuma referência à Evolution no código, fora o nome do enum no banco.
- [ ] `docker compose up` local conecta o WhatsApp pelo motor embutido.

**Verificação:**
- [ ] `pnpm test`, `pnpm build` e os e2e de WhatsApp passam.

**Dependências:** T7 e a decisão humana.
**Arquivos:** `evolution-client.ts` e o spec dele, `evolution-api-error.ts`,
`whatsapp-webhook.controller.ts`, `docker-compose.yml`,
`whatsapp-motor.module.ts`.
**Tamanho:** M.
