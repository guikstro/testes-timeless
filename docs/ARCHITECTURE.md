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

- Envio real de e-mail (recuperação de senha) — hoje `forgotPassword` retorna
  o token diretamente na resposta quando `NODE_ENV !== production` (modo dev)
  e não envia nada em produção até um `EmailProvider` real ser configurado.
  Precisa de credenciais de um provedor (SMTP, Resend, SES etc.) para ligar
  em produção.
- Credenciais Meta (App ID/secret, token de sistema, ad account, pixel) e
  WhatsApp (Cloud API token, phone number id, verify token) — já existem
  como variáveis em `.env.example`, mas nenhuma integração ainda as consome.
