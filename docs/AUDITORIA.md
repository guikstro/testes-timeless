# Auditoria

Configurações → Auditoria mostra quem fez o quê na conta, do mais recente para
o mais antigo. Só o dono e os administradores da conta veem essa tela; a API
recusa os outros papéis com `AUDITORIA_RESTRITA`.

## O que é registrado

| Assunto | Ações |
|---|---|
| Acesso e segurança | entrada, entrada recusada (senha ou código do segundo fator errados), saída, troca e redefinição de senha, troca de e-mail, ativar e desativar o segundo fator, gerar códigos de recuperação, encerrar sessões |
| Equipe e permissões | mudança de papel, remoção de alguém da equipe |
| Acesso do suporte | entrada e saída de um operador da plataforma na conta |
| Configurações e integrações | mudanças nas configurações e na logo, conectar e desconectar Meta e WhatsApp, API de Conversões, regra de quem vira lead |
| Anúncios e verba | pausar e ativar campanha, conjunto e anúncio, orçamento diário, criar, alterar e excluir verba |
| Leads e vendas | mudança manual de estágio, desqualificar e reativar, registrar e corrigir venda |
| Campanhas, links e regras | campanha manual criada e excluída, gasto lançado ou importado por planilha, links rastreáveis, frases-gatilho |
| Exportações | download da planilha de conversões para o Google Ads |

Cada registro guarda quem fez (nome e e-mail copiados no momento), a
organização, a ação, o que foi afetado, a data, o IP, o aparelho ("Chrome no
macOS") e, quando faz sentido, o estado antes e depois. Uma ação feita por um
operador da plataforma durante uma visita aparece marcada como do suporte.

## Garantias

- **Nenhum segredo é gravado.** Todo estado passa por `limpaSegredos` antes de
  ir para o banco: campo cujo nome sugere senha, token, segredo, hash, chave,
  cookie ou código vira `[omitido]`. A limpeza é na gravação, e não por
  cuidado de quem chama.
- **Só o AuditoriaService grava.** O teste `so-pelo-servico.spec.ts` falha se
  algum arquivo gravar em `auditLog` direto pelo Prisma.
- **Apagar alguém não apaga o que essa pessoa fez.** A ligação com o usuário
  é opcional e vira nula quando ele é apagado; o nome copiado continua.
- **A ação e o registro andam juntos.** A gravação é aguardada: se ela falhar,
  a ação falha. A exceção são as tentativas de entrada recusadas, gravadas
  sem esperar, para o tempo de resposta não dizer quais e-mails têm conta.
- **Um cliente nunca vê o registro de outro.** Toda consulta filtra pela
  organização da sessão.

## Ainda fora

- Ações do painel da plataforma que não pertencem a um cliente (como dar ou
  tirar acesso de operador) ainda não têm auditoria própria; entram no item
  da administração central.
- Não há prazo de retenção: o registro cresce sem limpeza. A decisão entra
  junto do item de LGPD.
