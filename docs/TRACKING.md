# Tracking (links rastreáveis e captura de origem)

> **Status: não implementado ainda.** Este documento será escrito com o
> comportamento real assim que a Fase 2 (Tracking) for implementada —
> `TrackingLink`, `TrackingClick`, redirecionamento com registro de
> UTMs/`fbclid`/`ctwa_clid`/IDs de campanha, conforme o escopo do produto.
>
> Não descrevemos aqui um comportamento hipotético para evitar documentação
> que não corresponde ao código.

## O que vai entrar aqui quando a Fase 2 for concluída

- Como os links rastreáveis funcionam (`GET /:code` → registra clique →
  redireciona).
- Quais parâmetros são capturados (UTMs, `fbclid`, `ctwa_clid`, `gclid`,
  `campaign_id`/`adset_id`/`ad_id`).
- Como o clique vira uma sessão associável a um lead do WhatsApp.
- Limitações conhecidas e cenários não determinísticos.
