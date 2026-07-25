# Sistema do RH — LM Telecom

Aplicação de RH multi-empresa. Duas frentes hoje:

1. **Departamento Pessoal** — ficha completa do colaborador, dossiê digital,
   dependentes, férias (CLT), ausências/atestados, central de aprovações,
   painel de vencimentos, trilha de auditoria LGPD e o **portal do colaborador**
   (autoatendimento pelo celular, com login pelo bot do Telegram).
2. **Pesquisas** — clima organizacional (dimensões GPTW) e Avaliação de Riscos
   Psicossociais NR-01/PGR, com envio de convites por Telegram/e-mail, respostas
   anônimas por link com token e relatório em PDF.

Cada empresa (LM Telecom, Centrysol, VAPT, ...) tem seus próprios setores,
posições, colaboradores e pesquisas — tudo filtrado por `empresaId` nas queries
e nas server actions.

Stack: Next.js 16 (App Router) · React 19 · Prisma 7 + PostgreSQL · NextAuth v5
· Tailwind 4 + shadcn/ui · Recharts · Playwright (PDF). Deploy na Vercel.

> Histórico: este repositório começou como `lm-bonificacao` (motor de
> bonificação de vendas). Esse módulo foi removido em 23/07/2026 e o app passou
> a ser exclusivamente o Sistema do RH. Em 25/07/2026 o último vínculo com o
> lm-bonificacao — a tabela de login `shared.User`, que as duas aplicações
> dividiam — foi desfeito: o RH passou a ter o seu próprio `rh.User`. Os dois
> apps ainda moram no mesmo banco Neon, mas em schemas separados, e **nenhum
> objeto do schema `rh` referencia objeto de fora dele**. Como o cadastro de
> usuários nasceu de uma cópia, criar usuário ou trocar senha aqui não muda
> nada no outro sistema — e vice-versa.

## Rodando local

```bash
npm install
npm run db:migrate   # aplica as migrations
npm run db:seed      # cria usuários e empresas iniciais (imprime as senhas geradas)
npm run dev
```

Abra http://localhost:3000 — a raiz redireciona para `/login`.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres (Prisma) |
| `AUTH_SECRET` | assinatura de sessão do NextAuth v5. **Precisa ser diferente do valor usado pelo lm-bonificacao** — dois apps com o mesmo segredo aceitam o token de sessão um do outro (ver "Separação do lm-bonificacao") |
| `NEXT_PUBLIC_APP_URL` | URL pública — monta o link do convite (`/responder/<token>`) |
| `TELEGRAM_BOT_TOKEN` | canal preferido de convite + webhook que vincula o `chat_id` do colaborador |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | fallback de convite por e-mail (Resend) |
| `CRON_SECRET` | protege `/api/cron/enviar-convites` |
| `SEED_*` | usuários/senhas fixos no seed (opcional; sem eles o seed gera senha aleatória) |

## Separação do lm-bonificacao

Em 25/07/2026 o Sistema do RH foi desacoplado do lm-bonificacao. O que mudou:

| Antes | Agora |
|---|---|
| Login na tabela `shared.User`, a mesma dos dois apps | `rh.User`, própria deste app (cadastro nasceu de uma cópia) |
| FK `rh.Pesquisa.criadoPorId → shared.User` | FK para `rh.User` — nenhuma referência sai do schema `rh` |
| `datasource schemas = ["shared", "rh"]` | `["rh"]` — este app não enxerga mais schema de outro app |
| Mesmo `AUTH_SECRET` nos dois | segredos distintos |

**O `AUTH_SECRET` importa tanto quanto a tabela.** Com o mesmo segredo, um token
de sessão emitido por um app é aceito pelo outro — e, rodando os dois em
`localhost`, o cookie nem muda de dono, porque cookie ignora porta. O `.env`
local já foi separado; **na Vercel o segredo deste projeto precisa ser trocado
por um valor próprio** (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
Trocar derruba as sessões abertas uma vez — todo mundo faz login de novo.

Consequência do cadastro separado: criar usuário ou trocar senha aqui não muda
nada no lm-bonificacao, e vice-versa. As senhas do momento do corte continuam
valendo nos dois (os hashes foram copiados), mas evoluem em separado.

O que ainda é comum: o mesmo banco Neon (schemas distintos), a tabela
`_prisma_migrations` (bookkeeping do Prisma, sem dado de negócio) e o bot do
Telegram. Separar em bancos distintos, se um dia for preciso, é um
`pg_dump --schema=rh` — não há mais nenhuma amarra de dados a desfazer.

`npm run test:desacoplamento` confere tudo isso contra o banco.

## Papéis de acesso

| Papel | Enxerga |
|---|---|
| `ADMIN` | tudo, todas as empresas, cadastro de usuários |
| `DIRETORIA` | painéis e relatórios de RH |
| `RH_MANAGER` | só a própria empresa (`empresaId`) |
| `GESTOR_SETOR` | só `/rh/meu-setor`, escopado a `empresaId` + `setorId` |

## Departamento Pessoal

- **Ficha completa** (`/rh/<empresa>/colaboradores/<id>`): identificação,
  documentos, endereço, contato de emergência, dados bancários e vínculo. Cada
  bloco é um formulário próprio e a action grava **só os campos que vieram** —
  um bloco nunca apaga o outro.
- **Dossiê digital**: RG, CTPS, contrato, ASO, certificados de NR. O arquivo é
  guardado no Postgres (`rh."Arquivo"`, bytea) e não num blob público — sai só
  por `/api/rh/<empresa>/arquivos/<id>` autenticado, e **todo download entra na
  auditoria**. Teto de 4 MB por anexo (`TAMANHO_MAXIMO_ANEXO`); o limite de
  corpo de server action está em 5 MB no `next.config.ts`.
- **Férias**: os períodos aquisitivos **não ficam no banco** — são derivados da
  data de admissão em `lib/ferias.ts`. Sem data de admissão preenchida, o
  colaborador não entra no controle de férias. Regras aplicadas: 30 dias por
  período, abono de até 10 dias, fracionamento em até 3 períodos (mínimo 5 dias,
  um deles com 14+), e alerta ao chegar perto do fim do período concessivo
  (12 meses após o aquisitivo — CLT art. 137). Fora do escopo: redução do
  direito por faltas injustificadas (art. 130).
- **Ausências**: atestados, faltas, licenças e afastamentos, com anexo. Ausência
  *abonada* não conta como falta no absenteísmo.
- **Aprovações** (`/rh/<empresa>/aprovacoes`): férias e ausências pendentes num
  lugar só. Aprovar férias revalida o saldo — entre o pedido e a decisão outro
  período pode ter consumido os dias.
- **Vencimentos** (`/rh/<empresa>/vencimentos`): documentos vencendo em até 60
  dias (`DIAS_ALERTA_VENCIMENTO`) e férias chegando no limite legal.
- **Auditoria** (`/rh/<empresa>/auditoria`): append-only. Valores sensíveis
  (salário, conta, PIX, CPF, RG, PIS) entram no log como "(alterado)" — a trilha
  registra **que** mudou, nunca o conteúdo. CID de atestado nunca é logado.

Datas de calendário (admissão, férias, validade) são gravadas e exibidas em
**UTC** via `lib/datas.ts`. Tratadas no fuso local, apareceriam um dia antes no
Brasil (UTC−3) em produção, onde o servidor roda em UTC.

## Portal do colaborador

`/portal` — autoatendimento pelo celular: saldo e programação de férias,
ausências, documentos para baixar e os próprios dados cadastrais. Só consulta;
pedir férias e enviar atestado continuam passando pelo RH.

**O login é o bot do Telegram.** O colaborador não tem usuário no sistema. Ele
envia `/portal` ao bot e recebe, *só naquele chat*, um link de vida curta
(`MINUTOS_VALIDADE_LINK`) e **uso único**; abrir o link queima o token e cria uma
sessão em cookie de `HORAS_VALIDADE_SESSAO`. Para entrar é preciso controlar o
Telegram já vinculado àquela pessoa — na prática, um segundo fator, e sem
transformar o RH em balcão de "esqueci a senha".

Decisões de segurança que valem lembrar antes de mexer:

- **Tokens são guardados como SHA-256**, nunca em claro. Diferente do
  `SurveyToken`, que é link permanente para uma pesquisa anônima, aqui o token
  abre salário e documentos.
- **Confirmação de CPF na primeira entrada** (`Colaborador.portalVerificadoEm`).
  O vínculo do Telegram casa pelos últimos 8 dígitos do telefone vindo do
  elleven: margem tolerável para convidar a uma pesquisa, inaceitável para abrir
  a ficha. Erradas `MAXIMO_TENTATIVAS_CPF` vezes, a sessão morre.
- **Pedir um link novo invalida o anterior** — no máximo um link vivo por vez.
- **Downloads têm rota própria** (`/api/portal/arquivos/[id]`), que amarra o
  arquivo ao dono da sessão: id de anexo de um colega devolve 404.
- `/portal` é liberado no `auth.config.ts` porque tem autenticação própria —
  passar pelo NextAuth mandaria o colaborador para uma tela de login que não é
  dele.
- A auditoria do portal grava o colaborador como ator (`ator` em
  `registrarAuditoria`), já que não há usuário NextAuth na sessão.

## Envio de convites

- Canal preferido **Telegram** (quando o colaborador tem `telegramChatId`
  vinculado pelo webhook); **fallback e-mail**.
- Teto global de **90 envios por dia-calendário de Brasília**
  (`LIMITE_DIARIO_ENVIOS` em `lib/constants-rh.ts`) — margem sob o limite do
  plano do provedor de e-mail.
- O cron `/api/cron/enviar-convites` roda **1×/dia às 13:00 UTC (10:00 BRT)**
  (ver `vercel.json`) e envia **por setor**: completa os setores menores
  primeiro e usa o resto do orçamento para avançar num setor grande. Em poucos
  dias toda a base é coberta sem estourar o limite.
- Convites `FAILED` **não** são retentados automaticamente — reenvio é manual
  na tela.
- `/responder/[token]` é **público**: quem responde entra pelo token, sem login.
- Anonimato: agregados só aparecem com no mínimo **3 respostas**
  (`AMOSTRA_MINIMA_ANONIMATO`); em pesquisa anônima a `Resposta` nunca grava
  `colaboradorId`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run diag:envios` | diagnóstico **read-only**: quanto do teto do dia já foi usado, o que falhou e por quê, quantos colaboradores estão sem contato |
| `npm run test:ferias` | testes do motor de férias CLT e das datas de calendário (não toca o banco) |
| `npm run test:portal` | testes do acesso ao portal (hash do token, uso único, expiração, CPF) — limpa o que cria |
| `npx tsx scripts/portal-e2e.ts preparar\|alheio\|limpar` | colaborador descartável para conferir o portal no navegador sem tocar em dado de gente real |
| `npm run smoke:dp` | fumaça do DP contra o banco real — ficha, anexo em bytea, férias, ausência e auditoria, **sempre em rollback** |
| `npx tsx scripts/aplicar-migracao.ts <nome> [--dry]` | aplica um `migration.sql` à mão, em transação (ver "Notas sobre o banco") |
| `npx tsx scripts/importar-colaboradores-elleven.ts [--dry]` | importa/atualiza colaboradores a partir das exportações do elleven (upsert idempotente por CPF → cód. elleven → nome) |
| `npx tsx scripts/configurar-telegram-webhook.ts` | registra o webhook do bot do Telegram |
| `npm run db:studio` | Prisma Studio |

## Notas sobre o banco

Parte do histórico de migrations foi aplicada direto no banco, fora do fluxo do
Prisma (ver o cabeçalho de
`prisma/migrations/20260721120000_sync_funcionario_contato_e_elleven_relatorio`).
Ao rodar `prisma migrate` contra produção, confira o diff antes de aplicar.

O banco Neon é compartilhado com outras aplicações do grupo, cada uma no seu
schema: `rh` (este app), `bonificacao` (lm-bonificacao), `vapt` (painel de
postos) e `shared` (o antigo login comum, hoje usado só pelo lm-bonificacao).
**Este app enxerga apenas o schema `rh`** — é o que o `datasource` declara, e
não há nenhuma FK saindo dele. Isso mantém a separação em bancos distintos a um
`pg_dump --schema=rh` de distância, se um dia for preciso.

Aplicar migration aqui não usa `prisma migrate deploy`: os apps dividem a
tabela `_prisma_migrations`, então o deploy tentaria reaplicar migrations dos
outros. Use `npx tsx scripts/aplicar-migracao.ts <nome>` (roda em transação) e
depois `npx prisma migrate resolve --applied <nome>`.
