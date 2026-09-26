# Contexto do projeto

Registro cumulativo do que foi feito em cada rodada. Só se adiciona; nada é apagado.

---

## 2026-09-26 — Supabase, deploy no Render e backend unificado

### Banco no Supabase
- `DATABASE_URL` aponta para o Session pooler do Supabase (`aws-0-us-east-2`, Ohio), com `connection_limit=5`.
- As 32 migrations foram aplicadas no Supabase.
- `docker-compose.yml` passou a ler o banco do `.env`, e o backup passou a usar `postgres:17`.
- Pendente (Supabase): desativar a Data API em Project Settings → Data API.

### Deploy no Render
- O build da API roda `prisma generate && nest build`: sem isso o build nativo do Render falhava com 118 erros de tipo.
- Serviços:
  - `crm-timeless`: backend, Starter (US$ 7).
  - Site: Web Service free.
  - Redis: Key Value free.
- `NODE_VERSION=22` é obrigatório: o Baileys é ESM e só carrega via `require` no Node 22.12+.

### Uso interno
- Produção não exige mais SMTP. Com `EMAIL_TRANSPORTE=registro`, o link de recuperação de senha aparece no log da API.
- O cadastro público fecha em **4 contas** (`LIMITE_DE_USUARIOS` em `auth.service.ts`). O limite só vale em produção.

### Backend num processo só (worker + WhatsApp dentro da API)
- **Worker:** o `WorkerModule` é importado pelo `AppModule`.
  - Saíram `worker/main.ts`, `start:worker` e o serviço `worker` do compose.
- **Evolution API removida.** O WhatsApp por QR Code roda com o Baileys `6.7.24` em `integrations/whatsapp/motor-whatsapp.ts`.
  - **Sessão:** fica na tabela `sessoes_whatsapp`, cifrada com `TOKEN_ENCRYPTION_KEY` e com RLS ligado. É reaberta sozinha quando a API sobe.
  - **Eventos:** saem do motor no formato antigo da Evolution (`evento-do-motor.ts`) e entram em `enqueueEvolutionEvent`, então o parser e a ingestão não mudaram.
  - **`libsignal`:** forçado para `6.0.0` do npm (`overrides` no `pnpm-workspace.yaml`). O pnpm 11 bloqueia a versão que vem do git.
  - **Nomes:** o enum `provider = EVOLUTION` ficou e significa "conexão por QR Code".
- Plano e tarefas em `tasks/plan.md` e `tasks/todo.md`.

### Ambiente local
- O disco D: é exFAT, sem links simbólicos. Para instalar: `pnpm install --config.node-linker=hoisted`.
- Os testes rodam sem o pnpm: `node ../../node_modules/jest/bin/jest.js <spec>` dentro de `apps/api`.

### Verificação da unificação (2026-09-26)
- `tsc` sem erros. 56 testes em 7 suítes passaram, incluindo o `evento-do-motor.spec.ts` (novo).
- QR Code real gerado pelos servidores do WhatsApp com Baileys 6.7.24 + `libsignal@6.0.0` do npm.
- Pendente: commit/push e aceite no Render (tasks/todo.md, Checkpoints 1 e 2).

### Plano: link externo para o cliente conectar o WhatsApp (2026-09-26)
- Plano em `tasks/plan-link-whatsapp.md`, tarefas em `tasks/todo-link-whatsapp.md` (5 tarefas, 2 checkpoints).
- **Token:** aleatório, só o hash guardado no Redis, validade de 24 h e uso único.
- **Rota pública:** reaproveita `connectViaQrCode`/`getQrCode` e o componente `QrConnect`.
- Aguardando: validade, onde fica a página pública, quem gera o link.

### Correção do build no Render: ERR_PNPM_IGNORED_BUILDS (2026-09-26)
- O pnpm 11 exige decidir, pacote a pacote, se os scripts de instalação rodam.
- `baileys` e `protobufjs` foram negados no `allowBuilds` do `pnpm-workspace.yaml`: os scripts deles só conferem a versão do Node e avisam sobre versão.
- Foram removidas as duas linhas de espera que o pnpm tinha escrito no arquivo.
- Build do Render reproduzido numa cópia limpa no disco C: (`pnpm install --frozen-lockfile` + `pnpm --filter api build`), sem erro.
- A API compilada carrega o `baileys` e o `libsignal@6.0.0`.
