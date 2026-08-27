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
- **A visita expira em 30 minutos** (`IMPERSONATION_TTL_SECONDS`), prazo
  absoluto que o refresh não estende.
- **O próprio cliente enxerga quem entrou**, em Configurações → "Acessos do
  suporte à sua conta".

## Prazo da visita

O caso de uso é dar suporte, não trabalhar dentro da conta alheia por horas.
Passado o prazo é só entrar de novo pela administração — o que gera um novo
registro, deixando visível quanto tempo alguém realmente passou lá dentro em
vez de uma única entrada aberta indefinidamente.

O prazo (`impersonationExpiresAt`, em segundos desde a época) viaja no token
e é verificado em **dois** lugares, de propósito:

- **`JwtStrategy.validate`**, ou seja, em toda requisição autenticada. Só
  checar no refresh não bastaria: um access token já emitido continuaria
  valendo até o próprio vencimento dele (até 15 min), mantendo a sessão viva
  dentro do cliente depois do prazo.
- **No refresh**, que recusa uma visita vencida e, quando ela ainda vale,
  **carrega adiante o mesmo prazo original** em vez de criar um novo.

Um token marcado como impersonação **sem** prazo é tratado como já vencido —
a ausência do campo nunca significa "acesso ilimitado".

## Transparência para o cliente

`GET /organizations/current/support-accesses` devolve, escopado pela própria
organização, quem da plataforma entrou na conta e quando. Aparece em
Configurações.

Isto existe porque um acesso aos dados de alguém que só quem acessou
consegue revisar não é transparência de verdade. Não há notificação por
e-mail: o projeto não tem infraestrutura de envio (a recuperação de senha
devolve o token direto em dev), e um aviso que não é enviado de verdade seria
só fachada.

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

- **A auditoria registra a entrada, não cada ação feita lá dentro.** As ações
  em si já são auditadas pelos mecanismos das fases anteriores (venda,
  status de lead), e ficam atribuídas ao operador — mas ações sem auditoria
  própria não ganham uma só por serem feitas em impersonação.
- **Sem notificação ativa ao cliente.** Ele consegue ver os acessos, mas não
  é avisado quando um acontece. Depende de infraestrutura de e-mail, que o
  projeto ainda não tem.
- **Só um nível de operador.** Não há distinção entre suporte, faturamento e
  engenharia — quem é operador vê e faz tudo. Não implementado por ser
  especulativo enquanto a operação é de uma pessoa só: uma hierarquia de
  permissões que ninguém usa é complexidade sem contrapartida. O dia em que
  houver equipe, o lugar natural é trocar o booleano `isPlatformAdmin` por
  um enum de papel.
- **O aviso de expiração não aparece na tela.** A sessão simplesmente para de
  valer aos 30 minutos e a próxima ação cai no login; não há contagem
  regressiva avisando que o prazo está acabando.
