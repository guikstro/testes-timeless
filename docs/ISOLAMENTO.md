# Isolamento entre organizações

Uma pessoa da organização A nunca alcança dados da organização B. Este
documento diz como isso é garantido, o que foi auditado em 25/09/2026 e o que
o teste automatizado prova a cada execução.

## Como o isolamento é feito

- **A organização sai do token, nunca da requisição.** Todo serviço recebe o
  `organizationId` da sessão autenticada. O único lugar em que a requisição
  informa uma organização é o login, e ali ela só é aceita se a pessoa for
  membro dela.
- **Toda busca por id filtra antes pela organização.** O padrão é
  `findFirst({ where: { id, organizationId } })` e só depois a escrita pelo
  id. Não achar responde 404, igual para "não existe" e "é de outro cliente".
- **Anúncios e conjuntos não têm organização própria:** a busca sobe pela
  campanha (`adSet: { campaign: { organizationId } }`). Isso importa porque a
  mesma conta de anúncios pode estar conectada em duas organizações.
- **O tempo real também:** o canal de notificações é escolhido pela
  organização do token.

## O que foi auditado

Leads, vendas, conversas, mensagens, campanhas, conjuntos, anúncios, gasto,
links rastreáveis, cliques, atribuições, notificações, verbas, integrações
(Meta, WhatsApp, Google), conversões, histórico de mudança de anúncio,
auditoria, analytics, exportação, arquivos enviados, configurações, equipe e
sessões.

## O que a auditoria encontrou e foi corrigido

1. **Notificações eram filtradas só pela pessoa.** Quem fazia parte de duas
   organizações, ou tinha saído de uma, lia na sessão de uma as notificações
   da outra, com nome de lead e trecho de mensagem. Agora toda consulta usa
   pessoa e organização, e marcar como lida um id alheio responde 404.
2. **A administração montava o endereço da API com um valor do navegador.**
   Um id como `../../outra-rota?` faria o servidor da administração chamar
   outra rota com o token do operador. Agora só um id no formato de id passa.
3. **O site interpolava ids crus nos caminhos da API.** A API já filtrava pela
   organização, então não havia acesso cruzado, mas um valor malformado podia
   trocar a rota chamada. Agora todo caminho variável passa por `rota`, que
   codifica cada pedaço.

## O que o teste prova

`apps/api/test/isolamento.e2e-spec.ts` monta a organização A com um dado de
cada tipo, marcados com um texto único, e com a sessão de B:

- tenta ler, alterar e apagar cada recurso de A pelo id, em 23 rotas, e
  espera 403 ou 404 sem o texto marcado na resposta;
- confere no banco que nenhuma dessas tentativas escreveu nada em A;
- chama 29 rotas de listagem, analytics e configuração e confere que nenhuma
  traz o texto marcado nem os ids de A;
- tenta entrar na organização de A pelo login;
- confere que a caixa de notificações é a da organização da sessão;
- lê as rotas registradas no servidor e falha se existir rota autenticada
  com id no caminho fora da lista de tentativas. Uma rota nova só fica de
  fora se alguém escrever o motivo no próprio teste.

Para conferir que o teste não passa por acaso, o filtro de organização de uma
rota foi removido de propósito: o teste falhou apontando a rota, e o código
voltou ao que era.

## Fora do isolamento, de propósito

- **Rotas da administração da plataforma**, que só operadores com segundo
  fator alcançam.
- **`/r/:code`**, o redirecionamento público dos links rastreáveis.
- **`/uploads/:nome`**, as logos, públicas porque aparecem em relatório
  impresso. O nome do arquivo tem 128 bits aleatórios, então não se chega a
  uma logo sem já ter o endereço dela.
- **Webhooks do WhatsApp**, autenticados pela assinatura da Meta ou pelo
  segredo da Evolution; a organização sai do número ou da instância, nunca
  do corpo da mensagem.
