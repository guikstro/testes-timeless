# Meta Conversions API

> **Status: não implementado ainda (Fase 7).** A sincronização de campanhas/
> conjuntos/anúncios/investimento da Meta Ads já está implementada (Fase 6) —
> ver [`docs/META_ADS.md`](META_ADS.md). Este documento cobre só a Fase 7:
> o envio de eventos de conversão (Lead/QualifiedLead/Purchase) de volta
> para a Meta via Conversions API, reaproveitando o `adAccountId`/token já
> capturados na Fase 6.

## O que vai entrar aqui quando a Fase 7 for concluída

- Mapeamento de eventos compatíveis com a API atual da Meta (Lead,
  QualifiedLead, Purchase) — sem inventar eventos incompatíveis.
- Geração de `event_id` determinístico, deduplicação, e por que um retry
  nunca pode gerar um segundo `Purchase` para a mesma venda.
- Estados de `ConversionEvent` (`PENDING`, `SENT`, `FAILED`, `RETRYING`) e a
  política de retry com backoff.
- Tratamento de token expirado/conta desconectada reaproveitando o mesmo
  `MetaConnection` e o mesmo mapeamento de erro (`MetaApiError`) já
  implementados na Fase 6.

## Credenciais necessárias para homologação real

Já presentes em `.env.example`, ainda sem efeito:

- `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` — obtidas no Meta Business Suite
  / Meta for Developers, necessárias apenas quando esta fase for
  implementada.
- `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
  `META_AD_ACCOUNT_ID` já têm efeito desde a Fase 6 (ver
  [`docs/META_ADS.md`](META_ADS.md)).
