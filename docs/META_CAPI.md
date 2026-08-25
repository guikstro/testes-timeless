# Meta Ads e Conversions API

> **Status: não implementado ainda.** Meta Ads (sincronização de
> campanhas/conjuntos/anúncios/investimento) chega na Fase 6; a Conversions
> API (envio de eventos Lead/QualifiedLead/Purchase) chega na Fase 7.

## O que vai entrar aqui quando as Fases 6-7 forem concluídas

- Como a autenticação com a conta de anúncio é feita e como os tokens ficam
  armazenados (sempre criptografados em repouso, nunca enviados ao frontend
  após a conexão inicial).
- Estratégia de sincronização assíncrona (job periódico, não uma chamada à
  API da Meta a cada carregamento do dashboard) e tratamento de rate limit,
  token expirado, conta desconectada, objeto removido/arquivado.
- Mapeamento de eventos compatíveis com a API atual da Meta (Lead,
  QualifiedLead, Purchase) — sem inventar eventos incompatíveis.
- Geração de `event_id` determinístico, deduplicação, e por que um retry
  nunca pode gerar um segundo `Purchase` para a mesma venda.
- Estados de `ConversionEvent` (`PENDING`, `SENT`, `FAILED`, `RETRYING`) e a
  política de retry com backoff.

## Credenciais necessárias para homologação real

Já presentes em `.env.example`, ainda sem efeito:

- `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
  `META_AD_ACCOUNT_ID`, `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` — obtidas
  no Meta Business Suite / Meta for Developers, necessárias apenas quando
  estas fases forem implementadas.
