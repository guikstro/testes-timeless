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

- `GET /api/presenca-local?days=7|30|90`: o painel, com o período anterior.
- `GET /api/presenca-local/campanhas?de&ate[&compararDe&compararAte]`: cada
  campanha num mês livre, com comparação, para a tela de campanhas.
- `PUT /api/admin/organizations/:id/foco`: a troca do foco, só a equipe.

## Perfil da Empresa no Google (próxima fase)

As ligações e rotas que não vêm de anúncio, e as visualizações do perfil no
Maps e na busca, vêm da API de desempenho do Perfil da Empresa. Antes de usar:

- O Google exige que toda agência tenha uma conta de organização no Perfil da
  Empresa (`business.google.com/agencysignup`, com e-mail do domínio da
  agência) e aprove o projeto da equipe Timeless no Google Cloud
  ("Application for Basic API Access"). Sem aprovação, a cota fica em 0 pedidos
  por minuto; aprovado, 300.
- O perfil de cada cliente é ligado à organização: a organização pede acesso
  em Gerenciar convites, no Gerenciador de Perfis, e o dono do perfil aprova.

Depois disso, a conexão será por "Entrar com Google" com a conta da equipe.
Os números entram na mesma tabela, com a fonte `PERFIL_DA_EMPRESA`, e chegam
com uns três dias de atraso, que é o tempo do próprio Google.
