# Presença local

Nem todo cliente vive de lead. Para alguns (a Doca, por exemplo) o que importa
é o cliente ligar e ir até o endereço: ligações, pedidos de rota e visitas. O
foco do cliente decide o que ele vê.

## Foco do cliente

A equipe escolhe na página do cliente (**Clientes → cliente → Foco do
cliente**). A troca vale na hora e fica na auditoria.

| Foco | Menu | Dashboard | Campanhas | Relatório |
|---|---|---|---|---|
| Leads (padrão) | Tudo | Abas de leads | Leads, vendas, retorno | De leads |
| Presença local | Sem Conversas, Leads e Links; sem o aviso e a integração de WhatsApp; sem a aba Operação das Configurações | Só o painel de presença local | Ligações e rotas por campanha | De presença local |
| Os dois | Tudo | Abas de leads e a aba Presença local | Abas Leads e Presença local | De leads |

As telas escondidas também não abrem pelo endereço: quem digita `/leads` volta
para a tela inicial. A regra está em `apps/web/src/lib/foco.ts`.

## De onde vêm os números

Do script do Google Ads (versão 2 em diante), o mesmo que já manda o gasto. Além do gasto
por campanha, ele manda por dia e por campanha:

| Métrica | O que é | Parte do script |
|---|---|---|
| `LIGACOES_DOS_ANUNCIOS` | Ligações pelo botão de ligar do anúncio | `ligacoes` |
| `EXIBICOES_DO_TELEFONE` | Vezes que o telefone apareceu no anúncio | `ligacoes` |
| `ROTAS` | Pedidos de rota a partir do anúncio | `acoesLocais` |
| `LIGACOES_CONVERSAO` | Ligações contadas como conversão, inclui cliques para ligar no site | `acoesLocais` |
| `VISITAS_A_LOJA` | Visitas à loja estimadas pelo Google | `acoesLocais` |

Cada parte é uma consulta separada no script. Se o Google recusar uma, o
envio diz qual falhou (`partes`), o resto continua chegando, e os números já
guardados daquela parte não são apagados. Ficam na tabela `metricas_locais`.

## Histórico e comparação

A rodada de hora em hora manda os últimos 35 dias. Até a versão 2, era só
isso: uma conta que começou a mandar no fim de setembro tinha agosto com
cinco dias, e "setembro contra o mês anterior" mostrava altas de 300% que não
aconteceram.

Da versão 3 em diante:

- Cada envio diz o período que consultou (`periodo: { de, ate }`), inclusive
  nos dias em que nenhuma campanha rodou. O primeiro dia coberto fica em
  `google_ads_conexoes.coberto_desde`, e só anda para trás. Na primeira vez,
  o gasto que um script antigo já tinha mandado também conta.
- Enquanto a resposta disser `historicoPendente: true`, a mesma rodada manda
  o que vem antes, desde o dia 1º do mês de 13 meses atrás, em blocos de 60
  dias com `historico: true`. Do dia 1º para "setembro contra setembro do ano
  passado" ter o mês do ano passado inteiro, colado em qualquer dia. O último bloco vai com `historicoFim: true`, que grava
  `historico_completo_em` e encerra o pedido. Os blocos não trocam a versão
  nem as partes da conexão: as que valem são as da rodada de hora em hora.
- O gasto é gravado em lote (`INSERT ... ON CONFLICT`), 500 dias por comando.
  Mandar o mesmo bloco de novo substitui, e não soma.
- Os dias são contados em UTC a partir do "hoje" no fuso da conta: com o
  horário de verão de uma conta de fora, somar 24 horas pulava um dia.

As telas de comparação (Campanhas, o painel de presença local e os anúncios
da visão geral) recebem `cobertura` e `parcial`. Quando o período escolhido
ou o de comparação começa antes do primeiro dia com número, a porcentagem
fica de fora e um aviso diz desde quando há dado. Com Meta e Google juntos,
vale a fonte que começa por último; a Meta conta a partir da conexão, com os
sete dias que a sincronia busca para trás. Se quem limita é o Google sem
histórico, o aviso manda gerar o script de novo.

## Medida e ausência

Zero é medida; ausência é "Sem medida". O painel diz em que situação está:

- **Sem Google Ads:** nenhum envio do script ainda.
- **Script desatualizado:** o script colado é o antigo (versão 1), que só manda
  gasto. Gere o script de novo em Integrações → Google Ads e cole no lugar.
  Um script na versão 2 continua medindo; a tela de Integrações só oferece a
  versão 3 por causa do histórico.
- **Parcial:** uma parte do script falhou; a tela diz qual.
- **Medido:** tudo chegando.

## Rotas da API

- `GET /api/presenca-local?days=7|30|90`: o painel, com o período anterior e o Perfil da Empresa.
- `GET /api/presenca-local/campanhas?de&ate[&compararDe&compararAte]`: cada
  campanha num mês livre, com comparação, para a tela de campanhas.
- `PUT /api/admin/organizations/:id/foco`: a troca do foco, só a equipe.

## Perfil da Empresa no Google

As ligações, os pedidos de rota, os cliques no site e as visualizações do
perfil na Busca e no Maps, com ou sem anúncio. Aparecem numa seção própria do
painel de presença local, e não somados aos números dos anúncios: são duas
contagens diferentes do Google, e uma ligação pode estar nas duas.

### Como configurar (uma vez)

1. **Organização da agência no Perfil da Empresa**
   (`business.google.com/agencysignup`, com e-mail do domínio da agência). O
   perfil de cada cliente é ligado a ela: a organização pede acesso de gerente
   em Gerenciar convites, no Gerenciador de Perfis, e o dono do perfil aprova.
2. **Projeto no Google Cloud**, com estas APIs ativadas: My Business Account
   Management API, My Business Business Information API e Business Profile
   Performance API. O Google precisa aprovar o projeto: formulário
   `support.google.com/business/contact/api_default`, opção "Application for
   Basic API Access", com o número do projeto e um e-mail que seja dono ou
   gerente de um perfil. Para aprovar, o Google exige um perfil verificado e
   ativo há mais de 60 dias, com site cadastrado; a análise leva de 7 a 10
   dias úteis. Antes da aprovação a cota é 0 pedidos por minuto, e a tela
   mostra a recusa do Google ("não liberou cota"); aprovado, 300.
3. **Tela de consentimento OAuth.** Com Google Workspace, tipo **Interno**:
   sem revisão do Google e sem prazo no acesso. Se for Externo, publique **Em
   produção**: em "Teste", o Google derruba o acesso a cada 7 dias, e a leitura
   para com "a conta perdeu o acesso".
4. **Credencial OAuth**, tipo "Aplicativo da Web", com o URI de
   redirecionamento autorizado
   `https://timeless-crm.onrender.com/clientes/perfil-da-empresa/retorno`
   (a primeira origem de `WEB_APP_URL` + `/clientes/perfil-da-empresa/retorno`;
   a tela da equipe mostra o endereço exato).
5. **No Render, serviço da API:** `GOOGLE_OAUTH_CLIENT_ID` e
   `GOOGLE_OAUTH_CLIENT_SECRET`.
6. **Na Timeless:** Clientes, um cliente, Perfil da Empresa no Google,
   "Conectar conta Google", com a conta da equipe que gerencia a organização.
   A conta é uma só para todos os clientes; só quem administra a plataforma
   conecta e desconecta.
7. Em cada cliente, "Escolher perfil". O mesmo perfil não pode ser de dois
   clientes, e a lista (que tem os perfis de todos) só existe na área da
   equipe.

### Como roda

- Uma conta Google da equipe, e não uma por cliente: o Google guarda no máximo
  100 tokens de uma conta num mesmo app, e o 101º invalida o mais antigo sem
  aviso. Fica em `contas_google_da_equipe`, com o token de renovação cifrado.
  O token de acesso dura uma hora e fica só na memória.
- O `state` do OAuth é assinado, vale 15 minutos e só conclui com o mesmo
  operador que começou: um link de retorno com o código de outra conta Google
  é recusado.
- Ao escolher o perfil, a fila `perfil-da-empresa` lê um ano e meio de
  histórico, em trechos de 180 dias do mais novo para o mais antigo; um trecho
  antigo recusado encerra a volta no tempo sem perder o resto. Depois, a cada
  6 horas, relê as últimas duas semanas, que o Google ainda acerta.
- Os números ficam em `metricas_locais`, com a fonte `PERFIL_DA_EMPRESA` e o
  local (`locations/123`) no `escopo`. O Google omite o valor quando ele é
  zero, e o dia sem valor vira zero; mas os últimos dias também chegam sem
  valor enquanto ele não conta (uns três dias de atraso), então o trecho mais
  novo é cortado no último dia com número (`locais_do_perfil.numeros_ate`).
- O painel corta o período nesse dia e compara com os mesmos dias do período
  anterior: 27 dias contra 30 mostrariam uma queda que não aconteceu.
- Tirar um perfil do cliente apaga os números dele deste cliente. A leitura
  também só conta local ligado agora.
- Recusa do Google (permissão, cota, perfil removido) fica escrita no local,
  na tela da equipe, sem tentar de novo em segundos; o cliente vê só que a
  leitura parou. Acesso revogado marca a conta, e a rodada para até alguém
  conectar de novo. Erro de rede volta para a fila.

### Rotas da API (todas da administração)

- `GET /api/admin/perfil-da-empresa`: configuração, conta e endereço de retorno.
- `POST /api/admin/perfil-da-empresa/inicio` e `.../conexao`: o OAuth (só ADMIN).
- `DELETE /api/admin/perfil-da-empresa`: desconecta e revoga no Google (só ADMIN).
- `GET /api/admin/perfil-da-empresa/locais`: os perfis que a conta enxerga.
- `GET|PUT /api/admin/organizations/:id/perfil-da-empresa` e `POST .../ler`.

O teste de ponta a ponta (`test/perfil-da-empresa.e2e-spec.ts`) roda contra um
dublê que imita a documentação do Google, com `GOOGLE_API_BASE_URL`.
