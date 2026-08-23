<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Como a mudança chega em produção: direto ou por PR

`master` é o que a Vercel publica. Push em `master` **vai ao ar na hora**, sem
etapa intermediária. Por isso a entrega tem dois caminhos, e a escolha não é de
gosto:

**Vai por PR** quando a mudança toca em qualquer um destes:

- **escopo de empresa ou marca** — `?empresas=`, o `<empresaId>` do caminho,
  `empresasVisiveis`, `escopo-marca`, qualquer conta de "quais CNPJs esta tela
  enxerga";
- **permissão e papel** — guardas de auth, RBAC, quem vê ou faz o quê;
- **gravação de dado** — server action que cria/edita/apaga, migration.

**Pode ir direto em `master`**: ajuste de tela, texto, estilo, documentação,
entrada de changelog — o que não muda escopo, permissão nem dado.

Motivo, com nome e data: em 22/08/2026 o seletor de marca/CNPJ da barra de topo
(v1.105.0) subiu direto e levou junto um defeito de escopo — escolher uma marca
de vários CNPJs estando dentro de outra deixava o `<empresaId>` do caminho na
marca antiga. Consequência dupla e silenciosa: telas escopadas por marca
apareciam **zeradas**, e "Abrir competência" na Folha **gravava no CNPJ errado**
sem dizer nada. Ficou em produção por dois deploys até uma auditoria pegar. A
classe do erro — escopo multi-empresa — é exatamente a que não dá erro na tela:
ela mostra um número plausível e errado.

O PR também resolve o lado prático da verificação: a Vercel publica **um
endereço de teste por PR**, com banco e login de verdade. Sem ele, conferir
mudança de tela depende de dev server local, que não é ambiente confiável para
dizer "está funcionando".

Sem `gh` instalado na máquina, o caminho é: empurrar o branch e abrir
`https://github.com/marcelopaiva007/sistemadoRH/compare/master...<branch>?expand=1`,
que já cai no formulário do PR.

# Versão do sistema: sobe em todo PR

Todo PR que muda o que roda em produção **sobe a `version` do `package.json`** —
sempre, no mesmo commit da mudança:

- `patch` (1.1.0 → 1.1.1) para correção de bug e ajuste de tela;
- `minor` (1.1.0 → 1.2.0) para funcionalidade nova ou mudança de comportamento;
- `major` só em quebra grande do jeito de usar o sistema.

Motivo: a etiqueta no topo da tela (`lib/versao.ts`, canto esquerdo, também na
tela de login) mostra `v<versão> · <commit>`, e é por ela que o RH responde
"estou vendo a versão nova ou a antiga?" sem abrir o GitHub. O commit sozinho
não serve para conversa — ninguém decora sha. Se a versão não sobe, duas
entregas diferentes aparecem com o mesmo número na tela.
