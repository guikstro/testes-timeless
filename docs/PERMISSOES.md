# Permissões

Quem pode o quê numa conta é decidido num lugar só:
`apps/api/src/common/permissoes/capacidades.ts`.

## Como funciona

- **Capacidade** é uma coisa que se faz: `lead.read`, `ad.manage`, `audit.read`.
  A lista completa, com o que cada uma quer dizer, está em `CAPACIDADES`.
- **Rota** declara a capacidade que exige com `@Requer("lead.read")`. O
  `JwtAuthGuard` confere.
- **Serviço** que precisa conferir no meio da regra usa `exige(quem, "owner.manage")`.
- **Papel** diz o que a pessoa pode (`PAPEIS`):
  - `OWNER`: tudo.
  - `ADMIN`: tudo, menos mexer em donos (`owner.manage`) e na cobrança (`billing.manage`).
  - `MEMBER`: só o que as áreas escolhidas para ele liberam (`AREAS_CONCEDEM`).
- **Site** não repete regra nenhuma. A sessão (`GET /auth/session`) traz
  `capacidades`, e a tela pergunta por elas (`apps/web/src/lib/permissoes.ts`)
  para esconder o que a pessoa não conseguiria fazer.

Ninguém decide permissão comparando o papel de quem age (`role === "ADMIN"`)
fora de `capacidades.ts`. Comparar o papel do alvo continua valendo, como em
"esta pessoa é dona?", porque isso é dado e não permissão.

## Áreas e capacidades

A área é o que se marca ao convidar alguém para um cliente. Cada uma libera:

| Área | Capacidades |
|---|---|
| Dashboard | `analytics.read` |
| Conversas | `conversation.read`, `conversation.reply`, `lead.read`, `lead.manage` |
| Leads | `lead.read`, `lead.manage`, `conversation.reply` |
| Campanhas | `analytics.read` |
| Verba | `analytics.read`, `budget.read`, `budget.manage`, `ad.read`, `adaccount.read` |
| Links | `link.read`, `link.manage` |
| Integrações | `integration.read`, `integration.manage`, `campaign.read`, `campaign.manage`, `spend.read`, `adaccount.read`, `data.export` |
| Relatório | `analytics.read`, `spend.read` |
| Configurações | `settings.read`, `settings.manage`, `member.read`, `support_access.read` |

Nenhuma área libera `ad.manage`, `apikey.manage`, `member.manage`,
`owner.manage`, `audit.read` ou `billing.manage`. Pausar anúncio, gerar chave
do Google Ads, mexer na equipe e ler a auditoria são de quem responde pela conta.

## Criar um papel novo

Por exemplo `VIEWER`, `MANAGER`, `MEDIA`, `SALES` ou `SUPPORT`:

1. Acrescentar o valor ao enum `MembershipRole` no `schema.prisma`, com migration
   (`ALTER TYPE "MembershipRole" ADD VALUE 'VIEWER'`).
2. Dizer em `PAPEIS` o que ele pode: uma lista fixa, as áreas, ou as duas coisas.
3. Dar nome e explicação ao papel em `apps/web/src/app/(app)/settings/papeis.ts`
   e aceitá-lo em `update-member.dto.ts`.

Nenhuma rota muda.

## O que os testes garantem

- `capacidades.spec.ts`: para todo papel e toda área, a central dá o mesmo
  acesso que as regras espalhadas davam antes dela.
- `toda-rota-declara.spec.ts`: falha se aparecer uma rota logada sem `@Requer`,
  a não ser que o motivo esteja escrito no teste.
- Recusas mantêm os códigos que já existiam: `SEM_ACESSO_A_AREA` quando uma área
  resolveria, e `AUDITORIA_RESTRITA`, `SEM_PERMISSAO`, `FORBIDDEN` ou
  `OWNER_REQUIRED` quando é o papel que não permite.
