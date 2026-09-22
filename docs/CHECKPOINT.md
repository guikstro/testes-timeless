# Checkpoint: o estado real em 22 de setembro de 2026

Registro feito antes de começar o programa de endurecimento para produção.
Serve para duas coisas: comparar depois, e impedir que uma reescrita seja
justificada por um problema que não existe.

Tudo aqui foi medido, não estimado. Os comandos estão no fim.

## A base compila e passa

| | resultado |
|---|---|
| API, typecheck | limpo |
| API, lint | 0 erros, 3 avisos de variável não usada |
| API, build | ok |
| API, testes de unidade | **699** em 68 suítes |
| API, testes de integração | **105** em 10 suítes |
| Web, typecheck | limpo |
| Web, lint | limpo |
| Web, build de produção | ok |
| Web, testes | **38** em 4 suítes |
| Telas renderizando com sessão real | **20 de 20** (`pnpm fumaca`) |

Nenhuma dessas verificações roda sozinha: não há CI. Elas passam porque são
executadas à mão.

## O tamanho

| | |
|---|---|
| apps/api | 13.494 linhas, 192 arquivos |
| apps/web | 16.347 linhas, 187 arquivos |
| packages/shared | **1 linha** |
| Modelos no Prisma | 27 |
| Migrations | 27 |
| Rotas HTTP | 84 em 20 controllers |
| Telas | 22 |
| Arquivos de teste | 82 |

`packages/shared` existe e está vazio. Isso importa mais adiante.

## O que está forte

**Isolamento entre organizações.** É o ponto mais sólido da base. Só um lugar
lê `organizationId` vindo do cliente, o login, e ali ele é filtrado contra os
vínculos do próprio usuário. O padrão estabelecido é escopo dentro da consulta,
não conferência depois: `Ad` e `AdSet` não carregam organização e a busca desce
pela campanha. Um escopo esquecido não devolve nada; uma conferência esquecida
vaza.

Falta o que o plano pede: uma suíte que **tente** o acesso cruzado de propósito,
em todas as entidades, e exija 403 ou 404.

**Sessão.** JWT curto com refresh rotativo, refresh guardado com hash, cookies
httpOnly, bcrypt, revogação, recuperação de senha e confirmação de troca de
e-mail. A renovação silenciosa acontece no middleware do Next.

**Ambiente.** `confereAmbiente` impede a subida em produção se faltar variável
crítica, e recusa valores que parecem certos e não são, como um endereço
público apontando para localhost.

**Limite de requisições.** Throttler global com Redis, apertado rota a rota.
Rota nova nasce protegida.

## O que não existe

| pedido | estado |
|---|---|
| MFA/TOTP | **não existe nenhuma linha** |
| Tela de sessões ativas | não existe; os refresh tokens estão no banco, sem interface |
| Tela de auditoria | não existe; `AuditLog` é escrito em 2 serviços e nunca lido por tela |
| Sistema de capacidades (RBAC granular) | não existe; 3 papéis, verificações espalhadas |
| CI/CD | **nenhum workflow** |
| Error tracking (Sentry ou equivalente) | não existe; há uma rota `POST /telemetria/erro` e nada mais |
| E2E de frontend (Playwright) | não existe; só `scripts/fumaca-das-telas.mjs`, que confere se a tela renderiza |
| Billing / entitlements | não existe |
| Feature flags | não existe |

## O que está parcial

**Google.** Uma rota só (`GET /integrations/google/conversions`) e importação
e exportação por CSV. Não há API do Google Ads, e não há `docs/GOOGLE.md`. A
documentação não exagera a integração porque não documenta ela.

**Auditoria.** `AuditLog` recebe escrita em `organizations.service` e
`leads.service`. Não registra login, troca de senha, mudança de permissão nem
exportação. `MudancaNoAnuncio`, criada hoje, registra escrita na conta de
anúncios com ator, estado anterior e posterior, e é o formato que a auditoria
geral deveria seguir.

**Paginação.** 33 chamadas `findMany` nos serviços, 14 com `take`. As outras 19
precisam ser examinadas uma a uma: algumas são listas pequenas por natureza,
outras não.

**Design system.** 11 primitivos: `badge`, `button`, `card`, `copy-button`,
`count-up`, `delta`, `input`, `logo`, `pill-group`, `skeleton`, `sparkline`.
O plano pede 27. Faltam, entre outros, `Dialog`, `Select`, `Checkbox`, `Switch`,
`Tabs`, `Tooltip`, `Dropdown`, `Toast`, `DataTable`, `Pagination`,
`DateRangePicker`, `ConfirmationDialog`, `FormField` e `ErrorState`.

## Duplicação encontrada

**Dia civil.** A conversão de data para dia civil está reimplementada em pelo
menos oito arquivos, dos dois lados: `common/tempo.ts`, `common/expediente.ts`,
`budgets/calculo-da-verba.ts`, `analytics/gasto-por-dia.ts`,
`analytics/campaign-performance.ts`, `worker/processors/meta-sync.service.ts`,
e mais no web. É a regra mais delicada do produto, porque lead conta em Brasília
e gasto conta em UTC, e ela está espalhada.

`packages/shared` tem uma linha. É exatamente o lugar onde isso deveria morar.

**Formatação de moeda.** `lib/currency.ts` existe, e `Intl.NumberFormat` aparece
solto em outros quatro arquivos do web.

## Documentação

11 documentos, o mais antigo de 24 de agosto, o mais recente de 3 de setembro.
Faltam, dos que o plano pede: `SECURITY.md`, `DEPLOYMENT.md`,
`DISASTER_RECOVERY.md`, `ROADMAP.md` e `docs/adr/`.

`ARCHITECTURE.md` é de 3 de setembro e não cobre nada das fases posteriores:
caixa de entrada, verba, controle de escrita, saúde da conta, conferência do
webhook da Evolution.

## A administração hoje

`/admin` é um grupo de rotas **dentro do mesmo aplicativo web**, na mesma
origem, com o mesmo cookie de sessão do cliente. A proteção é toda do lado da
API: `PlatformAdminGuard` lê o nível do operador **do banco a cada
requisição**, e não de uma claim do token, para revogação ter efeito imediato.
Ele também recusa uma sessão que já está impersonando, o que impede encadear
impersonações.

A separação pedida é de rede e de origem, não de autorização: a autorização já
está no lugar certo.

## Como reproduzir

```bash
cd apps/api && pnpm typecheck && pnpm lint && pnpm build && pnpm test
cd apps/api && pnpm test:e2e
cd apps/web && pnpm typecheck && pnpm lint && pnpm build && pnpm test
node scripts/fumaca-das-telas.mjs
```

Os testes de integração precisam de Postgres e Redis no ar e usam um schema
separado (`test`), então não tocam os dados de desenvolvimento.
