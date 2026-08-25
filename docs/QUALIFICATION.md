# Qualificação e venda

> **Status: implementado (Fase 5).** Descreve o comportamento real de
> `apps/api/src/classification/` e o método `LeadsService.update` (correção
> manual). Critério de aceite: "mensagens configuradas conseguem alterar
> estágio e gerar venda."

## Como funciona

```
Mensagem recebida (toda mensagem, não só a primeira)
        |
        v
ConversationClassifierService.classify()
        |
        v
busca ClassificationRule da organização
        |
        +-- WON bate?  -> Lead.status = WON, Sale criada, timeline atualizada
        |
        +-- QUALIFIED bate (só se lead ainda é NEW)? -> Lead.status = QUALIFIED
        |
        +-- nenhuma bate -> nada muda
```

Regras são configuradas por organização em **Configurações** (frase +
"qualifica o lead" ou "marca como venda"). Nenhuma IA/classificação
probabilística nesta fase — só regras determinísticas (Seção 62).

## Máquina de estados (só avança, nunca volta)

```
NEW -> QUALIFIED -> WON
```

- Rodada em **toda mensagem inbound**, não só na primeira (ao contrário da
  atribuição, que é first-touch) — qualificação/venda pode acontecer a
  qualquer momento da conversa.
- Um lead já `WON` nunca é reavaliado (`ConversationClassifierService`
  retorna imediatamente).
- Um gatilho de `WON` tem prioridade sobre um gatilho de `QUALIFIED` na
  mesma mensagem — matematicamente faz sentido: se fechou negócio, é óbvio
  que estava qualificado.
- Se o lead pula direto de `NEW` para `WON` (o cliente nunca mandou uma
  mensagem batendo com o gatilho de qualificação, mas fechou negócio
  assim mesmo), o sistema **sintetiza** um evento `QUALIFIED` também,
  com `metadata.implicitFromSale = true` — mantém o funil
  Leads → Qualificados → Vendas consistente para os relatórios futuros
  (Fase 8), sem inventar uma mensagem que não existiu.

## Matching de frase — o que é seguro e o que não é

`matchesTriggerPhrase` usa correspondência **case-insensitive e com limite
de palavra** (`\bfrase\b`), não um `.includes()` ingênuo — isso evita, por
exemplo, que o gatilho "contrato" combine com "recontratado".

**O que isso NÃO resolve** (documentado explicitamente, não escondido): o
próprio exemplo do escopo do produto —

```
Gatilho configurado: "contrato fechado"
Mensagem: "O contrato fechado ontem ainda não chegou."
Resultado: COMBINA (falso positivo)
```

Isso é um problema de **semântica** (negação, tempo verbal), não de
tokenização — resolver isso de verdade exigiria um classificador
probabilístico/NLP, que está fora do escopo desta fase (Seção 62 prioriza
regras determinísticas; IA não foi implementada). A mitigação real está do
lado do operador: **escolher frases distintas e específicas** o suficiente
para não aparecerem naturalmente fora do contexto de fechamento —
"fechamos o contrato", "combinado, pode fazer o contrato" são frases muito
mais seguras que "contrato fechado" sozinho. A tela de Configurações
mostra esse aviso.

## Extração de valor (nunca inventado)

`extractRevenueCents` tenta, nesta ordem, extrair um valor em **centavos**
(nunca `float` — Seção 48) do texto da mensagem que disparou o gatilho de
venda:

1. `R$ 1.500,50` / `R$1500` / `R$ 50` — sinal de moeda explícito
2. `2 mil` / `1,5 mil` — forma informal comum em português
3. `2000 reais` / `150,90 reais` — unidade explícita, sem símbolo

Quando nada bate com confiança suficiente, `amountCents` fica `null` — a
venda **ainda é registrada** (o estágio `WON` não depende do valor), só o
valor fica pendente de preenchimento manual (Seção 109).

## Correção manual (Seção 64) e auditoria (Seção 65)

`PATCH /api/leads/:id` aceita `{ status?, revenueCents? }`:

- Só permite avançar o estágio (`NEW→QUALIFIED`, `NEW→WON`,
  `QUALIFIED→WON`) — tentar "voltar" ou repetir o mesmo estágio retorna
  `400 INVALID_STATUS_TRANSITION`. Isto não é um CRM completo, é conserto
  operacional pontual.
- Definir `revenueCents` sem uma venda existente (nem estar virando `WON`
  na mesma chamada) retorna `400 NO_SALE` — nunca cria receita "solta".
- Toda mudança gera:
  - Um `LeadEvent` na timeline (`QUALIFIED`, `SALE_DETECTED` ou
    `REVENUE_DETECTED`, com `metadata.classifierType = "MANUAL"` e o
    `userId` de quem fez a correção), visível no mesmo lugar que os
    eventos automáticos.
  - Um `AuditLog` (`LEAD_STATUS_CHANGED`, `SALE_CREATED` ou
    `SALE_UPDATED`) com o valor antes/depois — Seção 65. Consultável
    diretamente no banco; ainda não tem uma tela própria nesta fase.

## O que esta fase NÃO faz

- Não relaciona `Sale` com `Attribution → Campanign → AdSet → Ad` para
  cálculo de ROAS por campanha — isso é a combinação de Fase 6 (sync da
  Meta Ads) com Fase 8 (analytics). A `Sale` já está ligada ao `Lead`, que
  já está ligado à `Attribution`, então os dados existem; falta o
  agregador.
- Não implementa `SALE_DELETED`/estorno de venda — o enum `AuditAction` já
  o contempla para quando essa funcionalidade for construída.
- Não audita `CONNECTION_CHANGED` (conectar/desconectar WhatsApp, Fase 3)
  — só as ações introduzidas nesta fase usam a tabela `AuditLog` por
  enquanto.
