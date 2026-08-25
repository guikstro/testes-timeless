# Motor de atribuição

> **Status: não implementado ainda.** Chega na Fase 4, depois que Tracking
> (Fase 2) e WhatsApp (Fase 3) existirem — a atribuição conecta o clique
> rastreado à conversa do WhatsApp e ao lead resultante.

## O que vai entrar aqui quando a Fase 4 for concluída

- Regra de precedência das evidências (ex.: `CTWA_CLID` determinístico >
  tracking link > UTM > referrer genérico > `DIRECT`/`UNKNOWN`), validada
  tecnicamente antes de virar regra fixa — não copiada cegamente do
  documento de especificação original.
- Definição de first-touch e como interações posteriores do mesmo telefone
  são registradas sem sobrescrever a atribuição original.
- Estrutura de auditoria (`attribution_method`, `evidence_type`,
  `evidence_id`, `confidence`, `attributed_at`) e como reconstruir "por que
  este lead foi atribuído a esta campanha" depois do fato.
- Comportamento para leads sem nenhuma evidência de origem (nunca inventar
  uma campanha).
