# Tracking (links rastreáveis e captura de origem)

> **Status: implementado (Fase 2).** Este documento descreve o comportamento
> real do código em `apps/api/src/tracking-links/` e
> `apps/api/src/tracking/`. A conexão desse clique com um lead do WhatsApp
> continua não implementada — isso é a Fase 4 (ver `docs/ATTRIBUTION.md`).

## Como funciona

```
Instagram / anúncio
       |
       v
<host>/r/<code>              (TrackingController, público, sem auth)
       |
       v
localiza TrackingLink pelo code
       |
       v
persiste TrackingClick com UTMs, IDs de mídia, referrer, user-agent
       |
       v
HTTP 302 -> destinationUrl do link (inalterado)
```

Endpoint: `GET /r/:code`. Está deliberadamente fora do prefixo `/api` (ver
`main.ts`, exclusão de `{ path: 'r/:code', method: GET }`) para que o link
final seja curto — `https://go.seudominio.com/9LiXEXW`, por exemplo — em vez
de `.../api/r/9LiXEXW`.

## O que é capturado por clique

Todos os campos abaixo são opcionais — nenhum deles é obrigatório para o
clique ser aceito e persistido, porque este endpoint é acessado por
plataformas de anúncio que não controlamos:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `fbclid`, `ctwa_clid`, `gclid`
- `campaign_id`, `adset_id`, `ad_id` (IDs da hierarquia de anúncios da Meta,
  quando presentes na query string)
- `referrer` (header `Referer` da requisição)
- `user-agent`
- `landingUrl`: o `destinationUrl` do link **no momento do clique** (uma
  cópia, não uma referência — se o destino do link for editado depois, o
  histórico de cliques antigos continua mostrando para onde eles realmente
  foram).

Parâmetros desconhecidos na query string são ignorados silenciosamente, não
rejeitados — ver a nota em `apps/api/src/tracking/click-query.dto.ts` sobre
por que isso não pode ser um DTO validado com `forbidNonWhitelisted`.

## Origem/campanha padrão do link

Ao criar um `TrackingLink`, é possível definir `defaultSource`,
`defaultMedium` e `defaultCampaign`. Regra de precedência, aplicada por
campo independentemente:

```
UTM explícito na URL do clique
        ↓ (se ausente)
default do TrackingLink
        ↓ (se ausente)
null
```

Isso permite que um link de bio do Instagram, por exemplo, sempre seja
identificado como `source=instagram` mesmo que ninguém tenha acrescentado
`?utm_source=instagram` manualmente na hora de compartilhar o link.

## O que NÃO acontece (ainda)

- O redirecionamento **não** reescreve nem acrescenta parâmetros na
  `destinationUrl` — ela é usada exatamente como cadastrada. Anexar
  `fbclid`/UTMs a um link `wa.me/...` não teria efeito útil no WhatsApp, e
  mexer numa URL de destino arbitrária poderia quebrar query strings que já
  existiam nela.
- Não existe cookie de sessão de clique. A correlação clique → conversa do
  WhatsApp (Fase 3/4) vai depender de evidência determinística que a própria
  Meta already fornece no payload do webhook do WhatsApp (`ctwa_clid`) ou,
  na ausência dela, de heurísticas documentadas em `docs/ATTRIBUTION.md`
  quando essa fase existir — não de um cookie que o navegador do WhatsApp
  (app nativo) não teria acesso de qualquer forma.
- Não há limite de taxa (rate limiting) nem filtro de bots neste endpoint.

## Multi-tenancy e limpeza

- `TrackingLink.organizationId` vem sempre do JWT na criação; toda consulta
  de leitura/edição/remoção é filtrada por `organizationId` — um token de
  uma organização nunca enxerga ou edita o link de outra (`404`, testado em
  `apps/api/test/tracking.e2e-spec.ts`).
- Remover um link é *soft delete* (`deletedAt`), nunca exclusão física: o
  histórico de cliques de um link removido continua existindo para
  relatórios, mas o link some das listagens e o código passa a responder
  `404` no redirecionamento.
