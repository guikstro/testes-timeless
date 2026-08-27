# Tracking Platform (Meta Ads → WhatsApp → Venda)

Plataforma de tracking e atribuição de conversões: acompanha a jornada
anúncio → clique → WhatsApp → lead → qualificação → venda → receita →
Meta Conversions API. Ver o escopo completo e as regras do produto em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> **Status atual: as 7 fases do escopo concluídas — Fundação, Tracking,
> WhatsApp, Atribuição, Qualificação e Venda, Meta Ads e Meta Conversions
> API — mais a Fase 8, que reformulou a integração de WhatsApp.**
> Autenticação, organizações, isolamento multi-tenant, links rastreáveis,
> captura de cliques/UTMs, conexão com WhatsApp **por QR Code ou pela Cloud
> API oficial** com **envio e recebimento** de mensagens, ingestão
> idempotente, o motor de atribuição first-touch,
> gatilhos configuráveis de qualificação/venda (com extração de valor e
> correção manual auditada), a sincronização de campanhas/ad sets/anúncios e
> gasto da Meta Ads (com tratamento de token expirado e rate limit), e o
> envio de eventos de Lead/Lead qualificado/Venda de volta para a Meta via
> Conversions API (deduplicado, com retry/backoff) estão implementados,
> testados e rodando via Docker — a jornada completa anúncio → clique →
> WhatsApp → lead → qualificação → venda → receita → Meta Conversions API
> está fechada de ponta a ponta. Ideias fora do escopo mínimo ficam em
> `docs/FUTURE_IDEAS.md`.

## Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Backend**: NestJS + TypeScript
- **Banco**: PostgreSQL + Prisma ORM (migrations versionadas)
- **Fila/cache**: Redis + BullMQ (worker dedicado — processa eventos do WhatsApp)
- **WhatsApp (QR Code)**: [Evolution API](https://doc.evolution-api.com) em container próprio
- **Infra local**: Docker Compose

## Estrutura de pastas

```
tintim-clone/
├── apps/
│   ├── api/          # NestJS: auth, organizations, tracking, whatsapp, leads
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── organizations/
│   │   │   ├── tracking-links/     # CRUD autenticado de TrackingLink (multi-tenant)
│   │   │   ├── tracking/           # GET /r/:code — redirecionamento público + captura de clique
│   │   │   ├── integrations/whatsapp/  # CRUD autenticado da conexão WhatsApp
│   │   │   ├── whatsapp-webhook/   # POST/GET /whatsapp-webhook — receptor público da Meta
│   │   │   ├── attribution/        # AttributionEngine — clique -> lead (first-touch)
│   │   │   ├── leads/              # leitura de leads (lista/detalhe com timeline + atribuição)
│   │   │   ├── health/
│   │   │   ├── worker/             # entrypoint do processo worker + processors (BullMQ)
│   │   │   └── common/       # prisma, guards, decorators, filters, logger, encryption, queue
│   │   ├── prisma/           # schema.prisma, migrations/, seed.ts
│   │   └── test/             # testes e2e (Jest + Supertest)
│   └── web/           # Next.js: login/registro, shell autenticado, dashboard, links, leads, integrações
├── packages/
│   └── shared/         # tipos/DTOs compartilhados entre frontend e backend
├── docs/                # documentação técnica detalhada por assunto
├── docker-compose.yml
└── .env.example
```

## Como rodar localmente

### Pré-requisitos

- Node.js 20+ e [pnpm](https://pnpm.io) (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker Desktop (para Postgres/Redis, ou para rodar o stack inteiro)

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha `JWT_SECRET` e `TOKEN_ENCRYPTION_KEY` com valores aleatórios reais
(não use os placeholders em produção):

```bash
openssl rand -base64 48   # para JWT_SECRET
openssl rand -hex 32      # para TOKEN_ENCRYPTION_KEY
```

`apps/api/.env` e `apps/web/.env` são symlinks para o `.env` da raiz — não
precisa duplicar nada.

### 2. Opção A — tudo via Docker Compose

```bash
docker compose up -d
```

Sobe Postgres, Redis, Evolution API (`:8080`, motor do WhatsApp por QR Code),
API (`:3001`), worker e web (`:3000`). A API roda as migrations
automaticamente (`prisma migrate deploy`) antes de iniciar.

> **Atenção ao alterar `prisma/schema.prisma` ou dependências:** os
> containers de dev montam o código do host como volume, mas o
> `node_modules` (onde o Prisma Client gerado mora) fica num volume anônimo
> separado para não ser sobrescrito. Um `docker compose down` comum
> **não remove esse volume**, então o container pode continuar rodando com
> um Prisma Client desatualizado mesmo depois de reconstruir a imagem. Se
> isso acontecer (erros de "Property X does not exist on type
> 'PrismaService'" dentro do container), rode:
> ```bash
> docker compose down -v && docker compose up -d --build
> ```
> Isso também apaga os dados do Postgres/Redis — rode o seed de novo depois.

### 2. Opção B — banco/fila em Docker, apps localmente (mais rápido para dev)

```bash
docker compose up -d postgres redis
pnpm install
pnpm --filter api prisma:migrate     # aplica migrations (prisma migrate dev)
pnpm --filter api prisma:seed        # cria organização + usuário de demonstração
pnpm dev:api     # terminal 1 — http://localhost:3001
pnpm dev:web     # terminal 2 — http://localhost:3000
```

Usuário de demonstração criado pelo seed:
`demo@tintim-clone.local` / `password123`.

### Portas

Por padrão a API/Postgres/Redis deste projeto usam `3001` / `5433` / `6380`
(host) para não colidir com outros stacks locais; a Evolution API usa `8080`.
Ajuste em `docker-compose.yml` e `.env` se preferir as portas padrão.

## Testes

```bash
pnpm --filter api test        # unitários (Jest)
pnpm --filter api test:e2e    # e2e (Supertest) — usa um schema Postgres isolado
                               # ("test") na mesma instância configurada em DATABASE_URL
pnpm --filter web typecheck
```

## Build

```bash
pnpm --filter api build
pnpm --filter web build
```

## Migrations

Migrations do Prisma ficam versionadas em `apps/api/prisma/migrations/`.
Nunca usar `prisma db push` como estratégia definitiva — toda mudança de
schema deve gerar uma migration:

```bash
pnpm --filter api exec prisma migrate dev --name <descricao>
```

Em produção/CI: `pnpm --filter api prisma:migrate:deploy`.

## Variáveis de ambiente

Ver [`.env.example`](.env.example) para a lista completa e comentada. As
variáveis de WhatsApp (`WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
já têm efeito (Fase 3), assim como as de Meta Ads e Conversions API
(`META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`,
`META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, Fases 6 e 7) — mas os valores
reais de cada organização (ad account, token, Pixel ID, token do
Conversions API) são informados pelas próprias telas de conexão, não lidos
dessas variáveis; elas servem para testes locais/seed.

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura geral, decisões técnicas, observabilidade, segurança
- [`docs/TRACKING.md`](docs/TRACKING.md) — links rastreáveis e captura de UTMs/IDs de mídia (Fase 2)
- [`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md) — motor de atribuição, regras de precedência (Fase 4)
- [`docs/WHATSAPP.md`](docs/WHATSAPP.md) — integração com WhatsApp (Fase 3)
- [`docs/QUALIFICATION.md`](docs/QUALIFICATION.md) — gatilhos, classificador, venda, correção manual (Fase 5)
- [`docs/META_ADS.md`](docs/META_ADS.md) — sincronização de campanhas, ad sets, anúncios e gasto da Meta Ads (Fase 6)
- [`docs/META_CAPI.md`](docs/META_CAPI.md) — envio de eventos de Lead/Lead qualificado/Venda para a Meta Conversions API (Fase 7)
- [`docs/FUTURE_IDEAS.md`](docs/FUTURE_IDEAS.md) — ideias fora do escopo atual, deliberadamente não implementadas
