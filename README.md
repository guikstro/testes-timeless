# Tracking Platform (Meta Ads → WhatsApp → Venda)

Plataforma de tracking e atribuição de conversões: acompanha a jornada
anúncio → clique → WhatsApp → lead → qualificação → venda → receita →
Meta Conversions API. Ver o escopo completo e as regras do produto em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> **Status atual: Fases 1 (Fundação) e 2 (Tracking) concluídas.** Autenticação,
> organizações, isolamento multi-tenant, links rastreáveis e captura de
> cliques/UTMs estão implementados, testados e rodando via Docker. As demais
> fases (WhatsApp, atribuição, Meta Ads/CAPI, analytics) ainda não foram
> implementadas — ver `docs/FUTURE_IDEAS.md` e os stubs em
> `docs/ATTRIBUTION.md`, `docs/META_CAPI.md`, `docs/WHATSAPP.md` para o que
> está planejado em cada uma.

## Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Backend**: NestJS + TypeScript
- **Banco**: PostgreSQL + Prisma ORM (migrations versionadas)
- **Fila/cache**: Redis + BullMQ (worker dedicado, ainda sem processors)
- **Infra local**: Docker Compose

## Estrutura de pastas

```
tintim-clone/
├── apps/
│   ├── api/          # NestJS: auth, organizations, tracking, prisma schema/migrations
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── organizations/
│   │   │   ├── tracking-links/  # CRUD autenticado de TrackingLink (multi-tenant)
│   │   │   ├── tracking/        # GET /r/:code — redirecionamento público + captura de clique
│   │   │   ├── health/
│   │   │   ├── worker/       # entrypoint do processo worker (BullMQ)
│   │   │   └── common/       # prisma, guards, decorators, filters, logger
│   │   ├── prisma/           # schema.prisma, migrations/, seed.ts
│   │   └── test/             # testes e2e (Jest + Supertest)
│   └── web/           # Next.js: login/registro, shell autenticado, dashboard, links
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

Sobe Postgres, Redis, API (`:3001`), worker e web (`:3000`). A API roda as
migrations automaticamente (`prisma migrate deploy`) antes de iniciar.

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
(host) para não colidir com outros stacks locais. Ajuste em `docker-compose.yml`
e `.env` se preferir as portas padrão.

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
seções de WhatsApp e Meta Ads/CAPI já estão presentes no arquivo mas
**não têm efeito ainda** — a integração real chega nas Fases 3, 6 e 7.

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura geral, decisões técnicas, observabilidade, segurança
- [`docs/TRACKING.md`](docs/TRACKING.md) — links rastreáveis e captura de UTMs/IDs de mídia (Fase 2)
- [`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md) — motor de atribuição, regras de precedência (Fase 4)
- [`docs/WHATSAPP.md`](docs/WHATSAPP.md) — integração com WhatsApp (Fase 3)
- [`docs/META_CAPI.md`](docs/META_CAPI.md) — Meta Ads e Conversions API (Fases 6-7)
- [`docs/FUTURE_IDEAS.md`](docs/FUTURE_IDEAS.md) — ideias fora do escopo atual, deliberadamente não implementadas
