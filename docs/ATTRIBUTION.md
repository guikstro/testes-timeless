# Motor de atribuição

> **Status: implementado (Fase 4).** Este documento descreve o comportamento
> real do código em `apps/api/src/attribution/`. Conecta o clique rastreado
> (Fase 2) ao lead do WhatsApp (Fase 3) — critério de aceite: "o lead exibe
> corretamente sua origem/campanha quando houver evidência."

## Regra de precedência (validada, não copiada do documento de escopo)

O documento de escopo original sugere uma cadeia de 6 níveis (CTWA_CLID →
identificador Meta → tracking link → UTM → referrer → direct/unknown) mas
avisa explicitamente para **validar tecnicamente o que cada identificador
permite antes de implementar**, em vez de copiar cegamente. Fizemos essa
validação e implementamos apenas os dois níveis para os quais existe um
mecanismo realmente determinístico dado o que este produto tem hoje:

```
1. referral.ctwa_clid (dado pela própria Meta)
        ↓ (se ausente)
2. token de referência no texto da mensagem → TrackingClick
        ↓ (se ausente ou não encontrado)
3. UNKNOWN
```

**Por que não UTM/fbclid/referrer genérico como níveis intermediários**: esses
sinais descrevem o **clique**, não têm nenhum mecanismo de correlação com
**qual lead específico** do WhatsApp aquele clique virou — sem uma correlação
determinística (cookie, token, ou o `referral` da própria Meta), usar UTM
"solto" para atribuir um lead seria adivinhar, exatamente o que a Seção 106
proíbe ("o sistema jamais deve atribuir aleatoriamente uma campanha"). Os
dados de UTM continuam presentes e vinculados quando a atribuição É
determinística via `TrackingClick` (nível 2) — eles não são descartados,
só não servem como evidência própria sem o clique confirmado por trás.

### Nível 1 — `referral.ctwa_clid` (Click-to-WhatsApp ads real)

Quando um lead clica num anúncio real de Click-to-WhatsApp da Meta e abre o
WhatsApp diretamente (sem passar pelo nosso `/r/:code`), a primeira mensagem
carrega um bloco `referral` com `ctwa_clid`, `source_id` (id do anúncio) e
`headline`. Isso é dado pela própria Meta — nenhuma correlação nossa é
necessária, é a evidência mais forte possível.

**Limitação conhecida**: `source_id` é só o ID do anúncio. Resolver
`adId → nome do anúncio → conjunto → campanha` depende da sincronização com
a Meta Ads API (Fase 6, não implementada ainda) — até lá, o `evidence` fica
com o ID cru.

### Nível 2 — token de referência em link `wa.me`

Para o nosso próprio mecanismo de link rastreável (`/r/:code` → `wa.me/...`),
não existe cookie que sobreviva à troca de app (navegador → WhatsApp). A
solução implementada usa o próprio mecanismo de pré-preenchimento de texto
que o `wa.me` já suporta:

```
TrackingClick criado
        ↓
gera attribution_token único (7 caracteres)
        ↓
se o destino é wa.me/api.whatsapp.com:
  injeta [ref:TOKEN] no parâmetro text= do redirect
        ↓
usuário abre o WhatsApp com a mensagem pré-preenchida
        ↓
se enviar a mensagem como veio (ou só editar o início):
  [ref:TOKEN] chega no texto da primeira mensagem
        ↓
worker extrai o token e busca o TrackingClick correspondente
        ↓
Attribution.trackingClickId = click.id
```

Essa é a **única exceção documentada** à regra "nunca reescrever a
`destinationUrl`" registrada em `docs/TRACKING.md` — não é um UTM anexado às
cegas, é usar um recurso que o próprio WhatsApp já suporta (texto
pré-preenchido) para carregar uma referência através do único ponto por
onde dá para carregá-la.

**Limitações conhecidas, deliberadas**:
- Se o usuário apagar o texto pré-preenchido inteiro antes de enviar, não há
  evidência — cai para `UNKNOWN`. Não há solução determinística possível
  aqui sem controlar o cliente do WhatsApp.
- Um usuário poderia copiar/colar a mesma mensagem para outra pessoa enviar,
  "vazando" o token para um lead que não fez o clique original. Não
  implementamos expiração/consumo de token — o token não é um segredo de
  segurança, é só um identificador de correlação; o pior caso é uma
  atribuição levemente incorreta, não um problema de segurança.

### Nível 3 — `UNKNOWN`

Quando nenhuma das evidências acima está presente na primeira mensagem, a
atribuição é `UNKNOWN` com `confidence: NONE`. **Sempre existe uma linha de
`Attribution`** por lead — mesmo sem evidência — para que relatórios futuros
consigam distinguir "sabemos que não sabemos a origem" de "esquecemos de
processar esse lead".

## First-touch, nunca sobrescrito (Seção 31)

`Attribution.leadId` é `@unique`: existe **no máximo uma** atribuição por
lead, calculada **uma única vez**, no momento exato em que o lead é criado
(`WhatsAppIngestionService.attributeLead`, chamado só quando
`leadWasCreated === true`). Mensagens seguintes do mesmo lead — mesmo que
carreguem um token de um clique diferente, ou um `referral` de outro anúncio
— nunca disparam uma nova resolução de atribuição. Testado explicitamente em
`apps/api/test/attribution.e2e-spec.ts`: um lead que clica no link da
Campanha A, depois (dias depois) clica no link da Campanha B e manda outra
mensagem, continua atribuído à Campanha A.

O que a Fase 4 **não** implementa: um histórico de touchpoints subsequentes
(o segundo clique/mensagem do exemplo acima é processado normalmente —
gera `MESSAGE_RECEIVED` na timeline — mas não é registrado como um
"touchpoint" alternativo em nenhuma tabela própria). Fica como possível
refinamento futuro, fora do escopo atual.

## Auditoria (Seção 46)

Toda `Attribution` guarda:

- `method`: `CTWA_REFERRAL` | `TRACKING_LINK` | `UNKNOWN`
- `confidence`: `HIGH` | `NONE` (só dois níveis — os dois métodos
  implementados são ambos determinísticos ou inexistentes, não há "média
  confiança" real neste escopo)
- `evidence`: snapshot JSON bruto da evidência usada (ctwa_clid/adId para
  CTWA; utm_source/utm_campaign/campaign_id/adset_id/ad_id do
  `TrackingClick` para tracking link)
- `trackingClickId`: FK direta para o clique, quando aplicável

Isso responde "por que este lead foi atribuído a esta campanha?" sem
precisar reconstruir nada a partir de código — a resposta está na própria
linha do banco.

## Isolamento multi-tenant

A busca do `TrackingClick` pelo token SEMPRE confere
`click.organizationId === lead.organizationId` antes de aceitar a
atribuição (`AttributionEngine.resolve`) — um token nunca atribui um lead a
um clique de outra organização, mesmo que (hipoteticamente) alguém
adivinhasse o token de 7 caracteres de outra empresa.
