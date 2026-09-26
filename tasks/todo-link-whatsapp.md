# Tarefas: link externo para conectar o WhatsApp

Plano e decisões: [`plan-link-whatsapp.md`](plan-link-whatsapp.md).

Verificação (em `apps/api`): `node ../../node_modules/jest/bin/jest.js <spec>`,
`node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
No web: `pnpm --filter web typecheck`.

---

## Fase 1: o caminho completo

### [ ] T1: A equipe gera o link na tela de WhatsApp

**Descrição:** Criar o `LinkDeConexaoService` com Redis e TTL, no padrão do
`EntregaDeSessaoService`:
- `gera(organizationId)` devolve `{ url, expiraEm }` e guarda
  `hash(token) → organizationId`;
- `resolve(token)` devolve o `organizationId` ou null.

Adicionar a rota autenticada `POST /integrations/whatsapp/link`, só para
OWNER/ADMIN. Na tela de WhatsApp, um botão "Gerar link de conexão", o link
gerado com "Copiar" e a validade.

**Aceite:**
- [ ] O botão gera uma URL `/conectar-whatsapp/<token>` com a validade visível.
- [ ] MEMBER recebe 403.
- [ ] O Redis guarda só o hash do token.

**Verificação:**
- [ ] Spec do serviço: `resolve(gera().token)` devolve a organização, e um
      token qualquer devolve null.
- [ ] `tsc` passa.

**Dependências:** nenhuma.
**Arquivos:** `api/src/integrations/whatsapp/link-de-conexao.service.ts` (novo)
e o spec dele, `whatsapp-connections.controller.ts`,
`whatsapp-connections.module.ts`,
`web/src/app/(app)/integrations/whatsapp/page.tsx` e `actions.ts`.
**Tamanho:** M.

### [ ] T2: O cliente abre o link, vê o QR e conecta

**Descrição:** Criar a rota pública `GET /publico/whatsapp/:token`, sem JWT.
Ela resolve o token e chama `connectViaQrCode` (na primeira vez) e depois
`getQrCode`. Devolve `{ organizacao, status, qrCodeBase64 }`.

No web, criar a página `app/conectar-whatsapp/[token]/page.tsx` fora do grupo
`(app)` e liberar a rota no `middleware.ts`. O `QrConnect` passa a receber as
funções de iniciar/consultar por parâmetro, e a página pública passa as
versões com token.

**Aceite:**
- [ ] Abrir o link sem estar logado mostra o nome da organização e o QR.
- [ ] Ler o QR mostra "Conectado ✓" na página e "Conectado" na plataforma.
- [ ] Um token inválido mostra "Link inválido ou vencido".

**Verificação:**
- [ ] Spec do controller público: token válido chama o serviço com a
      organização certa; token inválido dá 404.
- [ ] `pnpm --filter web typecheck` passa.
- [ ] Manual (Checkpoint 1).

**Dependências:** T1.
**Arquivos:** `api/src/integrations/whatsapp/link-publico.controller.ts` (novo)
e o spec dele, `whatsapp-connections.module.ts`,
`web/src/app/conectar-whatsapp/[token]/page.tsx` e `actions.ts` (novos),
`web/src/middleware.ts`, `qr-connect.tsx`.
**Tamanho:** M.

### Checkpoint 1
- [ ] No Render: gerar o link, abrir em outro aparelho, ler o QR e ver
      "Conectado" dos dois lados.
- [ ] Revisão humana.

---

## Fase 2: travas e acabamento

### [ ] T3: Uso único, organização já conectada e novo link invalidando o antigo

**Descrição:**
- Quando o status vira CONNECTED, apagar o link da organização. O ponto de
  entrada é o `syncEvolutionState`, no "open".
- Com a organização já CONNECTED, a rota pública responde "já conectado" sem
  chamar `connectViaQrCode`.
- `gera()` apaga o link anterior da organização (chave
  `link-whatsapp-org:<orgId>`).

**Aceite:**
- [ ] O link usado, ou o antigo depois de gerar um novo, dá "Link inválido ou
      vencido".
- [ ] Abrir o link de uma organização conectada não muda o status dela.

**Verificação:**
- [ ] Spec do serviço cobrindo os três casos.

**Dependências:** T2.
**Arquivos:** `link-de-conexao.service.ts` e o spec dele,
`link-publico.controller.ts`, `whatsapp-connections.service.ts`.
**Tamanho:** S.

### [ ] T4: Auditoria e limite de requisições da rota pública

**Descrição:**
- Criar o limite `LINK_PUBLICO` (por exemplo, 30 por minuto por IP) com
  `@Throttle` na rota pública.
- Adicionar os valores `WHATSAPP_LINK_CRIADO` e `WHATSAPP_LINK_USADO` ao enum
  `AuditAction` (migration) e registrar os dois eventos.
- Conferir `Referrer-Policy: no-referrer` na página do Next.

**Aceite:**
- [ ] Um excesso de requisições dá 429.
- [ ] Os dois eventos aparecem em Configurações → Auditoria.
- [ ] A página pública responde com `Referrer-Policy: no-referrer`.

**Verificação:**
- [ ] `prisma migrate deploy` aplica.
- [ ] Spec: gerar o link chama a auditoria.
- [ ] `curl -I` na página confere o cabeçalho.

**Dependências:** T3.
**Arquivos:** `common/throttling/limites.ts`, `prisma/schema.prisma`, a
migration nova, `link-publico.controller.ts`, `link-de-conexao.service.ts`,
`web/next.config.ts`.
**Tamanho:** M.

### [ ] T5: A plataforma atualiza para "Conectado" sozinha

**Descrição:** Enquanto houver um link ativo, a tela de WhatsApp da
organização consulta o status a cada 5 s, com o mesmo polling do QR. Quando o
status vira CONNECTED, ela para e atualiza a tela.

**Aceite:**
- [ ] Com a tela aberta, o status muda para "Conectado" em até 5 s depois de o
      cliente ler o QR, sem recarregar a página.

**Verificação:**
- [ ] Manual.

**Dependências:** T2.
**Arquivos:** `web/src/app/(app)/integrations/whatsapp/page.tsx` e o componente
do link (T1).
**Tamanho:** S.

### Checkpoint 2
- [ ] Os itens de "Segurança" do plano conferidos um a um.
- [ ] Revisão humana antes do deploy.
