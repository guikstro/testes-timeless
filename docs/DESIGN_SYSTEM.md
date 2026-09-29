# Design system

A interface da Timeless é minimalista, premium e de tipografia forte: muito
espaço, pouca decoração, e densidade só onde o dado pede. Este documento diz
de onde vêm as peças e como usá-las. Para ver todas em uso, nos dois temas,
abra `/design` logado como alguém da equipe Timeless.

Os valores (cor por tema, tamanhos, raios, sombras), a especificação de cada
componente e as regras do produto, no formato que ferramentas de IA leem,
estão em [`DESIGN.md`](../DESIGN.md), na raiz. Um teste confere as cores de lá
contra o `globals.css`.

## Regra de ouro

Tela não inventa estilo. Cor, tamanho de texto, raio, sombra e movimento vêm
dos tokens; controles vêm de `apps/web/src/components/ui`. Se falta uma peça,
ela nasce em `components/ui` e entra no catálogo, e não solta numa tela.

## Tokens

Definidos em `tailwind.config.ts` e `app/globals.css`, com valor por tema.
As telas usam o papel, nunca o tom: `text-ink`, e não `text-stone-900`.

| Grupo | Tokens | Uso |
|---|---|---|
| Superfície | `canvas`, `panel`, `panel-soft`, `line` | Fundo da página, cartões, áreas internas, bordas |
| Texto | `ink`, `ink-soft`, `ink-mute` | Principal, secundário, apoio |
| Marca | `accent`, `brand`, `brand-soft`, `brand-ink` | Muda por cliente; nunca para estado |
| Estado | `danger`, `warning`, `success`, `info`, cada um com `-soft` e `-line` | Erro, atenção, sucesso, informação: tinta, fundo suave e borda |
| Texto (tamanho) | `text-rotulo`, `text-apoio`, `text-corpo`, `text-destaque` | Rótulo, texto de apoio, corpo, número em destaque. Títulos usam `font-display` com `text-xl`/`text-2xl` |
| Raio | `rounded-lg` a `rounded-3xl`, `rounded-full` para botões | Cantos generosos |
| Sombra | `shadow-subtle`, `card`, `lifted`, `pop` | Da mais rente à que flutua (menus, diálogos) |
| Movimento | `ease-soft`, `animate-rise-in`, `fade-in`, `pop-in`, `slide-in-right` | Entradas que assentam; quem pede menos movimento recebe menos |

Nunca `red-600` e `dark:red-400` escritos numa tela: é `text-danger`, e o tema
troca num lugar só. As exceções são os pontos sólidos de status (`bg-red-500`,
`bg-emerald-500`, `bg-amber-500`), que funcionam nos dois temas, e o âmbar que
marca a visita do suporte.

## Componentes

| Componente | Arquivo | Quando usar |
|---|---|---|
| `Button`, `ButtonLink` | `button.tsx` | Ação (`primary` uma por tela, `secondary`, `ghost`, `danger`, `accent`). Ir para outra tela é `ButtonLink` |
| `Input`, `Select`, `Textarea`, `SearchInput` | `input.tsx` | Campos. Sempre dentro de `Field` |
| `Field` | `input.tsx` | Rótulo, dica e erro ligados ao campo (`aria-describedby`, `aria-invalid`) |
| `Checkbox`, `Radio`, `RadioGroup`, `Switch` | `choice.tsx` | Marcar (vale ao enviar), escolher uma, ligar (vale na hora) |
| `DatePicker`, `DateRangePicker` | `date.tsx` | Dia civil; intervalo com atalhos e fim nunca antes do começo |
| `Combobox` | `combobox.tsx` | Escolher numa lista longa digitando, sem se importar com acento |
| `Card`, `CardHeader` | `card.tsx` | Superfície |
| `Badge` | `badge.tsx` | Estado curto, sempre com texto |
| `Alert` | `alert.tsx` | Mensagem que fica na tela, com ação opcional |
| `useToast` | `toast.tsx` | Confirmação ou falha passageira de algo que a pessoa acabou de fazer |
| `Dialog`, `Drawer`, `Sheet` | `dialog.tsx` | Decidir; detalhar ao lado; painel que sobe no celular |
| `ConfirmationDialog`, `ConfirmButton` | `dialog.tsx` | Confirmar quando a consequência precisa de um parágrafo |
| `InlineConfirm` | `inline-confirm.tsx` | Confirmar no próprio botão, em dois toques: o padrão para remover, apagar, pausar |
| `Tooltip` | `tooltip.tsx` | Explicar algo no mouse e no foco. Nada essencial mora aqui |
| `DropdownMenu` | `menu.tsx` | Ações extras de um item |
| `GrupoDePilulas` | `pill-group.tsx` | Filtro ou navegação por endereço (abas que são páginas) |
| `Tabs` | `tabs.tsx` | Trocar conteúdo na mesma tela, sem mudar o endereço |
| `DataTable`, `Pagination` | `table.tsx`, `pagination.tsx` | Dados em tabela (empilha no celular) e páginas por link |
| `Skeleton`, `EmptyState`, `ErrorState` | `skeleton.tsx`, `state.tsx` | Carregando com a forma do conteúdo; vazio e erro com o próximo passo |
| `FrescorDosDados` | `frescor.tsx` | De quando é o dado da tela ("Google Ads atualizado há 12 min"), embaixo do subtítulo |

## Como não quebrar

- **`cn` não resolve conflito.** Entre `w-full` e `w-40` na mesma lista vence
  a que o Tailwind gera por último, não a que vem por último. Por isso os
  componentes não trazem valor que quem usa precise trocar, ou só o aplicam
  quando quem usa não trouxe o seu (largura e altura dos campos).
- **Teclado primeiro.** Todo componente que abre algo fecha com Esc e devolve
  o foco; menus e abas andam com setas. Nada essencial depende de passar o mouse.
- **Estado com palavra.** Cor nunca é o único sinal: selos e avisos têm texto
  e ícone.
- **Confirmação.** Ação que não se desfaz pede dois toques (`InlineConfirm`) ou
  um diálogo (`ConfirmationDialog`) com as palavras da ação ("Remover Ana"), e
  o foco começa em Cancelar.

## O que ainda está à mão

Ficaram botões, campos e tabelas escritos direto nas telas mais antigas. A
regra para eles: ao mexer numa tela, troque pelo componente. Para achá-los:

```bash
grep -rn "<button\|<input\|<select\|<table" apps/web/src/app --include="*.tsx"
```
