# Administração da plataforma

> **Status: implementado (Fase 9).** Descreve o comportamento real do código
> em `apps/api/src/admin/`, `apps/api/src/common/guards/platform-admin.guard.ts`
> e `apps/web/src/app/admin/`.

## O problema que isto resolve

Todo o resto do sistema é estritamente escopado por `organizationId`: um
usuário só enxerga a própria organização, e isso é estrutural, não uma
verificação que dá para esquecer. Mas quem opera a plataforma precisa
justamente do contrário — ver todos os clientes e entrar em um deles para dar
suporte.

Em vez de espalhar um "modo especial" pelos serviços existentes (o que
enfraqueceria o isolamento em todo lugar), a travessia entre organizações
fica **isolada num único módulo**, atrás de um guard próprio. Nenhum outro
serviço do sistema sabe que operadores existem.

## Dois níveis de permissão, não um

| | `MembershipRole` (OWNER/ADMIN/MEMBER) | `User.isPlatformAdmin` |
|---|---|---|
| Escopo | Dentro de **uma** organização | A plataforma inteira |
| Quem concede | O dono da organização | Só por script no servidor |
| Permite | Agir na própria organização | Listar e entrar em **qualquer** cliente |

São eixos independentes: um operador da plataforma pode não ter Membership
nenhuma, e um OWNER de organização não vira operador por isso.

## Como alguém vira operador

```bash
pnpm --filter api grant:admin email@da.pessoa
pnpm --filter api grant:admin email@da.pessoa --revoke
```

Deliberadamente **não existe rota HTTP** que promova alguém a operador — nem
uma protegida. Virar operador dá acesso aos dados de todos os clientes, então
a única porta é ter acesso ao servidor, que quem faz isso já tem de qualquer
forma.

## Entrar num cliente

```
/admin  →  "Entrar"
   |
   v
POST /api/admin/organizations/:id/impersonate   (guard: JwtAuthGuard + PlatformAdminGuard)
   |
   v
1. registra IMPERSONATION_STARTED no AuditLog
2. emite um par de tokens: sub = OPERADOR, organizationId = CLIENTE, impersonating = true
   |
   v
o route handler do Next guarda a sessão do operador em cookies `admin_*`
e sobrescreve a sessão principal com os tokens do cliente
   |
   v
recarregamento completo → shell do cliente, com aviso amarelo no topo
```

### Por que o `sub` continua sendo o operador

O token emitido aponta para a organização do cliente, mas o dono dele
continua sendo o operador — nunca um usuário do cliente. É isso que faz
qualquer alteração feita ali dentro (corrigir uma venda, por exemplo) ser
gravada no `AuditLog` com o nome de **quem realmente agiu**, em vez de
parecer que o próprio cliente fez.

### Acesso total, e o que o torna aceitável

O operador entra como `OWNER`, com permissão de editar. Isso é deliberado:
uma ferramenta de suporte que só lê não consegue consertar nada. O que
mantém isso sob controle não é um papel reduzido, e sim:

- **Aviso permanente e não-fechável** no topo de todas as telas, dizendo em
  qual cliente você está e que tudo ali altera os dados dele.
- **Todo acesso registrado**, sem exceção, visível em `/admin/acessos`.
- **A auditoria é gravada antes do token ser emitido**: se o registro falhar,
  o acesso não acontece. Um acesso sem rastro é pior que um acesso negado.

## Detalhes de segurança que não são óbvios

- **A flag é lida do banco a cada requisição**, não do JWT. Revogar um
  operador precisa valer na hora; se viesse do token, ele continuaria
  entrando em qualquer cliente até o token expirar (até 15 minutos depois).
- **A marca de impersonação sobrevive ao refresh.** Se ela se perdesse na
  renovação do token, o operador acabaria com uma sessão *comum* dentro do
  cliente — sem o aviso na tela e sem rastreabilidade. Coberto por teste.
- **Não é possível encadear impersonações.** De dentro de um cliente, as
  rotas de administração respondem `ALREADY_IMPERSONATING`: para trocar de
  cliente é preciso sair primeiro, o que mantém "quem está onde" legível.
- **Sair da conta limpa também os cookies `admin_*`.** Deixá-los para trás
  manteria um acesso válido a todos os clientes na máquina de quem achou que
  tinha saído.
- **Se a sessão de operador expirar** enquanto ele está dentro do cliente,
  "sair" limpa tudo e manda para o login, em vez de deixar a pessoa presa
  numa impersonação sem saída.

## Limitações conhecidas (deliberadas)

- **Não há fim de sessão de impersonação por tempo.** Ela dura o que durar a
  sessão normal. Um limite curto (ex.: 30 min) seria uma melhoria natural.
- **A auditoria registra a entrada, não cada ação feita lá dentro.** As ações
  em si já são auditadas pelos mecanismos das fases anteriores (venda,
  status de lead), e ficam atribuídas ao operador — mas ações sem auditoria
  própria não ganham uma só por serem feitas em impersonação.
- **Não há aviso ao cliente** de que alguém entrou na conta dele. Vários
  produtos notificam; aqui a transparência é interna.
- **Só um nível de operador.** Não há distinção entre suporte, faturamento e
  engenharia — quem é operador vê e faz tudo.
