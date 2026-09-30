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

### Gestão de clientes e link externo do WhatsApp (2026-09-26)
Decisões do usuário: a gestão fica na aba Clientes do painel da plataforma; "Novo cliente" cria só a organização; o link vale 24 h.

**API**
- `POST /admin/organizations`: cria cliente.
- `GET /admin/organizations/:id/whatsapp`: status do WhatsApp do cliente.
- `POST /admin/organizations/:id/whatsapp/link`: gera o link.
- `POST /admin/organizations/:id/whatsapp/desconectar`: desconecta.
- `GET /api/publico/whatsapp/:token`: rota pública, com limite de 30/min (`LINK_PUBLICO`).
- `LinkDeConexaoService` (Redis):
  - só o hash do token é guardado;
  - vale 24 h e é de uso único;
  - um link por organização;
  - organização já conectada não reinicia o QR.
- `slugLivre()` extraído do cadastro e reaproveitado na criação de cliente.

**Admin (apps/admin)**
- O nome do cliente na lista abre `/clientes/[id]` (status, número, gerar/copiar link, desconectar).
- A página atualiza sozinha a cada 5 s enquanto espera a leitura do QR.
- Novo: `/clientes/novo`.

**Site (apps/web)**
- Página pública `/conectar-whatsapp/[token]` (sem login, `referrer: no-referrer`, noindex) e proxy `/api/publico/whatsapp/[token]`.
- Assinatura VIGO adicionada em `app/page.tsx`.

**Verificação**
- `tsc` da API, do site e do admin sem erro.
- 67 testes passaram, com 6 novos em `link-de-conexao.service.spec.ts`: hash, isolamento entre clientes, uso único e invalidação do link anterior.

**Pendente no Render**
- Apagar o serviço "CRM TMLSS-work" (worker antigo).
- Publicar o admin como Web Service free.
- Criar o operador com `grant:admin` e ativar o MFA.

### Clientes dentro do site principal (2026-09-26)
Decisão do usuário: a lista de clientes fica no site (web), e não no painel admin separado. A equipe Timeless abre a lista clicando no bloco da organização no menu.

**Site (apps/web)**
- `app-nav.tsx`:
  - para operadores, o bloco com o nome da organização é um link para `/clientes`;
  - o item "Administração", que apontava para outra origem, virou "Clientes" (`/clientes`).
- As páginas `/clientes/[id]`, `/clientes/novo` e `actions.ts` foram movidas do admin para `web/src/app/(app)/clientes` com `git mv`.
- `/clientes` (novo): lista com a cor do cliente, o nome clicável e o status do WhatsApp. Busca e botão "+ Novo cliente".
- Um 403 da API (sem ser operador, ou sem verificação em duas etapas) aparece como mensagem na página.
- Novo cliente pede **nome e cor** (`<input type="color">`), com prévia de como o cliente aparece no menu.
- A página do cliente mostra o nome com a cor e ganhou "Entrar no painel do cliente": a ação `entra` gera o código e redireciona para `/entrar-como`. Isso troca a sessão do navegador.
- `middleware.ts`: `/clientes` protegido.

**API**
- `CriaClienteDto.cor` (`#rrggbb`), gravada em `brandColor`.
- `criaCliente` recusa cor já usada por outro cliente ativo (409 `COR_EM_USO`). Há teste para isso.
- `exigeCliente` devolve `brandColor`.

**Admin (apps/admin)**
- Voltaram a ser removidos o link no nome do cliente e o botão "Novo cliente", porque as páginas agora estão no site.

**Pré-requisito:** o usuário Timeless precisa de `platformRole` (`pnpm --filter api grant:admin <email>`) e da verificação em duas etapas ativa (Configurações → Segurança). Sem isso, a API recusa com 403.

### Tela inicial depois do login (2026-09-26)
- `app/page.tsx` escolhe o destino: operador da plataforma (fora de um cliente) vai para `/clientes`; os outros usuários, para `/dashboard`. Se a sessão falhar, vai para `/dashboard`, que renova a sessão ou manda ao login.
- `login-form.tsx`: depois do login (e do código de duas etapas), vai para `/` em vez de `/dashboard`. O `?next=` continua valendo.
- "Entrar no painel do cliente" (`/entrar-como`) continua abrindo o `/dashboard` do cliente.

### Operador da plataforma sem o Shell do Render (2026-09-26)
- O plano do Render não dá acesso ao Shell. Em vez do `grant:admin`, rodei direto no Supabase via `psql`: `update users set platform_role = 'ADMIN' where email = 'mozyc.art@gmail.com'`.
- Única conta existente: `mozyc.art@gmail.com` → ADMIN. A verificação em duas etapas ainda não está ativa, e o usuário precisa ativar em Configurações → Segurança.

### Toda conta nova nasce operadora da plataforma (2026-09-26)
- Pedido do usuário: toda conta criada deve ser admin; depois essa pessoa adiciona outras e dá cargos.
- `auth.service.ts` (`register`): `user.create` com `platformRole: "ADMIN"`. O teste do cadastro confere isso.
- O que segura o acesso: o limite de 4 contas e a verificação em duas etapas, que o `PlatformAdminGuard` exige.
- Lacuna encontrada: não existe "adicionar pessoa". A aba Equipe só lista, muda cargo e remove. Hoje conta nova só nasce pelo `/register`, que também cria uma organização nova. Isso fica para uma próxima tarefa, se o usuário quiser.

### Área da Timeless separada da área do cliente (2026-09-26)
"Área da Timeless" é o operador da plataforma fora de um cliente (`platformRole && !impersonating`).

**Área da Timeless**
- Menu (`app-nav.tsx`, `ITENS_DA_TIMELESS`): só **Clientes**, **Relatório geral** e **Configurações**.
- Configurações (`settings/page.tsx`): só as abas **Equipe, Aparência e Segurança**, com a Equipe aberta por padrão.
- Barra do topo (`layout.tsx`): sem o aviso do WhatsApp, porque o WhatsApp que importa é o de cada cliente.
- **Relatório geral** (novo, `/relatorio-geral`): totais de clientes, WhatsApp conectado, leads, vendas e receita. Tabela por cliente, ordenada por receita, com conversão.
  - Usa `GET /admin/organizations`, sem endpoint novo.
  - Os números são de todo o histórico; não há filtro por período.

**Dentro do cliente** (depois de "Entrar no painel do cliente")
- O menu completo do cliente, como antes.
- As Configurações perdem Equipe, Aparência e Segurança: ficam Operação e Auditoria.

`middleware.ts` protege `/relatorio-geral`.

### Link do WhatsApp abria "Cannot GET" (2026-09-26)
- Causa: no Render, o `WEB_APP_URL` da API apontava para a própria API (`crm-timeless.onrender.com`). O link é montado com `enderecoDaAplicacao()`, que é a primeira origem do `WEB_APP_URL`.
- Correção (configuração, sem código): `WEB_APP_URL=https://timeless-crm.onrender.com`, que é o site Next. Também corrigido no `.env` local.
- Conferido no site: a página `/conectar-whatsapp/<token>` responde 200, e o proxy `/api/publico/whatsapp/<token>` com token inválido responde 404 `LINK_INVALIDO`.

### "Entrar no painel do cliente" ia para localhost:10000 com entrada-expirada (2026-09-26)
- O erro `isFeatureEnabled` vinha de `chromewebdata`, a página de erro do próprio Chrome. Não é do sistema.
- **Causa 1:** atrás do proxy do Render, `request.url` é `http://localhost:10000`. Redirecionamentos com `new URL(..., request.url)` mandavam o navegador para lá.
  - Correção: `lib/redireciona.ts` (`Location` relativo), usado em `entrar-como/route.ts` e no redirecionamento ao login do `middleware.ts`.
- **Causa 2:** a server action `entra` fazia `redirect()` para um route handler. O Next busca a rota por dentro e depois faz a navegação completa, o que dá **duas visitas**: a primeira gastava o código de uso único e a segunda caía em "entrada-expirada".
  - Correção: `entra` devolve `{ destino }`, e o botão faz `window.location.assign(destino)`, uma visita só.

### Pessoas com acesso a um cliente e a áreas específicas (2026-09-26)
Decisões do usuário: convite por link, um cliente por pessoa, cadastro público fechado. Plano em `tasks/plan-equipe.md`.

**Banco**
- Migration `20260926140000_areas_do_vinculo`: nova coluna `memberships.areas text[]`, que vale só para MEMBER.
- Os MEMBER que já existiam receberam todas as áreas.

**API**
- A permissão é conferida na API: `@Areas(...)` nos controllers, checado no `JwtAuthGuard`.
  - A rota aceita quem tiver **qualquer uma** das áreas listadas.
  - O `JwtStrategy` carrega `areas` do vínculo a cada requisição, só para MEMBER. Sem vínculo, a sessão cai na hora.
  - Mapa rota → áreas: `tasks/plan-equipe.md`.
- Convites (`auth/convites`, Redis): guarda só o hash do token, vale 72 h, uso único (`GETDEL`).
  - Um convite da equipe Timeless cria a conta com `platformRole` ADMIN.
  - Um convite para cliente cria a conta como MEMBER, com as áreas marcadas.
  - Rotas: `POST /admin/convites`, `GET/POST /publico/convites/:token`, `GET/DELETE /admin/organizations/:id/pessoas[/:userId]`. A remoção encerra as sessões da pessoa naquele cliente.
- Cadastro: em produção, só a primeira conta de todas pode usar o `/register` (`CADASTRO_FECHADO`). A constante `LIMITE_DE_USUARIOS` foi removida.
- `/auth/session` devolve `areas`.
- Testes novos: `jwt-auth.guard.spec.ts` (4) e `convites.service.spec.ts` (5), mais um caso de MEMBER no `jwt.strategy.spec.ts`.

**Site**
- `lib/areas.ts`: a lista de áreas (`podeVer`, `telaInicial`, `rotuloDaArea`).
- O menu filtra pelas áreas da pessoa. A tela inicial leva à primeira área permitida.
- Configurações para MEMBER: Segurança sempre; Operação só se tiver a área de configurações.
- Equipe (área da Timeless): novo card "Adicionar pessoa" (`adicionar-pessoa.tsx`, `convite-actions.ts`). O link gerado aparece com botão de copiar.
- `/convite/[token]` (público, `no-referrer`) e o proxy `/api/convites/[token]`, que grava a sessão ao aceitar.
- Página do cliente: "Pessoas com acesso", com botão para remover.
- Login: o link "Criar organização" virou "Peça um convite à equipe Timeless".

### "Encerrar visita" volta para a Timeless, e exclusão de cliente (2026-09-26)
**Encerrar visita**
- Antes fazia logout e mandava ao login.
- `entrar-como/route.ts` guarda o refresh da Timeless em `admin_refresh_token` (cookie httpOnly que já existia, reaproveitado).
- A nova rota `api/auth/encerrar-visita` revoga a sessão do cliente na API, devolve o refresh da Timeless e responde `{ destino: "/clientes" }`. O middleware renova a sessão ao carregar.
- Sem sessão guardada (entrou antes desta mudança), é um logout comum.

**Excluir cliente**
- API: `POST /admin/organizations/:id/excluir`, só para ADMIN, com limite `CREDENCIAL` (10 tentativas em 5 min).
- Exige a frase exata "Quero excluir o <nome>" (espaços normalizados). A frase é conferida **antes** do código, para um erro de digitação não gastar o código.
- Depois, o código de duas etapas (`MfaService.confereSegundoFator`, que também aceita código de recuperação).
- Efeitos: desconecta o WhatsApp, encerra o link de conexão, `organization.deletedAt = agora` (os dados ficam no banco) e derruba as sessões naquela organização. Fica registrado na auditoria.
- Não deixa excluir a conta da própria equipe.
- Teste: `admin/exclui-cliente.spec.ts` (4 casos).
- Site: bloco "Zona de perigo" (`excluir-cliente.tsx`) na página do cliente. O botão só libera quando a frase bate e o código tem 6 dígitos. Depois de excluir, volta para `/clientes`.

### Toda conta cadastrada nasce ADMIN, de novo (2026-09-28)
- O commit `cb963e5` tinha deixado só a primeira conta da instalação como operadora. As outras nasciam como cliente comum.
- `auth.service.ts` (`register`): `platformRole: "ADMIN"` para toda conta. O teste do cadastro confere isso.
- `register/page.tsx`: depois do cadastro vai para `/`, igual ao login. Assim o ADMIN cai em `/clientes`, e não no `/dashboard` do cliente.
- Depois, o ADMIN adiciona clientes e pessoas pelos convites (Configurações → Equipe).

### Cadastro nunca vira operador; a equipe é avisada de toda conta nova (2026-09-29)
- Decisão do usuário: operador da plataforma só por convite de quem já é administrador. O cadastro continua aberto, mas cria conta comum, com a própria organização.
- `auth.service.ts` (`register`): `platformRole: null` sempre, nem a primeira conta. Substitui a regra de 2026-09-28 acima, que deixava qualquer pessoa que chegasse à página de cadastro virar operadora e, ligando o próprio segundo fator, ver todos os clientes.
- Toda conta nova avisa a equipe: notificação `conta.nova` na organização cujo dono é administrador da plataforma, e e-mail ao dono (`novaContaCadastrada` em `common/email/mensagens.ts`). O aviso nunca impede o cadastro.
- O e-mail só sai com SMTP configurado na API (`EMAIL_TRANSPORTE=smtp` e as variáveis `SMTP_*`, `EMAIL_REMETENTE`).
- De quebra: o filtro "Sistema" da tela de notificações pedia `sistema.erro`, que a API recusava; a lista de tipos aceitos agora tem `sistema.erro` e `conta.nova`.
- Testes: `auth.service.spec.ts` (nunca operador, aviso no sino e por e-mail, aviso que falha não impede o cadastro) e `admin.e2e-spec.ts` (conta nova barrada na administração; a equipe recebe o aviso e o cliente não).

### Funil com recortes (item 13) (2026-09-30)
- A aba Funil do dashboard mostra leads, contatados, qualificados, reunião marcada e vendas, com a conversão de cada passagem, a conversão total, quem ficou em cada etapa (em aberto e perdidos) e os motivos de perda.
- Recortes por campanha, origem e responsável, na URL. O período continua no seletor do cabeçalho, e trocar de período mantém os recortes.
- API: `GET /analytics/funil` (`analytics/funil.ts` e `AnalyticsService.funil`). Regra completa em `docs/QUALIFICATION.md`, "Funil do dashboard".
- "Negociação" aparece como Reunião marcada, o nome que ficou no item 14.
- Se a consulta do funil falhar, só a aba mostra o aviso; o resto do painel continua.
- Testes: `funil.spec.ts` (API, 22 casos), `funil.e2e-spec.ts` (banco de verdade: campanha pelo anúncio, resposta da equipe como contato, recortes e validação), o isolamento entre contas passou a ler o funil, e `conclusao.spec.ts` no site.

### Meta: limite de uso deixa o motivo na tela (2026-09-30)
- Sintoma: token da Ferrovia colado e aceito, mas "Meta ainda sem dado" e nenhuma campanha. A tela é a de uma conexão salva cuja primeira sincronia nunca terminou, sem erro gravado.
- O único caminho que chegava nesse estado sem erro era o limite de uso da Meta (e a sincronia interrompida no meio). O limite deixava o status como estava e não gravava motivo nenhum.
- Agora o limite grava o motivo em `lastSyncError` (status continua conectado, a retentativa segue, sem aviso no sino), e a tela de integração mostra como aviso. Os códigos 80000 a 80014 (limite por conta de anúncios da API de Marketing) passaram a contar como limite.
- As listas da Meta pedem 500 itens por página e os números por anúncio, 100, em vez dos 25 padrão: menos chamadas contadas no limite.
- A Saúde da plataforma lista a conta "limitada pela Meta" e a "primeira sincronia não terminou" (15 minutos depois de conectar), que antes apareciam como sincronizando.
- Conta sem nenhuma sincronia ganhou uma instrução na tela de integração: pode levar alguns minutos; passando de 10, clicar em Sincronizar agora.
