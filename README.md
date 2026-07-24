# Sistema do RH — LM Telecom

Aplicação de RH multi-empresa: pesquisa de **clima organizacional** (dimensões
GPTW) e **Avaliação de Riscos Psicossociais NR-01/PGR**, com envio de convites
por Telegram/e-mail, respostas anônimas por link com token e relatório em PDF.

Cada empresa (LM Telecom, Centrysol, VAPT, ...) tem seus próprios setores,
posições, colaboradores e pesquisas — tudo filtrado por `empresaId` nas queries
e nas server actions.

Stack: Next.js 16 (App Router) · React 19 · Prisma 7 + PostgreSQL · NextAuth v5
· Tailwind 4 + shadcn/ui · Recharts · Playwright (PDF). Deploy na Vercel.

> Histórico: este repositório começou como `lm-bonificacao` (motor de
> bonificação de vendas). Esse módulo foi removido em 23/07/2026 e o app passou
> a ser exclusivamente o Sistema do RH.

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
| `AUTH_SECRET` | assinatura de sessão do NextAuth v5 |
| `NEXT_PUBLIC_APP_URL` | URL pública — monta o link do convite (`/responder/<token>`) |
| `TELEGRAM_BOT_TOKEN` | canal preferido de convite + webhook que vincula o `chat_id` do colaborador |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | fallback de convite por e-mail (Resend) |
| `CRON_SECRET` | protege `/api/cron/enviar-convites` |
| `SEED_*` | usuários/senhas fixos no seed (opcional; sem eles o seed gera senha aleatória) |

## Papéis de acesso

| Papel | Enxerga |
|---|---|
| `ADMIN` | tudo, todas as empresas, cadastro de usuários |
| `DIRETORIA` | painéis e relatórios de RH |
| `RH_MANAGER` | só a própria empresa (`empresaId`) |
| `GESTOR_SETOR` | só `/rh/meu-setor`, escopado a `empresaId` + `setorId` |

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
| `npx tsx scripts/importar-colaboradores-elleven.ts [--dry]` | importa/atualiza colaboradores a partir das exportações do elleven (upsert idempotente por CPF → cód. elleven → nome) |
| `npx tsx scripts/configurar-telegram-webhook.ts` | registra o webhook do bot do Telegram |
| `npm run db:studio` | Prisma Studio |

## Notas sobre o banco

Parte do histórico de migrations foi aplicada direto no banco, fora do fluxo do
Prisma (ver o cabeçalho de
`prisma/migrations/20260721120000_sync_funcionario_contato_e_elleven_relatorio`).
Ao rodar `prisma migrate` contra produção, confira o diff antes de aplicar.
