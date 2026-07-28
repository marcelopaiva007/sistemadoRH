<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
