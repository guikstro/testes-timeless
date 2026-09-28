# CI e publicação

Dois fluxos no GitHub Actions, em `.github/workflows`.

## CI (`ci.yml`): todo envio e todo pull request

Um job, "Lint, tipos, testes, build e fumaça", com Postgres 16 e Redis 7 de
verdade como serviços:

1. Instala com `pnpm install --frozen-lockfile`. Um lockfile fora de sincronia falha aqui.
2. Lint da API, do site e da administração. Sem `--fix`: aponta, não corrige.
3. Tipos dos três apps e do pacote compartilhado.
4. Testes de unidade da API e do site.
5. Testes de integração da API, contra o banco: migrations, isolamento entre
   clientes, permissões, auditoria e as integrações com dublês da Meta.
6. Build dos três apps.
7. Fumaça: sobe a API e o site a partir do build e abre cada tela com uma
   sessão de verdade (`scripts/fumaca-das-telas.mjs`). Pega a tela que estoura
   ao renderizar, que nenhum dos passos anteriores vê.

Os valores de ambiente do CI são só de teste, escritos no próprio arquivo.
Nenhum segredo de produção é usado nem impresso.

## Produção (`producao.yml`): depois que a main muda

1. Espera o Render publicar o commit: a API e o site dizem qual commit está no
   ar em `/health/versao` e `/api/versao` (o Render preenche
   `RENDER_GIT_COMMIT` sozinho). Até 30 minutos.
2. Confere a produção de fora, como visitante: API saudável, entrada e
   cadastro abrindo, tela interna pedindo login, rota protegida recusando.
   Não cria conta nem mexe em dado.

Se o Render não publicar, o fluxo falha e diz para olhar Events no painel.

## O que precisa ser ligado fora do código

O CI só impede que algo quebrado chegue aos clientes depois destas duas chaves,
que ficam nas contas e não no repositório:

**GitHub, proteger a main.** Settings → Branches → Add branch ruleset (ou Add
rule) para `main` → marque "Require status checks to pass" e escolha
"Lint, tipos, testes, build e fumaça". Com isso, só entra na main um commit que
passou no CI.

**Render, publicar só o que passou.** Em cada serviço (`crm-timeless`, a API, e
`timeless-crm`, o site): Settings → Build & Deploy → Auto-Deploy → "After CI
Checks Pass". Assim o Render espera o verde do GitHub antes de publicar.

## Migrations

O build da API no Render aplica as migrations pendentes antes de subir
(`apps/api/scripts/migra-no-render.mjs`). O CI aplica as mesmas migrations num
banco vazio, então uma migration que não roda do zero falha aqui antes de
chegar à produção. Migrations só acrescentam; uma destrutiva exige estratégia de
transição, backup e rollback escrito antes.

## Rodar o mesmo aqui

```bash
pnpm --filter api exec eslint "{src,test}/**/*.ts" && pnpm --filter web lint && pnpm -r typecheck
```

```bash
pnpm --filter api test && pnpm --filter web test && pnpm --filter api test:e2e
```
