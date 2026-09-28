# Observabilidade

Como a equipe fica sabendo que algo quebrou, sem abrir log.

## Tela: Saúde da plataforma

Menu da equipe Timeless → **Saúde da plataforma** (`/saude`). Só operadores da
plataforma, com verificação em duas etapas. Atualiza sozinha a cada 30 segundos.

| Parte | O que mostra |
|---|---|
| API | Versão no ar (commit), desde quando, memória em uso (atenção acima de 400 MB) |
| Banco e Redis | Se respondem e em quanto tempo |
| Pedidos na última hora | Total, taxa de erro (5xx), mediana e 95% do tempo de resposta |
| Erros | Os abertos, agrupados, com contagem, primeira e última vez; botão "Resolvido" |
| Filas | Mensagens, envios, sincronia com a Meta, conversões, e-mails e manutenção: trabalhadores, esperando, rodando, agendados, falhos e o motivo das últimas falhas |
| WhatsApp | Conectados, última mensagem recebida e quem está desconectado ou esperando QR |
| Meta Ads | Quem sincroniza, a última sincronia e quem está com token vencido ou falha, com o erro |
| Google Ads | Contas cujo script não envia há mais de 3 horas |
| API de Conversões | Enviados, tentando e falhos nas últimas 24 h, com as últimas falhas |

Tudo sai de `GET /api/admin/saude` e `GET /api/admin/erros`. Cada parte é medida
por conta própria: se uma falhar, as outras continuam aparecendo e a que falhou
diz o motivo.

## Erros

- **API:** todo 500 vira registro, pelo filtro de exceções.
- **Navegador:** o erro que quebra uma tela é relatado pela própria tela (`/api/telemetria/erro`).
- **WhatsApp:** as rejeições sem tratamento do motor do WhatsApp, que antes só iam para o log.

O agrupamento (`observabilidade/assinatura.ts`) tira da mensagem ids, números e
endereços e junta com o lugar (a rota ou a tela). A mesma falha repetida é uma
linha só, com contador. Marcar como resolvido tira da lista; se acontecer de
novo, ela reabre. Erro parado há 90 dias sai na limpeza diária.

## Aviso para a equipe

Com `ALERTA_WEBHOOK_URL` configurada no serviço da API no Render, cada erro novo
(ou que voltou depois de resolvido) manda uma mensagem, no máximo uma a cada 15
minutos por erro. O corpo leva `text` e `content`, então funciona com um webhook
de entrada do Slack ou um webhook de canal do Discord, sem mais configuração.

Sem a variável, os erros continuam registrados e visíveis na tela; só não há aviso.

## Métricas de pedidos

Contadas na memória do processo da API (`observabilidade/metricas-da-api.ts`),
minuto a minuto, na última hora. Recomeçam a cada publicação e não custam
escrita nenhuma por pedido. As rotas `/health` ficam de fora, para o
monitoramento não afogar o resto.

## Se um dia precisar de mais

Um serviço externo de rastreamento de erros (Sentry, por exemplo) acrescentaria
histórico longo, sessões gravadas e agrupamento por versão. O ponto de ligação é
`RegistroDeErros.registra`: é onde todo erro já passa.
