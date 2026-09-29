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
| Presença local | Sem Conversas, Leads e Links; sem o aviso de WhatsApp | Só o painel de presença local | Ligações e rotas por campanha | De presença local |
| Os dois | Tudo | Abas de leads e a aba Presença local | Abas Leads e Presença local | De leads |

As telas escondidas também não abrem pelo endereço: quem digita `/leads` volta
para a tela inicial. A regra está em `apps/web/src/lib/foco.ts`.

## De onde vêm os números

Do script do Google Ads (versão 2), o mesmo que já manda o gasto. Além do gasto
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

## Medida e ausência

Zero é medida; ausência é "Sem medida". O painel diz em que situação está:

- **Sem Google Ads:** nenhum envio do script ainda.
- **Script desatualizado:** o script colado é o antigo (versão 1), que só manda
  gasto. Gere o script de novo em Integrações → Google Ads e cole no lugar.
- **Parcial:** uma parte do script falhou; a tela diz qual.
- **Medido:** tudo chegando.

## Rotas da API

- `GET /api/presenca-local?days=7|30|90`: o painel, com o período anterior.
- `GET /api/presenca-local/campanhas?de&ate[&compararDe&compararAte]`: cada
  campanha num mês livre, com comparação, para a tela de campanhas.
- `PUT /api/admin/organizations/:id/foco`: a troca do foco, só a equipe.

## Perfil da Empresa no Google (próxima fase)

As ligações e rotas que não vêm de anúncio, e as visualizações do perfil no
Maps e na busca, vêm da API de desempenho do Perfil da Empresa. Ela exige
aprovação do Google para o projeto da equipe Timeless; depois dela, a conexão
será por "Entrar com Google" com a conta da equipe, que precisa ser
administradora do perfil de cada cliente. Os números entram na mesma tabela,
com a fonte `PERFIL_DA_EMPRESA`.
