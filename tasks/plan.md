# Plano: backend num único Web Service do Render

> **Decisões do usuário (2026-09-26):**
> - O serviço unificado vai no plano Starter (US$ 7).
> - O site continua free.
> - **Sem Evolution de reserva.**
>
> Consequências:
> - O worker roda **sempre** dentro da API (sem a variável `WORKER_EMBUTIDO`), e o processo separado foi removido.
> - A Evolution saiu do código (sem a variável `WHATSAPP_MOTOR`). A T8 foi feita junto.
> - T1–T8 estão implementadas no código. Falta o aceite no Render (checkpoints).

## Objetivo

Hoje o backend precisa de quatro serviços para funcionar por completo: API,
worker, Evolution API e Redis. O objetivo é rodar **API + worker + WhatsApp
por QR Code num único Web Service**, mantendo apenas o Redis (Key Value free)
e o site (Web Service free) como serviços à parte.

## Análise: por que não "Evolution dentro do mesmo contêiner"

| Caminho | Como | RAM estimada | Plano Render | Custo/mês |
|---|---|---|---|---|
| Atual (separado) | API + worker + Evolution, cada um num serviço | 3 × ~250 MB | 3 × Starter | ~US$ 21 |
| A. Evolution como sidecar | Imagem única rodando a API e a Evolution como dois processos | ~600–800 MB | Standard (2 GB) | ~US$ 25 |
| **B. Motor embutido** | Worker e WhatsApp (Baileys) **dentro do processo da API** | ~250–350 MB | Starter (512 MB) | **~US$ 7** |

A Evolution é uma aplicação Node inteira (Express, Prisma, cache e o Baileys
por baixo). Colocá-la no mesmo contêiner não cabe em 512 MB e força o plano
Standard, que sai **mais caro** que os serviços separados.

O produto usa só **9 rotas** da Evolution (criar instância, QR Code, estado,
número conectado, enviar texto, logout, apagar, ler/definir webhook) e **2
eventos** (`messages.upsert`, `connection.update`). Essa superfície é pequena
o bastante para ser atendida pelo Baileys, a biblioteca que a própria
Evolution usa, rodando dentro da API. **Escolhido: caminho B.**

## Decisões de arquitetura

1. **Worker no mesmo processo.** Os processadores do `WorkerModule` passam a
   um módulo sem `forRoot`, e o `AppModule` importa esse módulo quando
   `WORKER_EMBUTIDO=true`. O `start:worker` continua existindo, e o
   docker-compose local não muda.
2. **Motor com a mesma cara do `EvolutionClient`.** O motor embutido implementa
   os mesmos métodos, então `WhatsAppConnectionsService` e
   `WhatsAppSendService` não mudam. A escolha é por variável
   (`WHATSAPP_MOTOR=embutido`). O padrão continua `evolution`, e esse é o
   caminho de volta caso algo falhe.
3. **Um único motor por processo.** A API e o worker hoje criam cada um o seu
   `EvolutionClient`. Com o motor embutido, isso abriria duas conexões para o
   mesmo número, então o motor passa a ser um provider global único.
4. **Eventos pelo caminho que já existe.** O motor entrega cada evento a
   `WhatsAppWebhookService.enqueueEvolutionEvent()`, já no formato da
   Evolution (`{ event, instance, data }`). O parser, a fila, a ingestão, a
   atribuição e a qualificação não mudam.
5. **Sessão do WhatsApp no Postgres (Supabase).** As credenciais do Baileys
   ficam numa tabela nova, e não em disco. A sessão sobrevive a deploy e a
   reinício sem precisar ler o QR de novo e sem disco pago no Render.
6. **Reconexão na subida.** Ao iniciar, o motor reabre toda sessão salva.
7. **O enum `provider = EVOLUTION` no banco fica como está.** Renomear exige
   migração e não traz ganho. Fica como dívida de nome, anotada no código.
8. **Redis continua no Key Value free.** Serve as filas (BullMQ), o limite de
   requisições e as notificações em tempo real. A Evolution era o outro
   consumidor do Redis e sai de cena.

## Grafo de dependências

```
T1 Worker embutido ─────────────┐
                                ├─► Checkpoint 1 (1 serviço a menos)
T2 Motor único (provider global)┘
        │
        ▼
T3 Motor embutido: conectar + QR (sessão em memória)   ← maior risco, vem primeiro
        │
        ▼
T4 Sessão persistida no Postgres + reconexão na subida
        │
        ├─► T5 Receber mensagem → lead
        └─► T6 Enviar mensagem
                │
                ▼
        Checkpoint 2 (desligar Evolution e worker no Render)
                │
                ▼
T7 Configuração final e documentação
T8 (depois de 1–2 semanas estável) Remover a Evolution do código
```

## Tarefas

Os detalhes de cada tarefa (critérios de aceite, verificação, arquivos) estão
em [`todo.md`](todo.md).

### Fase 1: processo único
- [ ] T1: Worker rodando dentro do processo da API
- [ ] T2: Motor de WhatsApp como instância única compartilhada

**Checkpoint 1:** a API sobe no Render com `WORKER_EMBUTIDO=true`, os jobs
são processados e o serviço de worker deixa de ser necessário.

### Fase 2: WhatsApp embutido
- [ ] T3: Motor embutido conecta e gera QR Code (sessão em memória)
- [ ] T4: Sessão salva no Postgres e reconexão automática na subida
- [ ] T5: Mensagem recebida vira lead
- [ ] T6: Resposta enviada pela tela chega no celular

**Checkpoint 2:** fluxo completo no Render (QR → conectado → mensagem → lead
→ resposta). Com isso, os serviços de Evolution e worker podem ser apagados.

### Fase 3: acabamento
- [ ] T7: Configuração final do Render e documentação
- [ ] T8: Remover a Evolution do código e do docker-compose (opcional, depois)

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Passar de 512 MB de RAM | Alto | Medir no Checkpoint 1 (métricas do Render). `NODE_OPTIONS=--max-old-space-size=400`. Se não couber, a próxima faixa de preço custa o mesmo que o caminho A. |
| Versão do Baileys incompatível com o build (CommonJS/ESM) | Alto | T3 começa por isso e fixa uma versão exata. Se falhar, paramos antes de mexer em banco. |
| Baileys não é oficial (risco de bloqueio do número) | Médio | É o mesmo risco que já existe: a Evolution usa o Baileys por baixo. Nada muda. |
| Mensagens durante um deploy (cerca de 1 min fora do ar) | Médio | O WhatsApp entrega as mensagens pendentes ao reconectar. O `jobId = messageId` evita duplicar. |
| Redis free sem persistência | Baixo | Se o Key Value reiniciar, os jobs na fila se perdem. Com 4 usuários o volume é baixo. Upgrade (~US$ 10) se virar problema. |
| Mudanças futuras na API do Baileys | Médio | Versão fixa no `package.json`. A superfície usada é pequena, então atualizar é trabalho localizado num arquivo. |

## Perguntas em aberto

1. **Plano do serviço unificado:** Starter (US$ 7, sempre ligado, recomendado)
   ou free com um "pinger" externo (US$ 0)? O free tem 0,1 de CPU, e a Render
   pode reiniciar o serviço quando quiser. A sessão volta sozinha (T4), mas
   pode haver minutos sem conexão.
2. **Site:** continua como Web Service free separado? A recomendação é sim.
   Ele dormir só atrasa a primeira abertura da tela e não perde dado.
3. **Evolution como alternativa:** manter o caminho da Evolution atrás da
   variável até o motor provar estabilidade (T8 depois)? A recomendação é sim.
