# Arquitetura

## Visão geral (alvo final)

```
Frontend (Next.js)
      |
      v
Backend/API (NestJS)
      |
      +----------------------+
      |                      |
      v                      v
  PostgreSQL               Redis
   (Prisma)                  |
                              v
                           Workers (BullMQ)
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
        WhatsApp            Meta             Tracking
        Processing          CAPI             Engine
```

Este documento descreve tanto o que **já está implementado** (Fase 1) quanto
o que está **planejado** para as fases seguintes, deixando explícito qual é
qual — nada abaixo descreve comportamento que ainda não existe como se já
existisse.

## Implementado (Fase 1 — Fundação)

- **Multi-tenancy**: cada `Organization` tem N `Membership` (papel
  OWNER/ADMIN/MEMBER) ligando usuários a ela. **O isolamento nunca depende de
  um `organizationId` vindo do cliente** — toda rota autenticada extrai
  `organizationId` do JWT (`CurrentUser()`), e todo acesso a dados escopados
  por tenant usa esse valor diretamente na cláusula `where` do Prisma. Isso
  torna o vazamento entre tenants estruturalmente improvável, não apenas
  verificado — ver `apps/api/src/organizations/organizations.service.ts`.
- **Autenticação**: registro (cria organização + usuário OWNER na mesma
  transação), login, logout, refresh, esqueci/redefinir senha. Tokens de
  acesso (JWT, 15 min) e de refresh (JWT, 7 dias, hash SHA-256 persistido em
  `RefreshToken` para permitir revogação real no logout). Cada token carrega
  um `jti` único — necessário porque dois tokens emitidos no mesmo segundo
  para o mesmo usuário teriam o mesmo payload e colidiriam no índice único
  de `token_hash` (bug real encontrado e corrigido durante os testes e2e
  desta fase).
- **Sessão no frontend**: os tokens nunca ficam acessíveis a JavaScript no
  navegador. As rotas `/api/auth/*` do Next.js fazem proxy para o backend e
  gravam os tokens em cookies `httpOnly`; `middleware.ts` protege as rotas
  autenticadas redirecionando para `/login` quando não há sessão nenhuma.
  Quando o access token (15 min) expirou mas o refresh token (7 dias) ainda
  é válido, o próprio middleware chama `/auth/refresh`, rotaciona os dois
  cookies e injeta o novo access token no request corrente — sem isso, o
  usuário seria deslogado a cada 15 minutos mesmo com uma sessão válida.
- **Erros**: filtro global (`HttpExceptionFilter`) normaliza toda resposta de
  erro para `{ code, message }`, nunca vaza stack trace ao cliente.
- **Logs**: `StructuredLoggerService` emite JSON por linha. Convenção: nunca
  logar tokens, segredos ou corpo de mensagem — apenas identificadores
  estáveis (`tenant_id`, `lead_id`, `job_id`, `external_event_id`,
  `event_type`) quando esses campos existirem (a partir da Fase 3).
- **Docker**: `docker-compose.yml` sobe Postgres, Redis, API, um processo
  `worker` (ainda sem processors registrados) e o frontend — os quatro
  descritos no escopo mínimo de ambiente de desenvolvimento.

## Planejado (fases seguintes)

- **Fase 2 — Tracking**: `TrackingLink`, redirecionamento com registro de
  `TrackingClick`, captura de UTMs/`fbclid`/`ctwa_clid`/IDs de campanha.
- **Fase 3 — WhatsApp**: abstração `WhatsAppProvider` (Cloud API oficial
  e/ou QR Code, com riscos documentados), ingestão idempotente de eventos via
  fila, normalização de telefone, criação/atualização de `Lead`.
- **Fase 4 — Atribuição**: `AttributionEngine` isolado, com regras de
  precedência auditáveis (documentadas em `docs/ATTRIBUTION.md` quando
  implementado).
- **Fase 5 — Qualificação e venda**: classificador de mensagens
  (`ConversationClassifier`), detecção de venda, ajustes manuais auditados.
- **Fases 6-7 — Meta Ads e Conversions API**: sincronização de
  campanhas/conjuntos/anúncios/investimento e envio idempotente de eventos
  (Lead/QualifiedLead/Purchase) com `event_id`, retry e deduplicação.
- **Fase 8+ — Analytics, Leads, Links, Webhooks, exportação, hardening.**

## Decisões técnicas registradas

| Decisão | Razão |
|---|---|
| JWT de acesso curto (15 min) + refresh revogável em banco | Sessão "segura" sem precisar de um serviço de sessão separado; logout real (não apenas apagar o cookie) |
| `jti` único em todo token emitido | Evita colisão de hash quando dois tokens são emitidos no mesmo segundo (mesmo `iat`) |
| Tokens nunca expostos a JS no browser (cookies `httpOnly` via route handlers do Next) | Reduz superfície de XSS para roubo de sessão |
| `organizationId` sempre extraído do JWT, nunca de parâmetro de rota | Elimina uma classe inteira de IDOR por construção, não por checagem ad-hoc |
| Dinheiro: nenhum campo monetário ainda existe (chega na Fase 5/6) | Quando existir, será `Int` em centavos — nunca `Float` (ver regra do produto, seção 48) |
| Timestamps em UTC no banco | Conversão para timezone da organização acontece só na apresentação |
| Migrations versionadas (`prisma migrate dev`/`deploy`), nunca `db push` | Reprodutibilidade em qualquer ambiente novo |
| Testes e2e rodam em schema Postgres `test` isolado (`?schema=test`) | Nunca sobrescreve dados de desenvolvimento/seed ao rodar `pnpm test:e2e` |

## Segurança (validado nesta fase)

- Multi-tenant: teste e2e cobre que o token de uma organização nunca retorna
  dados de outra (`apps/api/test/app.e2e-spec.ts`).
- IDOR: não há endpoint que aceite um `organizationId`/`userId` de outro
  tenant como parâmetro — o escopo vem sempre do JWT.
- Segredos: `JWT_SECRET` e `TOKEN_ENCRYPTION_KEY` via variável de ambiente,
  nunca commitados (`.env` está no `.gitignore`).
- Senhas: bcrypt (12 rounds).
- Rate limiting, criptografia de tokens de integrações externas e assinatura
  de webhooks chegam junto com as fases que introduzem essas integrações
  (não há nada para proteger ainda).

## Pendências conhecidas

- Segundo fator na entrada — hoje a conta é protegida só por senha. Com o
  envio de e-mail funcionando, um código por e-mail já seria viável.
- Credenciais Meta (App ID/secret, token de sistema, ad account, pixel) e
  WhatsApp (Cloud API token, phone number id, verify token) — já existem
  como variáveis em `.env.example`, mas nenhuma integração ainda as consome.

## Envio de e-mail

O sistema fala com uma porta (`ProvedorDeEmail`), nunca com um fornecedor.
Dois adaptadores existem:

- `registro` escreve o e-mail no log e não entrega nada. É o de
  desenvolvimento, e substituiu um remendo pior: a rota de recuperação
  devolvia o token dentro da própria resposta HTTP.
- `smtp` entrega de verdade. SMTP e não a API de um serviço específico
  porque quase todo provedor (SES, Resend, Postmark, Mailgun) oferece SMTP,
  então trocar de fornecedor é mudar variável e não código.

A escolha é explícita, por `EMAIL_TRANSPORTE`, e não deduzida do ambiente:
deduzir significaria que uma variável esquecida troca o comportamento em
silêncio, e o silêncio aqui é não mandar o e-mail que alguém está esperando
para voltar a entrar na conta. Em produção, `confereAmbiente` recusa a subida
com o provedor de registro.

Nada é enviado no caminho da requisição. A mensagem já montada vai para uma
fila, e o worker entrega com retentativa e recuo. Um servidor de SMTP lento
não pode segurar a resposta de quem pediu recuperação de senha.

Três e-mails existem hoje, todos em texto puro, porque um e-mail de segurança
precisa chegar e ser lido em qualquer leitor:

- recuperação de senha, com link de uma hora e uso único;
- aviso de senha alterada, para o endereço da conta;
- aviso de e-mail alterado, para o endereço **antigo** — é o único canal que
  ainda alcança o dono legítimo depois de uma tomada de conta.

### Troca do e-mail de acesso

Pedir a troca não troca nada. O endereço novo fica guardado como pedido, e
só vira o login quando o link mandado **para ele** é aberto. Antes a troca
valia na hora, e um erro de digitação tinha consequência definitiva: a pessoa
não conseguia mais entrar, e a recuperação de senha ia para uma caixa que não
existe. Confirmar no destino é o que prova que ele é alcançável antes de tudo
depender dele.

A senha atual continua sendo exigida no pedido, porque a confirmação prova que
o endereço existe e não que quem pediu é o dono da conta.

Um pedido novo cancela o anterior, e trocar ou redefinir a senha cancela
qualquer pedido pendente: um pedido de troca esperando confirmação é
exatamente o rastro que alguém deixaria depois de invadir a conta, para levar
o login depois. Retomar a senha o desfaz.

A confirmação é POST, e a tela exige um clique. Varredor de link de provedor
de e-mail abre endereços sozinho: se abrir bastasse, a troca aconteceria antes
de a pessoa ver a mensagem.
