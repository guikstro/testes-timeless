# Teste da IA de vendas

Um teste que mede, com conversas reais, o que uma IA acerta ao dizer se uma
conversa terminou em venda, e quanto isso custa. Existe para decidir com dados
se vale trocar a regra de palavras por uma IA, e qual modelo usar.

Não está ligado ao sistema: nada na aplicação chama a IA. O código reutilizável
fica em `apps/api/src/sales/ia/` e o script em `apps/api/scripts/`.

## Como funciona

1. Lê conversas do banco indicado em `DATABASE_URL`. **Só lê**: nenhuma escrita.
2. Escolhe uma amostra, com parte reservada às conversas que têm venda. Sem
   isso, uma amostra ao acaso teria quase só conversas sem venda.
3. Monta o texto de cada conversa sem nome, telefone, e-mail, CPF e CNPJ.
4. Pede ao Claude, em formato fixo: situação (fechada, prometida, negociando,
   perdida, sem venda), confiança, valor, trechos literais que provam, motivo da
   perda e qualidade do lead.
5. Confere que cada trecho citado existe de fato na conversa. A IA pode errar,
   mas não pode citar o que ninguém escreveu.
6. Compara com duas referências: o que **pessoas** decidiram (venda confirmada
   à mão, por CRM ou por API; venda rejeitada; lead descartado) e o que a
   **regra de palavras** detectou sem ninguém confirmar.

## Rodar

A chave da API fica só no terminal, nunca em arquivo do projeto:

```bash
export ANTHROPIC_API_KEY=sua-chave
cd apps/api
export DATABASE_URL=...   # de preferência uma cópia ou um usuário somente leitura

pnpm teste:ia-vendas --sem-api                          # ensaio: custo estimado, sem chamar a IA
pnpm teste:ia-vendas --modelos haiku,sonnet --max 150   # o teste de verdade
pnpm teste:ia-vendas --avaliar                          # depois de preencher a planilha
```

Antes de enviar, o script mostra quantas conversas vão e pede "sim". Opções:
`--modelos` (haiku, sonnet, opus), `--max`, `--min-mensagens`, `--org`,
`--semente`, `--concorrencia`, `--saida`, `--sim`.

## O que sai (em `resultado-teste-ia/`)

- `relatorio.html`: custo e velocidade medidos, comparação com pessoas e com a
  regra, e as conversas em que a IA discorda, para você julgar.
- `revisao.csv`: as mesmas conversas; preencha a coluna `verdade` com VENDA ou
  SEM_VENDA, o que de fato aconteceu.
- `resultado.json`: tudo, para `--avaliar`.

Esses arquivos **têm o texto das conversas**. A pasta está no `.gitignore`:
não versione nem compartilhe.

## Como ler

O número que decide é o de `--avaliar`: entre as conversas que você julgou,
quem acertou mais, a IA ou a regra. Ele só cobre as conversas em que a IA
discordava; onde as duas concordam, o acerto é bem maior.

- **Vendas confirmadas por pessoas que a IA achou**: a cobertura. Uma IA que
  perde venda real não serve.
- **Sem venda decidida onde a IA disse venda**: o falso positivo.
- **Citou o que não existe**: deve ser perto de zero.
- **Custo por 1.000 conversas**: medido pelos tokens que a API informa, com o
  preço de tabela de `custo.ts`. Confira o preço na página da Anthropic.

## Privacidade

A troca de nome, telefone, e-mail e documento é automática e testada, mas não é
à prova de tudo: um nome digitado errado, ou o de outra pessoa, passa. As
conversas podem ter dados pessoais e de saúde (clínicas). Por isso o script
pede confirmação antes de enviar, e o ideal é testar primeiro com empresas sem
dado sensível (`--org`).

## O que o teste não decide

Ele mede acerto e custo. Não decide a política de confirmação automática (a
confiança mínima para a IA confirmar sozinha): isso se escolhe depois, olhando
a curva de acerto por confiança nos resultados.
