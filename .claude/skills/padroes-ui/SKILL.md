---
name: padroes-ui
description: Padrões de UI e design já em uso no SOFTRH — paleta medida por contraste WCAG AA, tipografia, e como Table/Dialog/toast/loading são montados neste projeto. Use sempre que for criar ou editar uma tela, formulário, tabela, modal, indicador (KPI) ou estado de vazio/carregando, ou quando o usuário pedir "nova tela", "novo formulário", "tabela de X", "modal de X", mencionar cor, contraste, acessibilidade, consistência visual ou componente shadcn. Objetivo é reaproveitar o que já existe em vez de inventar um padrão novo por tela.
---

# Padrões de UI do SOFTRH

Este projeto já tem um sistema de design deliberado, não um shadcn cru. Antes
de estilizar algo do zero ou copiar um padrão de fora (tutorial, outro
projeto), verifique se já existe aqui — a maior parte do trabalho de design
já foi feita e documentada em `app/globals.css` e nos componentes existentes.

## Cores: token com significado, não decoração

Definidas em `app/globals.css`, cada uma **medida** contra WCAG AA (4,5:1
texto, 3:1 controle) — o comentário ao lado de cada token explica a medição.
Antes de trocar uma cor "porque ficou melhor", remeça o contraste; várias
opções mais bonitas já foram descartadas por reprovar por pouco.

- `--primary` (blue-600, não blue-500 — o 500 reprova) — ação principal.
- `--destructive` (red-600) — reservado para o que **exige ação** (CAT sem
  emitir, EPI vencido). Não usar para "dar destaque" a um número.
- `--warning` (amber-700) — o que vence em breve, precisa de atenção logo.
- `--success` (emerald-700) — em dia, aprovado.
- `--muted-foreground` (slate-600) — texto de apoio, célula secundária.

O sistema roda **só no claro**, de propósito — não existe bloco `.dark` nem
toggle ativo (`next-themes` está no `package.json` só porque o template do
`sonner.tsx` do shadcn importa `useTheme`; não há `ThemeProvider` em lugar
nenhum). Não implemente dark mode como parte de outra tarefa — isso é decisão
de escopo, não ajuste de tela.

## Tipografia: escala curta de propósito

`h1` → `text-xl`, `h2` → `text-lg`, `h3` → `text-sm`, todos `font-semibold`.
A escala é curta porque já existiu inflação de título (`text-2xl`, `text-xl`
e `text-lg` disputando o mesmo papel) e foi corrigida — não reintroduza
tamanho maior "pra destacar" um título.

Para bloco de texto longo, use a utility `medida-de-leitura` (definida no
`globals.css`, 34em) em vez de `max-w-prose` do Tailwind — o `max-w-prose`
mede em `ch` e nesta fonte isso dá ~87 caracteres por linha, não os 65
pretendidos.

## Componentes: Base UI, não Radix

O projeto usa `@base-ui/react`, não `@radix-ui`. Isso muda a API de
composição: os primitivos daqui usam a prop `render`, **não** `asChild`
(o padrão que aparece na maioria dos tutoriais/exemplos de shadcn). Exemplo
real em `components/ui/dialog.tsx`:

```tsx
<DialogPrimitive.Close render={<Button variant="outline" />}>
```

Os 20 primitivos já instalados ficam em `components/ui/`: alert, avatar,
badge, button, calendar, card, checkbox, dialog, dropdown-menu, input,
label, popover, radio-group, select, separator, skeleton, sonner, table,
tabs, textarea. Confira ali antes de importar ou recriar algo do zero.

`cn()` de `@/lib/utils` (clsx + tailwind-merge) é o padrão pra className
condicional em todo componente. Ícones vêm de `lucide-react`.

## Reuso de código não é o mesmo que unificar visual

`components/indicador.tsx` é o exemplo a seguir: consolidou 13
reimplementações manuais do mesmo bloco de KPI espalhadas pelo projeto, mas
**manteve as duas variantes visuais** que já existiam (`plano` = bloco com
anel, `cartao` = Card com sombra) em vez de escolher uma "no escuro". A
regra: duplicação de código é sempre bug e pode ser corrigida direto;
diferença visual só vira bug depois que alguém decide isso olhando a tela —
não decida sozinho no meio de uma tarefa que não é sobre design.

## Padrões de tela recorrentes

**Tabela** — `Table/TableHeader/TableRow/TableHead` de `components/ui/table`.
Estado vazio é uma linha só, `colSpan` cobrindo todas as colunas, texto
centralizado em `text-muted-foreground`: "Nenhum usuário cadastrado ainda."
(ver `usuarios-table.tsx`).

**Formulário em modal** — `Dialog/DialogContent/DialogHeader/DialogTitle` +
`<form action={serverAction} className="space-y-4">` usando Server Action
nativa do Next (não `react-hook-form`, apesar de estar no `package.json` —
na prática o projeto usa `useActionState`/`isPending` com form nativo) +
`DialogFooter` com `<Button type="submit" disabled={isPending}>`.

**Confirmação de ação** — `toast.success("Frase curta no passado.")`, ex.:
"Usuário atualizado.", "Senha redefinida.", "Vínculo salvo." Nunca
`alert()` nem mensagem inline solta na tela.

**Carregando por rota** — `app/.../loading.tsx` com `Skeleton` no formato da
tela real (não spinner genérico), `aria-busy="true" aria-label="Carregando"`
no wrapper (ver `app/(app)/rh/[empresaId]/loading.tsx`).

**Número em coluna/indicador** — `tabular-nums` para alinhar dígitos. Já é
regra global do CSS para `table`, `.tabular` e `[data-slot="badge"]`; fora
disso, aplique explícito (`components/indicador.tsx` faz isso no número).

**Gráfico** — o tema já expõe `--chart-1` a `--chart-5` (as únicas cores
pensadas pra série de dados); use-as em vez de escolher cor nova. Para a
montagem do gráfico em si (Recharts já está no projeto), consulte a skill
`dataviz`.

## Acessibilidade é regra daqui, não extra

- Contraste mínimo AA já medido por token — trocar cor exige remedir, não só
  olhar.
- `:focus-visible` já estilizado globalmente (`outline-2 outline-ring`) —
  não sobrescreva com `outline-none` sem repor equivalente.
- `prefers-reduced-motion` já é respeitado globalmente — animação nova deve
  herdar isso, não reimplementar a checagem.
