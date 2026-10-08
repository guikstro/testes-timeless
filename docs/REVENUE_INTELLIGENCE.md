# Revenue Intelligence — primeira entrega

Esta branch evolui o domínio existente de vendas. Detecção em conversa gera
evidência; confirmação de receita exige uma fonte autorizada. O cliente pode
continuar vendendo no WhatsApp, em seu CRM ou em outro sistema.

## Escopo implementado

- Sale independente de Lead.status, com múltiplas compras por cliente e venda
  ainda sem lead identificado. Valores inteiros em centavos; moeda por venda.
- Estados POSSIBLE, PROBABLE, CONFIRMED, REJECTED e CANCELLED.
- Evidências append-only nos serviços, resolução central, conflitos explícitos
  e auditoria na mesma transação. Não há rota para editar/apagar uma evidência.
- Classificador determinístico com sinais positivos por organização, negação,
  condicionais e confiança reduzida quando a cobertura é parcial/desconhecida.
  O contrato SaleClassifier permite substituir a implementação por uma
  implementação assíncrona de IA sem mudar o domínio.
- Tela /vendas: fila de revisão, cadastro manual, confirmação, correção de valor,
  rejeição, cancelamento, resolução de conflito e associação explícita de cliente.
- Snapshot de atribuição na confirmação/associação, preservado nas correções.
  O detalhe expõe evidências, pessoa revisora, unidade, fonte e eventos Meta.
- API universal com credenciais aleatórias, hash SHA-256, rotação, revogação,
  escopo por organização/unidade e saúde da fonte.
- Unidades opcionais para vendas, leads e fontes. Sem unidades cadastradas,
  usa-se o contexto da organização.
- Identidade por mapeamento externo, lead explícito, telefone normalizado ou
  e-mail. Sinais contraditórios entram em revisão; não mesclam leads.
- ExternalDeal normalizado e contrato CrmProvider para adaptadores futuros.
- Receita confirmada por moeda, ticket médio, vendas possíveis, canceladas e
  pendências. Os relatórios existentes passam a exigir venda confirmada sem
  conflito; o status WON do lead sozinho não gera receita.
- Meta Purchase por venda confirmada, com outbox transacional e deduplicação.
  Exportação Google considera compras repetidas e a data/moeda de cada venda.

## Política de resolução

Autoridade padrão: PAYMENT/ERP/ECOMMERCE > CRM > API > MANUAL > CONVERSATION.
A tabela DEFAULT_AUTHORITY é um argumento do motor puro; configuração por
organização na interface ainda não está implementada.

A evidência mais recente de cada fonte é considerada pela data do evento;
a sequência de inserção desempata eventos de mesmo instante. Revisões manuais
seguem a ordem de auditoria e mantêm a data comercial da venda ao corrigir o valor,
sem deslocar a receita para o dia da revisão. Duas credenciais
CRM são fontes distintas. Divergência de estado, moeda ou valor entre fontes
autoritativas gera revisão. Uma fonte mais fraca não substitui silenciosamente
uma mais forte. Uma evidência de conversa só confirma receita quando o cliente
escolheu isso (ver "Confirmação pela conversa").

Resolver um conflito exige escolher a evidência e registrar o motivo. A decisão
reconhece apenas as evidências existentes naquele momento. Evidências posteriores
podem reabrir o conflito. O valor e a fonte selecionados continuam explicáveis
pelo histórico. Receita em revisão fica fora dos totais confirmados.

Confirmação sem valor é preservada como fato externo, mas não inventa receita
nem gera Purchase. A tela informa a quantidade de vendas sem valor conhecido.

## Confirmação pela conversa (por cliente)

`Organization.confirmaVendaDaConversa`, em Configurações → Operação. Ligada
por padrão, porque era o comportamento de todos os clientes: a frase de venda
confirma a venda, leva o lead a Ganho e, com valor, gera o Purchase da Meta.
Desligada, toda venda da conversa entra como POSSIBLE/PROBABLE e espera
revisão em Vendas.

- A evidência confirmada pela política leva `payload.autoConfirmed`; só ela
  escapa do rebaixamento de conversa para PROBABLE no motor.
- Frase condicional ("fechado, pago se o banco liberar") nunca confirma
  sozinha: fica POSSIBLE nos dois modos.
- Fonte mais forte continua vencendo: um CRM ou pagamento divergente abre
  revisão como antes.
- Venda confirmada (de qualquer fonte, sem revisão pendente) leva o lead a
  Ganho, só para a frente no funil, e desfaz a desqualificação.

O detector lê o contexto na frase em que a expressão aparece: negação logo
antes ("não está fechado"), "ainda não" na mesma frase, dúvida ("talvez",
"vou pensar") e pergunta de preço descartam; condição antes descarta e depois
rebaixa. "Orçamento", "se" ou "ainda" em outro ponto da mensagem não bloqueiam
mais.

## Implantação

A migração 20261008120000 acrescenta um gatilho em `conversion_events` que
preenche `deduplication_key` com `lead:tipo` quando ela vem vazia. É para os
instantes do deploy em que a versão anterior ainda atende depois da migração:
sem ele, os eventos da Meta dela falhavam. A chave é a mesma que a migração
deu aos eventos antigos, então a deduplicação daquela versão continua valendo.
Pode ser removido numa migração futura, depois que nenhuma versão anterior
estiver no ar.

## API universal

Criar a fonte em Integrações → Fontes de vendas. A credencial só aparece ao
gerar/trocar. A listagem não retorna o hash nem o segredo.

```http
POST /api/integrations/sales/events
Authorization: Bearer SUA_CREDENCIAL
Content-Type: application/json
```

```json
{
  "externalId": "order-8291",
  "eventId": "order-8291-won-v1",
  "phone": "5585999999999",
  "status": "WON",
  "valueCents": 250000,
  "currency": "BRL",
  "occurredAt": "2026-10-07T14:30:00Z",
  "unitCode": "aldeota"
}
```

Resposta: saleId, status e needsReview. Estados aceitos: WON, LOST, CANCELLED,
REFUNDED. A fonte cadastrada determina a autoridade; o corpo não pode fornecer
organizationId ou escolher a autoridade. Há limite de 120 requisições/minuto
pelo mecanismo de throttling existente.

- Reenvio: repetir eventId e conteúdo devolve a mesma venda, sem duplicar evidência.
- Correção: manter externalId e usar novo eventId.
- Sem eventId, a chave deriva de externalId + status; uma correção do mesmo
  estado precisará de eventId.
- Mesma chave com conteúdo diferente retorna 409.
- Para correlacionar pagamento e CRM, enviar saleId em ambos. A associação
  externa fica persistida para atualizações posteriores.
- Fonte restrita a uma unidade não pode gravar venda de outra unidade.
- IDs de venda e lead são verificados dentro da organização da credencial.
- Pedido sem correspondência pode existir sem lead. Identidade ambígua precisa
  de revisão antes de entrar nos totais confirmados.

A tela aceita PUBLIC_SALES_API_URL como base pública, incluindo /api. Sem ela,
usa PUBLIC_TRACKING_BASE_URL + /api, depois NEXT_PUBLIC_API_URL. Em Docker,
configure uma base acessível externamente; http://api:3001 é um endereço interno.

## Compatibilidade e migração

Migração: 20261007150000_revenue_intelligence. Aplicar primeiro em staging com
backup do banco e com API/workers antigos interrompidos durante a troca da versão.
A troca de relação 1:1 para 1:N exige atualizar API e worker juntos.

A migração não apaga vendas, valores ou evidências antigas. Vendas existentes
permanecem confirmadas para preservar os relatórios históricos; recebem evidência
LEGACY_IMPORT, explicitamente identificada como legado sem nova verificação
independente. A moeda vem da organização. Este tratamento de legado não autoriza
novas confirmações por palavras-chave.

Eventos Meta existentes mantêm a chave leadId:tipo e seu estado de envio.
Novas compras usam sale:saleId:PURCHASE. A associação histórica evita reenviar um
Purchase antigo com um identificador novo.

As respostas de leads mantêm o campo de compatibilidade sale e passam a expor
sales. Quando há múltiplas compras, a correção deve selecionar uma venda na nova
tela. Os relatórios de aquisição existentes mantêm sua semântica de coorte de
leads/clientes compradores e somam somente a moeda da organização. A nova tela
Vendas usa a data da venda e separa moedas; não há conversão cambial implícita.

## Meta, falhas e cancelamentos

O Purchase só é criado para venda confirmada, sem revisão, com lead e valor
conhecidos, em organização que já conectou Meta. O outbox é gravado na mesma
transação da venda; a fila é acionada após o commit. Um recuperador periódico
retoma eventos PENDING. Reconectar a integração recupera PENDING/FAILED e
reativa jobs que esgotaram tentativas.

Antes de enviar, o worker verifica novamente o estado, valor e moeda da venda.
Cancelamento, reembolso ou conflito impede um Purchase pendente. Correções em
eventos PENDING/FAILED atualizam seu valor preservando o identificador.

Um Purchase já enviado permanece como fato histórico e não é reenviado com outro
valor. Cancelar/reembolsar altera a receita no TimeLESS e mantém as evidências;
esta entrega não tenta retrair eventos já recebidos pela Meta. Não existe envio
de Purchase negativo ou fictício para compensação.

## Validação

- Suíte da API, typecheck e compilação Nest.
- Suíte do frontend, incluindo formulários sem unidade e sem conflito.
- Build de produção do Next.
- E2E em PostgreSQL/Redis temporários: idempotência concorrente, credenciais,
  isolamento, conflito CRM/pagamento, revisão, reembolso, repetição de compras,
  moedas, rollback de auditoria, atribuição e outbox.
- Migração sobre banco anterior com venda e Purchase SENT fictícios: preserva
  IDs, valor, moeda, data e deduplicação; cria a evidência de legado.
- Navegação e cadastro manual em ambiente local com conta e dados fictícios.

## Continuação da evolução

Esta é a primeira entrega do briefing, não a implementação integral dos 32 itens.

- Channel e múltiplas conexões WhatsApp: remover a relação única em todo o
  roteamento, envio, sessões, saúde e UI; migrar clientes de uma conexão.
- Captura de mensagens de outros dispositivos: adaptar provedores, origem,
  autor e cobertura real por conexão/conversa. Nesta entrega os campos existem;
  a cobertura padrão é UNKNOWN, sem alegar observação completa.
- Primeiro CRM nativo: escolher pela demanda real, então implementar autenticação,
  webhook, sincronização OPEN/WON/LOST, pipeline, proprietário, retry e saúde.
  Os contratos e a API genérica estão prontos; não há adaptador nativo habilitado.
- Relatórios completos por unidade/canal/fonte e snapshot de atribuição, com
  gasto, CAC, CPA, ROAS e conversão por período de venda. Preservar a distinção
  entre coorte de aquisição e data da receita.
- Motivos de perda configuráveis/mapeamento de CRM. Sale.lossReason e o campo
  da API estão preparados; falta gestão do catálogo e relatórios.
- Tempo até primeira resposta humana: ampliar a medição existente para separar
  automação de pessoas e expor faixas de 5/30 minutos com cobertura conhecida.
- Configuração por organização da política de resolução e sinais negativos.
