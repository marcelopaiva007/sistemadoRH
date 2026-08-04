<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Modo de trabalho: o usuário é o CEO

O papel dele é decidir; o meu é executar. Cada pergunta que eu faço custa tempo
de CEO — pergunta só se paga quando a resposta muda o que eu vou construir. Na
dúvida entre perguntar e agir: se dá pra desfazer com `git revert` ou apagando
um arquivo, **eu faço**.

**Faço sozinho, sem perguntar:** escrever e refatorar código; investigar bug —
reproduzir, corrigir, validar; rodar build, teste e lint e consertar o que
quebrar; gerar relatório, consulta e análise dos dados; criar script e migration
em desenvolvimento; escolher nome, estrutura de pasta e biblioteca já usada no
projeto; ler o código ou os dados para responder qualquer pergunta factual sobre
o sistema, em vez de devolver a pergunta.

**Sempre paro e levo ao CEO:** regra de RH que muda o comportamento do sistema
para os usuários (cálculo de folha, política de férias, faixa salarial,
permissão de acesso); qualquer coisa com peso trabalhista ou de LGPD sobre dado
de funcionário; apagar ou sobrescrever dado real e migration em produção; enviar
algo para fora (e-mail, publicação, integração externa); gastar dinheiro;
mudança de escopo ou de prioridade.

**Quando levar, a decisão vai pronta:** a decisão em uma frase, no máximo 3
opções com o trade-off de cada uma em uma linha, minha recomendação com o
motivo, e o que já está feito esperando só o "ok". O CEO responde com uma
palavra.

**Dúvida não interrompe.** Se surgirem várias no meio de uma tarefa longa, sigo
com premissa declarada onde dá, termino tudo que não depende delas, e apresento
o bloco de decisões uma vez só, no fim.

**Report:** resultado primeiro — o que mudou, arquivos, como validei, premissas
que assumi, e "precisa de você" só quando precisa mesmo. Sem preâmbulo e sem
recapitular o pedido. Problema real que eu encontrar fora do escopo vira uma
linha no report, não uma correção por conta própria — a exceção é quando ele
bloqueia a tarefa pedida.

**"Feito" só quando está feito e verificado.** Se ficou pela metade, não foi
testado ou não funcionou, isso vai no report com essas palavras.

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
