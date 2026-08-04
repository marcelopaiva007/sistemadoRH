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

# Armadilhas conhecidas (Next 16)

Exemplos concretos do aviso lá em cima — cada um já custou tempo tentando o
jeito "normal" do Next antes de descobrir que mudou:

- **`middleware.ts` não existe mais.** Foi renomeado para `proxy.ts` (ver
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
  Um `middleware.ts` na raiz é simplesmente ignorado — build passa,
  ninguém avisa, e o código nunca roda. Este projeto já tem `proxy.ts` na
  raiz cuidando da autenticação (NextAuth); headers de resposta globais
  (segurança, CORS) entram em `next.config.ts` → `async headers()` em vez
  de mexer no proxy, porque `headers()` do next.config roda antes do proxy
  na cadeia de execução e fica independente da lógica de auth.
- **`exactOptionalPropertyTypes` no `tsconfig.json` quebra a build hoje.**
  Gera ~20 erros em componentes/actions que passam `undefined` explícito
  onde o Prisma/React esperam a prop ausente. Não é erro de digitação —
  é o jeito como o código foi escrito em todo o projeto. Ativar essa flag
  exige revisar cada ocorrência primeiro, não é mudança de config isolada.
  `noUnusedLocals`/`noUnusedParameters` têm o mesmo problema em menor
  escala (código morto real, mas espalhado — não dá pra ligar como gate
  de build sem antes limpar).
