# Timeless: referência de design

> Marfim e quase-preto, um verde que só aparece quando é ação, e números que
> dizem se são medida ou ausência.

**Temas:** claro (padrão) e escuro, escolhidos pela pessoa; impressão sempre
em branco. **Idioma:** português do Brasil.

Este arquivo é para quem gera tela, pessoa ou ferramenta de IA (Claude Code,
Cursor, v0): tem os valores, as regras e as especificações. O porquê das peças
e como mantê-las está em [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md); o
catálogo vivo, nos dois temas, em `/design` (logado como alguém da equipe
Timeless). Os valores de cor deste arquivo são conferidos contra o código por
teste (`apps/web/src/lib/design-md.spec.ts`).

A Timeless é um CRM de marketing: leads que chegam pelo WhatsApp, o gasto que
os trouxe, e para clientes de presença local, ligações e rotas vindas do
Google. A interface é minimalista e editorial. O fundo é marfim quente
(#FFF9ED) no claro e quase-preto (#030403) no escuro, os dois tirados das
artes da marca. O texto é quase-preto quente, e a única cor viva é o verde da
marca, reservada para ação e destaque. Estado (erro, atenção, sucesso,
informação) tem cores próprias e nunca usa o verde. Cartões brancos com borda
fina e sombra quase invisível; títulos em Manrope, todo o resto em Inter;
números com algarismos de mesma largura. A densidade só aumenta onde o dado
pede: tabelas e painéis de números. Nada decorativo que não explique alguma
coisa.

## Tokens: cores

As telas usam o **papel** (`text-ink`, `bg-panel`, `border-line`), nunca o tom
(`text-stone-900`). Cada papel troca de valor com o tema. Definidos em
`apps/web/src/app/globals.css` (variáveis) e `apps/web/tailwind.config.ts`
(classes).

### Superfície e texto

| Papel | Token | Claro | Escuro | Uso |
|---|---|---|---|---|
| Fundo da página | `canvas` | `#FFF9ED` | `#030403` | Marfim da marca; nunca branco puro na página |
| Cartão | `panel` | `#FFFFFF` | `#141413` | Cartões, campos, menus, diálogos |
| Área interna | `panel-soft` | `#FAF5EB` | `#1C1C1A` | Fundo de trilho de pílulas, linha em destaque, campo desabilitado |
| Borda | `line` | `#E2DBCD` | `#302F2C` | Bordas de 1px; em cartão, com 70% de opacidade (`border-line/70`) |
| Texto principal | `ink` | `#0C0B0A` | `#F0EADF` | Títulos, números, texto que se lê |
| Texto secundário | `ink-soft` | `#524C44` | `#B0A99D` | Descrições, valores de tabela |
| Texto de apoio | `ink-mute` | `#857D71` | `#827C72` | Rótulos, notas, datas, "Sem medida" |

### Marca

O verde é da marca Timeless, medido nas artes, com um passo por tema. **Muda
por cliente:** a cor da organização (Configurações, Aparência) sobrescreve
estas variáveis em `components/brand-style.tsx`, derivando o passo escuro da
mesma cor (`brandPaletteEscura` em `lib/brand.ts`). Por isso a tela nunca
escreve o verde em hex.

| Papel | Token | Claro | Escuro | Uso |
|---|---|---|---|---|
| Ação de destaque | `accent` | `#007D5E` | `#00A87B` | Botão `accent`, anel de foco dos campos, detalhe ativo |
| Texto sobre o acento | `accent-contrast` | `#FFFFFF` | `#030403` | Texto dentro do botão `accent` |
| Marca | `brand` | `#007D5E` | `#00A87B` | Borda do campo em foco, ícones da marca |
| Marca, fundo suave | `brand-soft` | `#E8F2EE` | `#0A261E` | Selo `brand`, realce de frase |
| Marca, tinta | `brand-ink` | `#005F47` | `#6CE2B8` | Texto sobre `brand-soft` |

### Estado

Tinta (texto e ícone), fundo suave e borda, com um valor por tema.
`text-danger`, `bg-danger-soft`, `border-danger-line`. Nunca `red-600` solto.

| Papel | Token | Claro | Escuro |
|---|---|---|---|
| Erro, tinta | `danger` | `#DC2626` | `#F87171` |
| Erro, fundo | `danger-soft` | `#FEF2F2` | `#28100F` |
| Erro, borda | `danger-line` | `#FCA5A5` | `#541919` |
| Atenção, tinta | `warning` | `#78350F` | `#FEF3C7` |
| Atenção, fundo | `warning-soft` | `#FFFBEB` | `#28160D` |
| Atenção, borda | `warning-line` | `#FCD34D` | `#502811` |
| Sucesso, tinta | `success` | `#047857` | `#34D399` |
| Sucesso, fundo | `success-soft` | `#ECFDF5` | `#0D1E19` |
| Sucesso, borda | `success-line` | `#A7F3D0` | `#064E3B` |
| Informação, tinta | `info` | `#1D4ED8` | `#60A5FA` |
| Informação, fundo | `info-soft` | `#EFF6FF` | `#151B2D` |
| Informação, borda | `info-line` | `#BFDBFE` | `#1E3A8A` |

**Exceção:** pontos sólidos de status (bolinha de 6 a 8px) usam
`bg-emerald-500`, `bg-amber-500` e `bg-red-500`, que funcionam nos dois temas.
A tinta de estado no escuro é clara para ler sobre o fundo suave e viraria um
ponto quase branco.

### Gráficos

A primeira série é a cor da marca; a segunda, um tom oposto com outra
claridade, para quem não separa as cores ainda distinguir as linhas. Mudam com
a cor do cliente e são iguais nos dois temas.

| Papel | Token | Claro | Escuro |
|---|---|---|---|
| Série principal | `serie-1` | `#007D5E` | `#007D5E` |
| Série de comparação | `serie-2` | `#D97706` | `#D97706` |
| Grade | `grade` | `#E2DBCD` | `#302F2C` |
| Linha guia, eixo | `guia` | `#948D80` | `#827C72` |

### Impressão

O relatório vira PDF pela impressão do navegador: fundo branco, texto
`#111111`, apoio `#666666`, borda `#D6D6D2`, e os estados do tema claro mesmo
quando impresso do escuro.

## Tokens: tipografia

- **Inter** (`font-sans`, `--font-sans`): tudo que não é título. Com
  `font-feature-settings: "cv02", "cv03", "cv04", "ss01"`.
- **Manrope** (`font-display`, `--font-display`): títulos de página, de cartão
  e de seção. Peso 600, `tracking-tight`.

Quatro degraus de texto, com nome de papel. Não existe 12,7px: se nenhum
degrau serve, o problema é a hierarquia.

| Papel | Classe | Tamanho | Altura de linha | Uso |
|---|---|---|---|---|
| Rótulo | `text-rotulo` | 11px | 1.45 | Rótulo de seção (maiúsculas, `tracking-[0.1em]`, `font-medium` ou `font-semibold`), data, legenda, selo |
| Apoio | `text-apoio` | 12,5px | 1.5 | Descrição curta, nota de rodapé, texto de célula secundária |
| Corpo | `text-corpo` | 13,5px | 1.55 | O texto do produto: tabelas, formulários, parágrafos |
| Destaque | `text-destaque` | 15px | 1.4 | Título de cartão, frase que precisa saltar dentro de um painel |
| Título de página | `font-display text-2xl font-semibold tracking-tight` | 24px | Tailwind | Um por tela, no `h1` |
| Título secundário | `font-display text-xl font-semibold` | 20px | Tailwind | Seção grande ou tela estreita |
| Número de painel | `text-[26px] font-semibold leading-none tabular-nums` | 26px | 1 | O número do cartão de número |

Números sempre com algarismos de mesma largura: `tabular-nums` ou a classe
`tnum`. Dinheiro com `formatCentsAsBRL` (R$ 2.104,00); inteiros com
`toLocaleString("pt-BR")` (1.740).

## Tokens: espaço, forma, sombra e movimento

**Espaço:** a escala do Tailwind (4px por passo). Os que se repetem:

| Uso | Valor |
|---|---|
| Entre cartões de uma grade | `gap-3` (12px) ou `gap-4` (16px) |
| Entre seções da tela | `space-y-6` ou `mb-6` (24px) |
| Dentro de cartão de número | `p-4` (16px) |
| Dentro de cartão de conteúdo | `p-5` a `p-6` (20 a 24px) |
| Cabeçalho da tela até o conteúdo | `mb-6` (24px) |

**Raio:** generoso e contínuo; canto apertado endurece a interface.

| Elemento | Classe | Valor |
|---|---|---|
| Botão, pílula, selo, avatar | `rounded-full` | 9999px |
| Campo, menu | `rounded-xl` | 14px |
| Cartão, aviso, toast | `rounded-2xl` | 18px |
| Diálogo | `rounded-3xl` | 24px |
| Item pequeno (tooltip, código) | `rounded-lg` | 10px |

**Sombra:** em camadas e muito suave; profundidade sem peso.

| Nome | Classe | Uso |
|---|---|---|
| Rente | `shadow-subtle` | Botão, campo, cartão de número |
| Cartão | `shadow-card` | `.surface` (cartão padrão), botão no hover |
| Elevada | `shadow-lifted` | Cartão clicável no hover, vidro (`.glass`) |
| Flutuante | `shadow-pop` | Menu, diálogo, tooltip |

**Movimento:** entradas que assentam, nunca que quicam. Quem pede menos
movimento recebe menos (`prefers-reduced-motion` zera tudo).

| Nome | Uso |
|---|---|
| `ease-soft` (`cubic-bezier(0.16, 1, 0.3, 1)`) | Transições de hover e foco, 200 a 300ms |
| `animate-rise-in` (0,5s) | Entrada de cartão e toast |
| `animate-pop-in` (0,28s) | Diálogo abrindo |
| `animate-slide-in-right` (0,36s) | Gaveta lateral |
| `active:scale-[0.97]` | Botão ao clicar |

## Superfícies e elevação

| Nível | Nome | Como | Uso |
|---|---|---|---|
| 0 | Página | `bg-canvas` | Fundo de toda tela |
| 1 | Cartão | `.surface` = `rounded-2xl border border-line/70 bg-panel shadow-card` | Conteúdo agrupado |
| 1 | Cartão de número | `rounded-2xl border border-line bg-panel p-4 shadow-subtle` | Um número com contexto |
| 2 | Vidro | `.glass` = borda `line/50`, `bg-panel/70`, `shadow-lifted`, desfoque | Toast; a faixa do topo usa o mesmo efeito (`bg-canvas/80 backdrop-blur-xl`) |
| 3 | Flutuante | `bg-panel shadow-pop` | Menu, diálogo, tooltip |

No escuro a elevação vem mais do passo de tom (`#030403`, `#141413`,
`#1C1C1A`) que da sombra.

## Layout

- **Moldura:** menu lateral à esquerda (recolhível) e faixa fina no topo,
  grudada, com 45px (`--faixa-do-topo`): sino de notificações e estado do
  WhatsApp. O conteúdo fica em `<main>`.
- **Largura do conteúdo:** `mx-auto` com
  - `max-w-6xl` (1152px): painéis e tabelas largas (Dashboard, Campanhas);
  - `max-w-5xl`: grades de cartões (Integrações);
  - `max-w-4xl`: configurações e relatório;
  - `max-w-lg` a `max-w-2xl`: formulários e avisos isolados.
- **Cabeçalho de tela:** rótulo de período em cima (opcional, `text-rotulo
  uppercase tracking-[0.14em]`), `h1`, subtítulo que conclui, linha de frescor
  do dado; à direita, o seletor de período (pílulas). Abas que são páginas
  ficam logo abaixo, sublinhadas.
- **Grades de números:** `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` (ou 3 ou
  5, conforme os números).
- **Celular:** tabela larga vira blocos "rótulo: valor" (`DataTable`); nada
  rola para o lado na página, só dentro da tabela.

## Componentes

Tudo em `apps/web/src/components/ui`. Se falta uma peça, ela nasce lá e entra
no catálogo `/design`; não nasce solta numa tela.

### Botão (`Button`, `ButtonLink`)
Pílula (`rounded-full`), `font-medium`. Tamanhos: `sm` 36px (`h-9 px-3.5`),
`md` 44px (`h-11 px-5`), `lg` 52px (`h-13 px-6 text-destaque`). Variantes por
hierarquia:
- `primary`: fundo `ink`, texto `canvas`. **Uma por tela.**
- `accent`: fundo `accent`, texto `accent-contrast`. A ação que é da marca
  (conectar, gerar).
- `secondary`: borda `line`, fundo `panel`.
- `ghost`: sem fundo, texto `ink-soft`.
- `danger`: borda `danger-line`, texto `danger`.

Ir para outra tela é `ButtonLink`, não botão com `router.push`. Carregando:
`loading` (spinner e `aria-busy`); desabilitado: 45% de opacidade.

### Campo (`Input`, `Select`, `Textarea`, `SearchInput`, dentro de `Field`)
40px de altura, `rounded-xl`, borda `line`, fundo `panel`, `px-3.5`,
`text-corpo`. Foco: borda `brand` e anel de 4px `brand/10`. Inválido: borda
`danger`. Sempre dentro de `Field`, que liga rótulo, dica e erro ao campo.

### Cartão (`Card`, `CardHeader`)
`.surface`. `CardHeader`: título `font-display text-destaque font-semibold`,
descrição `text-corpo text-ink-mute`, ação opcional à direita.

### Cartão de número (`StatCard`, no dashboard)
Rótulo `text-rotulo uppercase tracking-[0.1em] text-ink-mute`; número 26px
`font-semibold tabular-nums`; embaixo, o `Delta` e o valor anterior
("de R$ 2.168"); nota opcional; minigráfico opcional no pé. Sem medida, o
cartão diz "Sem medida" em `ink-mute` no lugar do número, com o motivo.

### Variação (`Delta`)
Seta, percentual e cor (`success` para bom, `danger` para ruim). `invertido`
quando cair é bom (custo, tempo de resposta). "estável" abaixo de 0,5%. Sem
período anterior com valor: "sem base anterior", nunca um percentual sobre zero.

### Selo (`Badge`)
Pílula, `text-rotulo font-medium`, `px-2.5 py-1`, anel interno. Tons:
`neutral`, `info`, `success`, `warning`, `danger`, `brand`. Sempre com texto;
ponto opcional (`dot`).

### Aviso (`Alert`)
`rounded-2xl border p-4`, fundo e borda do tom, ícone do tom, título
opcional, ação opcional à direita (`ButtonLink` secundário, `sm`). Para o que
fica na tela até ser resolvido: script antigo, WhatsApp desconectado.

### Frescor do dado (`FrescorDosDados`)
Uma linha `text-rotulo text-ink-mute` embaixo do subtítulo das telas de dados:
"Ao vivo · Meta atualizada há 20 min · Google Ads atualizado há 12 min". Cada
fonte com um ponto de 6px (verde em dia, âmbar atrasada, vermelho com falha),
a frase do estado e uma dica com o motivo e a hora exata. Atrasada é mais de 3
horas sem dado novo (a régua da Saúde da plataforma). Fonte sem conexão não
aparece. "Ao vivo" só onde a tela se atualiza sozinha; com o canal fora, diz
"Atualiza a cada 30 s".

### Gráfico diário (`LeadsAreaChart`)
Duas séries por dia, em SVG, com os modos Área, Linha, Barras e Acumulado, e
dica por dia. Cores das séries da marca (`serie-1`, `serie-2`). Os rótulos
mudam com o assunto: "Leads" e "Vendas" no painel de leads, "Ligações" e
"Pedidos de rota" no de presença local. Série sem medida não é desenhada: um
zero no gráfico diria que ninguém ligou. Fica num `.surface p-6` com título
`font-display text-destaque` e a dica "Passe o mouse para ver um dia
específico", logo abaixo dos cartões de número.

### Frase de abertura do relatório (`Conclusao`)
Embaixo do período, no relatório para o cliente: uma frase em `font-display`
(18 a 23px, `font-medium`, `leading-snug`) que conclui o período, com **um**
trecho em destaque, como um marca-texto: `<mark>` com `bg-accent/15`, texto
`ink`, `rounded-md px-1` e `print-color-adjust: exact` para sair no papel.
"**214 ligações e 360 pedidos de rota** pelos anúncios do Google, com R$
2.104,00 investidos." Sem medida, não há frase. Não afirma causa que o número
não prova: "6 clientes novos **e** 42 leads", e não "vieram de".

### Tabela (`DataTable`, `Pagination`)
Cabeçalho `text-rotulo uppercase` em `ink-mute`, linhas com borda `line/50` e
hover `panel-soft/50`. Números à direita, com `tnum`. No celular, cada linha
vira um bloco. Célula sem valor é escrita por extenso ("Sem medida", "Sem
ligação"), nunca com traço: um traço é lido como zero.

### Pílulas (`GrupoDePilulas`) e abas (`Tabs`)
Pílulas: trilho `bg-panel-soft/60` com borda, opção ativa sólida (`bg-ink
text-canvas`). Para filtro e navegação por endereço (período, aba que é
página). `Tabs`: troca conteúdo sem mudar o endereço. Abas de seção no
cabeçalho do dashboard: texto com sublinhado `accent` de 2px na ativa.

### Diálogo, gaveta e confirmação (`Dialog`, `Drawer`, `Sheet`, `ConfirmationDialog`, `InlineConfirm`)
`<dialog>` nativo, `rounded-3xl`, `shadow-pop`, fundo escurecido
(`backdrop:bg-ink/40`). Esc fecha e devolve o foco. Ação que não se desfaz:
dois toques no próprio botão (`InlineConfirm`) ou diálogo com as palavras da
ação ("Remover Ana"), foco começando em Cancelar.

### Toast (`useToast`), Tooltip, Menu
- Toast: `.glass rounded-2xl px-4 py-3`, some sozinho. Para confirmar ou
  falhar o que a pessoa acabou de fazer.
- Tooltip: fundo `ink`, texto `canvas`, `text-rotulo`. Aparece no mouse e no
  foco. Nada essencial mora nele.
- Menu (`DropdownMenu`): `rounded-xl border bg-panel p-1 shadow-pop`, setas
  navegam.

### Carregando, vazio e erro (`Skeleton`, `EmptyState`, `ErrorState`)
Carregando com a forma do conteúdo. Vazio e erro dizem o próximo passo ("Adicione
a primeira campanha acima").

## Regras do produto

### Dado
- **Zero é medida; ausência é "Sem medida".** Se a fonte não mediu (WhatsApp
  desconectado, script antigo, consulta recusada), a tela escreve "Sem
  medida" e o motivo, nunca 0. Zero diria que ninguém ligou.
- **Custo sem ação para dividir** não é zero nem infinito: "Sem ligação",
  "Nenhum lead".
- **Todo número com período.** O cabeçalho diz o intervalo; o cartão compara
  com o período anterior do mesmo tamanho.
- **Todo dado com data.** Telas de dados mostram o frescor (acima); listas
  usam tempo relativo ("há 2 dias") com a data exata na dica.
- **Dia civil de Brasília** para leads; o gasto segue o dia que a plataforma
  informa.

### Texto
- **Português de gente**, sem jargão técnico na tela do cliente.
- **Sem travessão** (o traço longo) em texto visível: vírgula, ponto ou
  dois-pontos.
- **O título diz o assunto; o subtítulo conclui** ("214 ligações e 360
  pedidos de rota pelos anúncios"), não pergunta.
- **Estado com palavra:** cor e ícone reforçam, a frase diz.
- **Botão diz a ação** ("Gerar script novo", "Remover Ana"), não "OK".

### Acesso e foco do cliente
- O menu e as telas seguem as áreas da pessoa e o foco do cliente (leads,
  presença local, os dois). Tela escondida também não abre pelo endereço.
- O que a pessoa não pode fazer não aparece (`SePuderAbrir`), em vez de
  aparecer e falhar.

## Faça e não faça

### Faça
- Use os papéis (`ink`, `panel`, `line`, `danger`), nunca tons do Tailwind.
- Um botão `primary` por tela; o resto `secondary` ou `ghost`.
- Títulos em Manrope 600 com `tracking-tight`; o resto em Inter.
- Números com `tabular-nums`, alinhados à direita nas tabelas.
- Borda de 1px como estrutura; sombra só na medida da tabela de sombras.
- Escreva a ausência por extenso e diga o motivo.
- Teste nos dois temas e no celular; abra `/design` para ver as peças.
- Teclado primeiro: tudo que abre fecha com Esc e devolve o foco.

### Não faça
- Não invente cor: as da marca vêm das artes da Timeless, e o verde muda por
  cliente. Nada de hex solto na tela.
- Não use o verde para estado (sucesso é `success`, não `accent`).
- Não use traço, "0" ou "N/A" no lugar de dado que não existe.
- Não crie tamanho de texto fora dos quatro degraus e dos títulos.
- Não use gradiente, vidro ou brilho como enfeite: só onde já existem (o
  brilho no hover do cartão de número e no topo do dashboard, o vidro no toast
  e na faixa do topo).
- Não escreva botão, campo ou tabela à mão numa tela: use `components/ui`.
- Não esconda informação essencial em tooltip.

## Guia para gerar telas (IA)

**Referência rápida (tema claro, o escuro troca sozinho pelos papéis):**
- fundo da página: `bg-canvas` (#FFF9ED)
- cartão: `.surface` (#FFFFFF, borda #E2DBCD a 70%)
- texto principal / secundário / apoio: `text-ink` / `text-ink-soft` / `text-ink-mute`
- ação principal: `Button variant="primary"` (fundo #0C0B0A)
- ação da marca: `Button variant="accent"` (#007D5E, muda por cliente)
- erro / atenção / sucesso / informação: `danger` / `warning` / `success` / `info`

**Pedidos de exemplo:**

1. *Tela de dados:* "Página em `mx-auto max-w-6xl`. Cabeçalho: rótulo do
   período em `text-rotulo uppercase tracking-[0.14em] text-ink-mute`, `h1`
   em `font-display text-2xl font-semibold tracking-tight`, subtítulo em
   `text-corpo text-ink-mute` que conclui o período, `FrescorDosDados`
   embaixo; à direita, `GrupoDePilulas` com 7, 30 e 90 dias. Depois, grade
   `gap-4 sm:grid-cols-2 lg:grid-cols-4` de cartões de número."
2. *Cartão de número:* "`rounded-2xl border border-line bg-panel p-4
   shadow-subtle`; rótulo `text-rotulo uppercase tracking-[0.1em]
   text-ink-mute`; número `text-[26px] font-semibold leading-none
   tabular-nums text-ink`; `Delta` e 'de R$ X' em `text-rotulo`. Sem dado:
   'Sem medida' em `text-ink-mute` e o motivo embaixo."
3. *Tabela:* "`DataTable` dentro de `Card className="p-6"` com `CardHeader`.
   Colunas de número com `alinhar: "direita"`. Célula sem valor: texto em
   `text-apoio text-ink-mute` ('Sem medida'), nunca traço."
4. *Aviso com ação:* "`Alert tom="warning" titulo="..."` com uma frase do que
   aconteceu e do que fazer, e `ButtonLink variant="secondary" size="sm"`
   para a tela que resolve."

**Antes de dar a tela por pronta:** dois temas, celular (375px), teclado (Tab,
Esc), nenhum hex solto, nenhum travessão, ausência escrita por extenso, um
`primary` só.
