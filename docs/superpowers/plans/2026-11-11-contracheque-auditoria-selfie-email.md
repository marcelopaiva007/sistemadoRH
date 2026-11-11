# Auditoria de Contracheques, Validação Facial de Selfie, E-mail Único por Grupo e Logs SMTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as 4 frentes solicitadas nas OS da FASTMAI/BRNET CLOUD: (1) invalidação auditável de assinatura de contracheque com preservação forense e reenvio explícito; (2) bloqueio híbrido de selfies sem rosto humano / lisas (cliente + `sharp` + Claude Vision); (3) unicidade de e-mail entre colaboradores distintos em todas as marcas do grupo (bloqueio na escrita + alerta de duplicados); (4) instrumentação completa de `EmailEnviado` com painel `/admin/logs-email` + exportação CSV e query SQL pronta para extração dos logs de produção de 09–10/11/2026.

**Architecture:**
- Todas as regras puras vivem em módulos desacoplados em `lib/` (`lib/contracheques/invalidacao.ts`, `lib/contracheques/validar-selfie.ts`, `lib/colaborador-email.ts`, extensão de `lib/duplicados.ts` e `lib/email.ts`), permitindo testes unitários rápidos com `tsx` sem necessidade de banco real.
- O snapshot forense de assinaturas invalidadas fica em `ReciboContrachequeInvalidado` (mantendo links imutáveis para `Arquivo` de foto e PDF selado e bloqueando exclusão acidental em `recibosConfirmadosTravando()`), enquanto o registro `ReciboContracheque` 1:1 volta para estado pendente com novo `tokenAssinatura` pronto para reenvio.
- As mudanças tocam schema/migration, server actions, multi-marca/grupo e proteção biométrica — entrega obrigatória por **Pull Request** com bump de versão para **v1.203.0** (`AGENTS.md`).

**Tech Stack:** Next.js 16 (App Router / Server Actions), Prisma 7 (`@@schema("rh")`, PostgreSQL), `sharp` + `@img/sharp-libvips-linux-x64`, `@anthropic-ai/sdk` (`claude-sonnet-5`), Nodemailer SMTP, Zod v4, Tailwind/shadcn-ui, `tsx` para testes e smokes.

---

## Global Constraints

1. **Multi-tenant e escopo (`AGENTS.md`):**
   - Nenhuma query de lista ou validação pode vazar dados entre `Grupo`s distintos.
   - `ReciboContrachequeInvalidado` e ações de invalidação em `lib/actions/rh-contracheques.ts` devem passar obrigatoriamente por `podeOperarEmpresaRH(user, doc.empresaId)`.
   - A tela `/admin/logs-email` e a rota `/api/admin/logs-email/csv` são restritas ao painel MASTER (`requireAreaAdmin()` na página, `requireMaster()` na rota de download).
2. **Integridade de prova e não-regressão do Ponto:**
   - `lib/ponto-foto.ts` (`fotoDeBatidaValida`) **não** deve ser alterado para exigir IA nem contraste estrito que quebre `scripts/test-ponto-foto.ts`; a validação biométrica/facial vive isolada em `app/portal/selfie.ts` e `lib/contracheques/validar-selfie.ts`.
   - `recibosConfirmadosTravando()` em `lib/contracheques/protecao.ts` deve impedir apagar `DocumentoColaborador` ou `Colaborador` mesmo após invalidação de assinatura, pois `ReciboContrachequeInvalidado` é prova de auditoria/fraude.
3. **Empacotamento Vercel e CI:**
   - Nenhum código em `app/` ou `lib/` pode importar de `scripts/` (excluído do build Vercel).
   - `next.config.ts` deve incluir `./node_modules/@img/sharp-libvips-linux-x64/lib/**/*` também para `/assinar/**`, `/portal/**` e `/api/portal/**`.
   - Todas as rotas/actions públicas e testes em CI rodam sem `CHAVE_ANTHROPIC`: o validador deve usar `sharp` determinístico e degradar graciosamente quando `CHAVE_ANTHROPIC` não estiver configurada (ou `TESTE_SELFIE_SEM_IA=1`), **sem nunca** liberar imagem lisa/cor sólida.
   - Cada arquivo de teste unitário criado em `scripts/test-*.ts` deve ser adicionado ao workflow `.github/workflows/verificacao.yml`.
4. **Cota diária de SMTP (`LIMITE_DIARIO_ENVIOS = 85`):**
   - `orcamentoRestanteHoje()` em `lib/email.ts` continua contando apenas `ok: true` desde `inicioDoDiaSaoPaulo()` (`00:00 America/Sao_Paulo` = `03:00 UTC`). Tentativas gravadas com `status: "BLOQUEADO_TETO" | "SUPRIMIDO" | "FALHOU" | "INVALIDO"` gravam `ok: false` e **nunca** consomem a cota.

## Review Focus

- Conferência exata da migration SQL manual vs `prisma/schema.prisma` (`npm run check:migracoes` + `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma`).
- Verificar que todos os 13 pontos chamadores de `sendEmail()` propagam `origem` e, quando aplicável, `empresaId` e `marcaNome` sem quebrar mocks nos testes existentes (`scripts/test-contracheques-assinatura-action.ts`, `scripts/smoke-contracheques*.ts`).
- Garantir que `scripts/smoke-contracheques.ts` e `scripts/smoke-contracheques-assinatura.ts` testam a rejeição de imagens lisas e usam fixture texturizada válida para o caminho feliz.

---

## Mapa de Arquivos Afetados

- **Banco / Prisma / SQL:**
  - Modify: `prisma/schema.prisma`
  - Create: `prisma/migrations/20261111120000_contracheque_auditoria_email_logs/migration.sql`
  - Create: `scripts/sql/extrair-logs-smtp-2026-11-09-10.sql`
- **Frente 1 — Invalidação & Reenvio:**
  - Create: `lib/contracheques/invalidacao.ts`
  - Modify: `lib/contracheques/protecao.ts`
  - Modify: `lib/actions/rh-contracheques.ts`
  - Modify: `app/(app)/rh/[empresaId]/contracheques/page.tsx`
  - Modify: `app/(app)/rh/[empresaId]/contracheques/contracheques-view.tsx`
  - Create: `scripts/test-contracheques-invalidacao.ts`
- **Frente 2 — Validação Facial Híbrida:**
  - Modify: `app/portal/selfie.ts`
  - Modify: `app/assinar/[token]/pagina-assinatura.tsx`
  - Modify: `app/portal/confirmar-contracheques-card.tsx`
  - Create: `lib/contracheques/validar-selfie.ts`
  - Modify: `lib/actions/assinatura-contracheque.ts`
  - Modify: `lib/contracheques/confirmar.ts`
  - Modify: `next.config.ts`
  - Create: `scripts/test-selfie-validacao.ts`
  - Modify: `scripts/smoke-contracheques.ts`
  - Modify: `scripts/smoke-contracheques-assinatura.ts`
  - Modify: `scripts/test-contracheques-assinatura-action.ts`
- **Frente 3 — E-mail Único por Grupo & Duplicados:**
  - Create: `lib/colaborador-email.ts`
  - Modify: `lib/actions/rh-colaboradores.ts`
  - Modify: `lib/actions/rh-ficha.ts`
  - Modify: `lib/actions/rh-admissao.ts`
  - Modify: `lib/actions/portal-cadastro.ts`
  - Modify: `lib/actions/rh-importacao.ts`
  - Modify: `lib/duplicados.ts`
  - Modify: `app/(app)/rh/[empresaId]/colaboradores/page.tsx`
  - Modify: `app/(app)/rh/[empresaId]/colaboradores/colaboradores-table.tsx`
  - Modify: `app/(app)/rh/[empresaId]/colaboradores/alerta-duplicados.tsx`
  - Create: `scripts/test-colaborador-email-unico.ts`
- **Frente 4 — Logs SMTP & Painel `/admin/logs-email`:**
  - Modify: `lib/email.ts`
  - Modify: call sites de `sendEmail()` (`lib/contracheques/envio.ts`, `lib/actions/rh-contracheques.ts`, `lib/actions/assinatura-contracheque.ts`, `lib/convites.ts`, `app/api/cron/lembrete-pesquisa/route.ts`, `lib/convite-portal.ts`, `lib/cobranca-rh-pendencias.ts`, `lib/pesquisa-notificacoes.ts`, `lib/alertas.ts`, `lib/informativos.ts`, `lib/regua-cobranca.ts`, `lib/actions/usuarios.ts`, `lib/actions/recuperacao-senha.ts`, `lib/cobranca-cadastro-colaborador.ts`, `lib/delegacoes/*.ts`)
  - Create: `app/admin/(painel)/logs-email/page.tsx`
  - Create: `app/api/admin/logs-email/csv/route.ts`
  - Modify: `app/admin/(painel)/admin-topbar.tsx`
  - Create: `scripts/test-email-logs.ts`
- **CI e Versão:**
  - Modify: `.github/workflows/verificacao.yml`
  - Modify: `package.json` (`1.202.0` -> `1.203.0`)

---

## Task 1: Schema Prisma, Migration SQL e Regeneração do Cliente

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261111120000_contracheque_auditoria_email_logs/migration.sql`

- [ ] **Step 1: Inspecionar relações exatas em `prisma/schema.prisma`**

Ler os blocos exatos de `Empresa`, `Colaborador`, `DocumentoColaborador`, `Arquivo`, `ReciboContracheque` e `EmailEnviado` em `prisma/schema.prisma` para conferir os nomes exatos de campos e relações reversas antes de editar.

```bash
rg -n "model (Empresa|Colaborador|DocumentoColaborador|Arquivo|ReciboContracheque|EmailEnviado)\b" prisma/schema.prisma
```

- [ ] **Step 2: Atualizar `prisma/schema.prisma` com `ReciboContrachequeInvalidado` e campos de `EmailEnviado`**

1. No `model ReciboContracheque`:
   - Adicionar `invalidacoes ReciboContrachequeInvalidado[]`.
2. Criar `model ReciboContrachequeInvalidado`:
   ```prisma
   model ReciboContrachequeInvalidado {
     id                   String    @id @default(cuid())
     reciboId             String
     documentoId          String
     empresaId            String
     colaboradorId        String
     motivo               String
     invalidadoPorId      String
     invalidadoPorNome    String
     invalidadoEm         DateTime  @default(now())
     canalOriginal        String?
     enviadoEmOriginal    DateTime?
     cienciaTelegramEm    DateTime?
     vistoEmOriginal      DateTime?
     codigoValidadoEm     DateTime?
     canalCodigo          String?
     confirmadoEmOriginal DateTime
     confirmadoIp         String?
     confirmadoDispositivo String?
     confirmadoLocalizacao String?
     hashDocumento        String?
     textoAceite          String?
     fotoArquivoId        String?
     comprovanteArquivoId String?

     recibo      ReciboContracheque   @relation(fields: [reciboId], references: [id], onDelete: Restrict)
     documento   DocumentoColaborador @relation(fields: [documentoId], references: [id], onDelete: Restrict)
     empresa     Empresa              @relation(fields: [empresaId], references: [id], onDelete: Cascade)
     colaborador Colaborador          @relation(fields: [colaboradorId], references: [id], onDelete: Restrict)
     fotoArquivo Arquivo?             @relation("ContrachequeInvalidadoFoto", fields: [fotoArquivoId], references: [id], onDelete: SetNull)
     comprovanteArquivo Arquivo?      @relation("ContrachequeInvalidadoComprovante", fields: [comprovanteArquivoId], references: [id], onDelete: SetNull)

     @@index([reciboId, invalidadoEm])
     @@index([documentoId, invalidadoEm])
     @@index([colaboradorId, invalidadoEm])
     @@index([empresaId, invalidadoEm])
     @@schema("rh")
   }
   ```
   Adicionar relações inversas correspondentes em `Empresa`, `Colaborador`, `DocumentoColaborador` e `Arquivo` (`"ContrachequeInvalidadoFoto"` e `"ContrachequeInvalidadoComprovante"`).
3. No `model EmailEnviado`:
   - Adicionar campos opcionais/compatíveis:
     ```prisma
     origem    String?
     empresaId String?
     marcaNome String?
     status    String   @default("ENVIADO")
     ```
   - Adicionar índices:
     ```prisma
     @@index([status, enviadoEm])
     @@index([origem, enviadoEm])
     @@index([empresaId, enviadoEm])
     ```

- [ ] **Step 3: Criar `prisma/migrations/20261111120000_contracheque_auditoria_email_logs/migration.sql`**

Gerar SQL compatível com PostgreSQL 16 (usando `IF NOT EXISTS` quando seguro e exatamente idêntico ao schema Prisma, mantendo `CREATE TABLE "rh"."ReciboContrachequeInvalidado"`, índices, FKs e `ALTER TABLE "rh"."EmailEnviado" ADD COLUMN ...`).

- [ ] **Step 4: Validar Prisma Client e checador de migrações**

Run:
```bash
npx prisma validate && npx prisma generate && npm run check:migracoes
```
Expected: exit 0 em todos os três comandos, sem erro de divergência ou schema inválido.

- [ ] **Step 5: Commit Task 1**

```bash
git add prisma/schema.prisma prisma/migrations/20261111120000_contracheque_auditoria_email_logs/migration.sql
git commit -m "feat(db): auditoria de contracheque invalidado e metadados de log SMTP"
```

---

## Task 2: Frente 1 — Invalidação de Assinatura de Contracheque e Botão Reenviar

**Files:**
- Create: `lib/contracheques/invalidacao.ts`
- Modify: `lib/contracheques/protecao.ts`
- Modify: `lib/actions/rh-contracheques.ts`
- Modify: `app/(app)/rh/[empresaId]/contracheques/page.tsx`
- Modify: `app/(app)/rh/[empresaId]/contracheques/contracheques-view.tsx`
- Create: `scripts/test-contracheques-invalidacao.ts`

- [ ] **Step 1: Escrever o teste TDD `scripts/test-contracheques-invalidacao.ts` (falhando antes da implementação)**

Testar:
1. `validarMotivoInvalidacao("")` e `validarMotivoInvalidacao("curto")` (< 10 chars) retornam erro; `"Assinatura realizada no aparelho de terceiro com foto em branco."` retorna motivo aparado válido.
2. `podeInvalidarRecibo(null)` e `podeInvalidarRecibo({ confirmadoEm: null })` retornam `ok: false` com erro claro; `podeInvalidarRecibo({ confirmadoEm: new Date() })` retorna `ok: true`.
3. `montarSnapshotInvalidacao(recibo, motivo, ator)` copia exatamente `fotoArquivoId`, `comprovanteArquivoId`, `confirmadoIp`, `confirmadoDispositivo`, `confirmadoLocalizacao`, `hashDocumento`, `textoAceite`, `canal`, `enviadoEm`, `cienciaTelegramEm`, `vistoEm`, `codigoValidadoEm`, `canalCodigo`, `confirmadoEm` sem omitir campos.
4. `camposResetAposInvalidacao(novoToken)` zera todos os carimbos de assinatura (`confirmadoEm`, `confirmadoIp`, `confirmadoDispositivo`, `confirmadoLocalizacao`, `hashDocumento`, `textoAceite`, `fotoArquivoId`, `comprovanteArquivoId`, `vistoEm`, `cienciaTelegramEm`, `codigoValidadoEm`, `codigo2faHash`, `codigoExpiraEm`, `tentativasCodigo: 0`, `bloqueadoEm`, `sessaoAssinaturaHash`, `sessaoAssinaturaExpiraEm`) e rotaciona `tokenAssinatura`.
5. Regra de ação disponível na listagem (`acoesDisponiveisParaRecibo`): permite `invalidar` só quando `situacao === "CONFIRMADO"`, e permite `reenviar` sempre que `situacao !== "CONFIRMADO"` e `temEmail` (mesmo quando `situacao === "ENVIADO" | "CIENTE" | "ABERTO" | "ATRASADO" | "BLOQUEADO" | "NAO_ENVIADO"`).

Run:
```bash
npx tsx scripts/test-contracheques-invalidacao.ts
```
Expected: FAIL (`Cannot find module '../lib/contracheques/invalidacao'`).

- [ ] **Step 2: Implementar `lib/contracheques/invalidacao.ts`**

Implementar módulo puro sem efeitos colaterais exportando:
- `TAMANHO_MINIMO_MOTIVO_INVALIDACAO = 10`
- `validarMotivoInvalidacao(motivo: string)`
- `podeInvalidarRecibo(recibo: { confirmadoEm: Date | null } | null)`
- `montarSnapshotInvalidacao(...)`
- `camposResetAposInvalidacao(novoToken: string)`
- `rotuloAcaoReenvio(enviadoAntes: boolean)`

Run:
```bash
npx tsx scripts/test-contracheques-invalidacao.ts
```
Expected: PASS (todas as asserções passando).

- [ ] **Step 3: Atualizar `lib/contracheques/protecao.ts`**

Atualizar `recibosConfirmadosTravando(tx, alvo)` para travar e contar tanto `ReciboContracheque` com `confirmadoEm IS NOT NULL` quanto registros em `rh."ReciboContrachequeInvalidado"`, além de atualizar `MSG_PROVA_DE_RECEBIMENTO` para mencionar comprovantes confirmados ou histórico de assinatura invalidada preservado.

- [ ] **Step 4: Implementar `invalidarAssinaturaContrachequeAction` em `lib/actions/rh-contracheques.ts`**

Adicionar action:
```ts
export async function invalidarAssinaturaContrachequeAction(
  empresaId: string,
  documentoId: string,
  entrada: { motivo: string; reenviarAgora?: boolean },
): Promise<{ ok: true; reenviado: boolean; erroReenvio?: string | null } | { ok: false; error: string }>
```
Fluxo exato:
1. `const user = await requireEmpresaAccess(empresaId);`
2. Validar `motivo` com `validarMotivoInvalidacao(entrada.motivo)`.
3. Buscar `documento` + `recibo` + `colaborador` (`select: { id, nome, email, cpf }`) + `empresa` (`select: { id, nome, marca: { select: { nome: true } } }`), verificar `!documento` ou `!(await podeOperarEmpresaRH(user, documento.empresaId))`.
4. Verificar `podeInvalidarRecibo(documento.recibo)`.
5. Executar em `prisma.$transaction`:
   - Re-buscar `ReciboContracheque` dentro da transação com `confirmadoEm: { not: null }` (ou condicional via `updateMany` onde `id` e `confirmadoEm: { not: null }`) para evitar dupla invalidação simultânea.
   - Inserir `tx.reciboContrachequeInvalidado.create({ data: montarSnapshotInvalidacao(...) })`.
   - Rotacionar token com `gerarTokenAssinatura()` e atualizar `tx.reciboContracheque.update({ where: { id: recibo.id }, data: camposResetAposInvalidacao(novoToken) })` (ou `updateMany` antes e `update`/`create` na ordem correta).
6. Chamar `registrarAuditoria({ empresaId: documento.empresaId, ator: atorUsuario(user), acao: "EDITAR", entidade: "ReciboContracheque", entidadeId: recibo.id, resumo: \`Invalidou assinatura do contracheque de ${documento.colaborador.nome}: ${motivoLimpo}\`, detalhes: { motivo: motivoLimpo, documentoId, fotoArquivoId: recibo.fotoArquivoId, comprovanteArquivoId: recibo.comprovanteArquivoId } })`.
7. Se `entrada.reenviarAgora` e colaborador tiver email/canal válido: acionar `avisarColaborador` / `reenviarEmailContrachequeAction` (capturando falha de SMTP/cota sem desfazer a invalidação já gravada, devolvendo `{ ok: true, reenviado: false, erroReenvio }`).
8. `revalidatePath(\`/rh/${empresaId}/contracheques\`)` e `revalidatePath("/portal")`.

- [ ] **Step 5: Atualizar `app/(app)/rh/[empresaId]/contracheques/page.tsx` e `contracheques-view.tsx`**

1. No `page.tsx`, selecionar também `invalidacoes`:
   ```ts
   invalidacoes: {
     orderBy: { invalidadoEm: "desc" },
     take: 5,
     select: {
       id: true,
       motivo: true,
       invalidadoPorNome: true,
       invalidadoEm: true,
       confirmadoEmOriginal: true,
       confirmadoIp: true,
       fotoArquivoId: true,
       comprovanteArquivoId: true,
     },
   }
   ```
   Mapear para `LinhaContracheque.invalidacoes` (datas formatadas com `formatarDataHoraBrasilia`).
2. No `contracheques-view.tsx`:
   - Atualizar `LinhaContracheque` para receber `invalidacoes`.
   - Quando `l.invalidacoes.length > 0`, exibir badge de alerta sutil (`"${l.invalidacoes.length} invalidada(s)"`) clicável que abre Dialog de histórico forense (mostrando motivo, autor/data da invalidação, data/IP da assinatura original invalidada e links de visualização/download da foto/comprovante original preservados via `/api/rh/${l.empresaId}/arquivos/${id}`).
   - Na célula de ações:
     - Quando `l.situacao === "CONFIRMADO"`, exibir botão **"Invalidar"** (`ShieldX` / `RotateCcw`) que abre Dialog com campo obrigatório `motivo` (mínimo 10 caracteres), aviso claro de que a evidência anterior fica preservada na trilha de auditoria e checkbox `"Reenviar notificação ao colaborador após invalidar"`.
     - Quando `l.situacao !== "CONFIRMADO"` e `l.temEmail`, garantir botão explícito **"Reenviar"** (em vez de ícone pequeno sem texto claro), chamando `reenviarEmailContrachequeAction`.

- [ ] **Step 6: Verificação e commit**

Run:
```bash
npx tsx scripts/test-contracheques-invalidacao.ts && npx tsx scripts/test-contracheques.ts
```
Expected: ambos passam com exit 0.

```bash
git add lib/contracheques/invalidacao.ts lib/contracheques/protecao.ts lib/actions/rh-contracheques.ts app/'(app)'/rh/'[empresaId]'/contracheques/page.tsx app/'(app)'/rh/'[empresaId]'/contracheques/contracheques-view.tsx scripts/test-contracheques-invalidacao.ts
git commit -m "feat(contracheques): invalidacao auditavel de assinatura e reenvio explicito"
```

---

## Task 3: Frente 2 — Validação Facial Híbrida (Cliente + Sharp + Claude Vision)

**Files:**
- Modify: `app/portal/selfie.ts`
- Modify: `app/assinar/[token]/pagina-assinatura.tsx`
- Modify: `app/portal/confirmar-contracheques-card.tsx`
- Create: `lib/contracheques/validar-selfie.ts`
- Modify: `lib/actions/assinatura-contracheque.ts`
- Modify: `lib/contracheques/confirmar.ts`
- Modify: `next.config.ts`
- Create: `scripts/test-selfie-validacao.ts`
- Modify: `scripts/smoke-contracheques.ts`
- Modify: `scripts/smoke-contracheques-assinatura.ts`
- Modify: `scripts/test-contracheques-assinatura-action.ts`

- [ ] **Step 1: Escrever teste TDD `scripts/test-selfie-validacao.ts`**

Testar antes da implementação:
1. Funções puras de estatística RGB/luminância para cliente e servidor: imagem sólida azul (`60,120,200`), branca (`255,255,255`) e preta (`0,0,0`) são rejeitadas determinísticamente.
2. `validarSelfieServidor(dataUrl, opts)`:
   - Rejeita data URL inválida / malformada.
   - Rejeita JPEG sólido azul 120x120 (caso exato da OS do Genilson) retornando erro amigável orientando tirar foto nítida do rosto (sem imagem lisa/escura/câmera coberta).
   - Rejeita imagem muito pequena (`< 64x64`, ex: `16x16`).
   - Aceita JPEG texturizado/ruidoso >= 128x128 com variação realista quando `detectarRostoIa` não está configurada (chave ausente / `TESTE_SELFIE_SEM_IA=1`) ou retorna `{ ok: true, rostoDetectado: true }`.
   - Rejeita o mesmo JPEG texturizado quando o detector IA (injetado no teste) retorna `{ ok: true, rostoDetectado: false, motivo: "Parede vazia" }`.
   - Permite o mesmo JPEG texturizado quando `sharp` aprovou e a chamada de IA injetada falha por timeout/erro de rede (degradação graciosa registrada via `console.warn`).

Run:
```bash
npx tsx scripts/test-selfie-validacao.ts
```
Expected: FAIL (`Cannot find module '../lib/contracheques/validar-selfie'`).

- [ ] **Step 2: Implementar análise determinística no cliente (`app/portal/selfie.ts`) e atualizar telas**

1. Em `app/portal/selfie.ts`:
   - Exportar função pura `analisarVariacaoPixels(rgba: Uint8ClampedArray): { valida: boolean; desvioLuminancia: number; percentualDominante: number }`:
     - Calcula luminância `0.299 * r + 0.587 * g + 0.114 * b` para amostra (step até 1600 pixels para O(1)).
     - Calcula desvio padrão de luminância e fração de pixels dentro de distância RGB `<= 12` da média.
     - Reprova se `desvioLuminancia < 10` ou `percentualDominante > 0.92`.
   - Exportar `async function prepararSelfieParaAssinatura(arquivo: File): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>`:
     - Reduz com a mesma lógica de canvas de `reduzirFoto(arquivo)`.
     - Se falhar leitura, retorna `{ ok: false, error: "Não foi possível ler a imagem selecionada. Tente tirar a foto novamente." }`.
     - Executa `analisarVariacaoPixels(ctx.getImageData(...).data)`: se `!valida`, retorna `{ ok: false, error: "A imagem capturada está em branco, escura ou sem nitidez (câmera coberta). Posicione seu rosto em um local iluminado e tente novamente." }`.
     - Se `(window as unknown as { FaceDetector?: ... }).FaceDetector` existir, tenta `new FaceDetector({ fastMode: true }).detect(canvas)` dentro de `try/catch`; se detectar explicitamente `0` rostos com sucesso, pode orientar o usuário (`"Nenhum rosto identificado na imagem. Posicione seu rosto centralizado na câmera e tente novamente."`); se `FaceDetector` não existir ou lançar erro no browser/WebView, não bloqueia no cliente (deixa a validação ir para o servidor).
   - Manter `export async function reduzirFoto(arquivo: File): Promise<string | null>` intacta para que `app/ponto` (batida de ponto) não quebre contrato nenhum!
2. Atualizar `app/assinar/[token]/pagina-assinatura.tsx` (`aoCapturarFoto`) e `app/portal/confirmar-contracheques-card.tsx` (`aoEscolherFoto`) para usar `prepararSelfieParaAssinatura(file)`, limpando preview anterior em caso de erro.

- [ ] **Step 3: Implementar validador híbrido servidor (`lib/contracheques/validar-selfie.ts`)**

1. Criar `lib/contracheques/validar-selfie.ts`:
   - Importar `sharp`, `Anthropic`, `CHAVE_ANTHROPIC`, `segredo`, `fotoDeBatidaValida`, `REGEX_FOTO_DATA_URL`.
   - Mensagens claras exportadas (`MSG_SELFIE_INVALIDA`, `MSG_SELFIE_SEM_VARIACAO`, `MSG_SELFIE_SEM_ROSTO`).
   - `const MODELO_VISAO = "claude-sonnet-5";`
   - Função principal `validarSelfieContracheque(fotoDataUrl: string | null | undefined, opcoes?: { detectarRostoFn?: ... })`:
     1. Verifica `fotoDeBatidaValida(fotoDataUrl)` e decodifica `Buffer.from(casado[2], "base64")`.
     2. Executa `const img = sharp(bytes); const [meta, stats] = await Promise.all([img.metadata(), img.stats()]);`.
     3. Verifica `meta.width >= 64 && meta.height >= 64`, `stats.entropy >= 3.0`, `Math.max(...stats.channels.slice(0, 3).map(c => c.stdev)) >= 12`. Se falhar qualquer um, retorna `{ ok: false, error: MSG_SELFIE_SEM_VARIACAO }`.
     4. Se `opcoes?.detectarRostoFn` existir (para testes unitários), usa-o. Senão, se `process.env.TESTE_SELFIE_SEM_IA !== "1"`, chama `segredo(CHAVE_ANTHROPIC)`:
        - Quando houver chave, redimensiona para max 512px (`jpeg({ quality: 80 })`) e chama `anthropic.messages.create` com:
          - `model: "claude-sonnet-5"`, `max_tokens: 120`, `output_config: { effort: "low" }`
          - `tool_choice: { type: "tool", name: "validar_selfie_rosto" }` pedindo `{ rostoDetectado: boolean, motivo: string }`
          - `signal: AbortSignal.timeout(8000)`
        - Se retornar `rostoDetectado: false`, devolve `{ ok: false, error: MSG_SELFIE_SEM_ROSTO }`.
        - Se lançar exceção/timeout/rede ou API indisponível, faz `console.warn("[contracheques] falha na detecção facial via Anthropic, mantendo validação sharp:", err)` e retorna `{ ok: true, validadoComIa: false }`.
     5. Retorna `{ ok: true, bytes, ehPng, validadoComIa }`.

- [ ] **Step 4: Integrar validação em `lib/actions/assinatura-contracheque.ts`, `lib/contracheques/confirmar.ts` e `next.config.ts`**

1. Em `lib/actions/assinatura-contracheque.ts`:
   - Substituir a checagem simples de `fotoDeBatidaValida` em `assinarContrachequeAction` por `const checkFoto = await validarSelfieContracheque(payload.fotoDataUrl); if (!checkFoto.ok) return { ok: false, error: checkFoto.error };` (usando `checkFoto.bytes` e `checkFoto.ehPng`).
2. Em `lib/contracheques/confirmar.ts`:
   - Em `confirmarRecebimento()`, chamar `const checkFoto = await validarSelfieContracheque(params.fotoDataUrl); if (!checkFoto.ok) return { ok: false, error: checkFoto.error };`.
3. Em `next.config.ts`:
   - Adicionar em `outputFileTracingIncludes`:
     ```ts
     "/assinar/**": ["./node_modules/@img/sharp-libvips-linux-x64/lib/**/*"],
     "/portal/**": ["./node_modules/@img/sharp-libvips-linux-x64/lib/**/*"],
     "/api/portal/**": ["./node_modules/@img/sharp-libvips-linux-x64/lib/**/*"],
     ```

- [ ] **Step 5: Atualizar smoke tests e testes de assinatura afetados**

1. Criar helper local em `scripts/smoke-contracheques.ts` e `scripts/smoke-contracheques-assinatura.ts` (`gerarSelfieTexturizadaMock()`: SVG ou buffer raw RGB 160x160 com gradiente diagonal + formas geométricas de alto contraste encodado via `sharp(...).jpeg().toBuffer()`), E adicionar asserção explícita garantindo que imagem sólida azul/cinza é REJEITADA antes do passo aprovado. Rodar smokes com `TESTE_SELFIE_SEM_IA=1` se necessário nos testes sem banco.
2. Em `scripts/test-contracheques-assinatura-action.ts`: adicionar caso testando que `assinarContrachequeAction` rejeita PNG/JPEG sólido azul quando sessão válida (ou no mínimo mantém todos os checks de erro claros).

- [ ] **Step 6: Verificação e commit**

Run:
```bash
npx tsx scripts/test-selfie-validacao.ts && TESTE_SELFIE_SEM_IA=1 npx tsx scripts/smoke-contracheques-assinatura.ts && npx tsx scripts/test-contracheques-assinatura-action.ts && npx tsx scripts/test-ponto-foto.ts
```
Expected: todos os testes passam com exit 0.

```bash
git add app/portal/selfie.ts app/assinar/'[token]'/pagina-assinatura.tsx app/portal/confirmar-contracheques-card.tsx lib/contracheques/validar-selfie.ts lib/actions/assinatura-contracheque.ts lib/contracheques/confirmar.ts next.config.ts scripts/test-selfie-validacao.ts scripts/smoke-contracheques.ts scripts/smoke-contracheques-assinatura.ts scripts/test-contracheques-assinatura-action.ts
git commit -m "feat(contracheques): validacao facial hibrida de selfie (cliente, sharp e Claude Vision)"
```

---

## Task 4: Frente 3 — Unicidade de E-mail no Grupo e Alerta de Duplicados

**Files:**
- Create: `lib/colaborador-email.ts`
- Modify: `lib/actions/rh-colaboradores.ts`
- Modify: `lib/actions/rh-ficha.ts`
- Modify: `lib/actions/rh-admissao.ts`
- Modify: `lib/actions/portal-cadastro.ts`
- Modify: `lib/actions/rh-importacao.ts`
- Modify: `lib/duplicados.ts`
- Modify: `app/(app)/rh/[empresaId]/colaboradores/page.tsx`
- Modify: `app/(app)/rh/[empresaId]/colaboradores/colaboradores-table.tsx`
- Modify: `app/(app)/rh/[empresaId]/colaboradores/alerta-duplicados.tsx`
- Create: `scripts/test-colaborador-email-unico.ts`

- [ ] **Step 1: Escrever teste TDD `scripts/test-colaborador-email-unico.ts`**

Testar antes da implementação:
1. `normalizarEmailColaborador("  Fulano@Empresa.COM ")` === `"fulano@empresa.com"`, `""` -> `null`.
2. Função pura `encontrarConflitoDeEmailEntreCandidatos(...)` e `validarEmailColaboradorLivre(...)` (com mock de `prisma`):
   - Mesmo e-mail em outra empresa de **outra marca do mesmo grupo** com CPF distinto -> **bloqueia** e retorna mensagem contendo nome, marca, empresa e status (`desligado` se inativo).
   - Mesmo e-mail para colaborador sem CPF vs outro com CPF -> **bloqueia**.
   - Mesmo e-mail para **mesmo CPF válido de 11 dígitos** (transferência/recontratação/dois vínculos no grupo) -> **permite** (`null`).
   - Mesmo e-mail ao editar a própria ficha (`colaboradorIdExcluir`) -> **permite** (`null`).
3. `encontrarDuplicados()` em `lib/duplicados.ts`:
   - Preserva comportamento existente quando `email` está ausente/nulo.
   - Gera grupo `"Mesmo e-mail"` (`gravidade: "alta"` se dois ativos ou `"media"` se um ativo e um desligado) quando CPFs são distintos ou vazios.
   - NÃO gera falso positivo `"Mesmo e-mail"` se ambos possuem o mesmo CPF válido (já tratado em `"Mesmo CPF"`).

Run:
```bash
npx tsx scripts/test-colaborador-email-unico.ts
```
Expected: FAIL (`Cannot find module '../lib/colaborador-email'`).

- [ ] **Step 2: Implementar `lib/colaborador-email.ts`**

Exportar:
- `normalizarEmailColaborador(email: string | null | undefined): string | null`
- `ehConflitoDeEmailEntrePessoas(alvo: { cpf: string | null | undefined; id?: string }, outro: { id: string; cpf: string | null | undefined }): boolean`
- `async function empresaIdsDoGrupoDaEmpresa(db, empresaId: string): Promise<string[]>`
- `async function validarEmailColaboradorLivre(db, params: { empresaId: string; email: string | null | undefined; colaboradorIdExcluir?: string; cpfProprio?: string | null }): Promise<string | null>`
- `async function buscarConflitosDeEmailNoGrupo(db, empresaIdsNaTela: string[], candidatos: Array<{ id: string; cpf: string | null; email: string | null }>): Promise<ConflitoEmailExterno[]>` (retorna apenas fichas fora da tela cujo e-mail coincide com algum colaborador exibido e sem CPF idêntico).

Run:
```bash
npx tsx scripts/test-colaborador-email-unico.ts
```
Expected: parte de `colaborador-email.ts` passa (falhando apenas parte de `duplicados.ts` se ainda não atualizada).

- [ ] **Step 3: Aplicar `validarEmailColaboradorLivre` em todos os pontos de escrita**

1. `lib/actions/rh-colaboradores.ts`:
   - `createColaborador`: antes do `prisma.colaborador.create(...)`, chamar `validarEmailColaboradorLivre(prisma, { empresaId, email: data.email, cpfProprio: cpf })`.
   - `updateColaborador`: verificar `target.empresaId` (pode diferir do `empresaId` da rota em visão de grupo!) passando `{ empresaId: target.empresaId, email: data.email, colaboradorIdExcluir: id, cpfProprio: cpf }`.
2. `lib/actions/rh-ficha.ts`:
   - Em `atualizarFicha`: quando `typeof data.email === "string"`, chamar `validarEmailColaboradorLivre(prisma, { empresaId, email: data.email, colaboradorIdExcluir: colaboradorId, cpfProprio: typeof data.cpf === "string" ? data.cpf : atual.cpf })`.
3. `lib/actions/rh-admissao.ts`:
   - Verificar nas linhas 1–120 onde lê e-mail do candidato / cria `Colaborador`; validar antes de gravar `prisma.colaborador.create`.
4. `lib/actions/portal-cadastro.ts`:
   - Ler linhas 1–120 de `lib/actions/portal-cadastro.ts` durante a execução; se o colaborador puder enviar/alterar `email` no portal, aplicar `validarEmailColaboradorLivre(prisma, { empresaId: atual.empresaId, email: emailNovo, colaboradorIdExcluir: atual.id, cpfProprio: atual.cpf })`.
5. `lib/actions/rh-importacao.ts`:
   - Na fase `conferirPlanilha`: além das validações de linha em `validarPlanilhaColaboradores`, checar:
     - E-mails repetidos dentro da própria planilha para CPFs diferentes (ou sem CPF) -> adicionar em `problemas` (bloqueando importação da linha com mensagem clara).
     - E-mails já cadastrados em outra pessoa no grupo -> carregar colaboradores do grupo em UMA consulta `findMany` e reportar linha a linha em `problemas` sem precisar de N queries.
   - Na fase `confirmarImportacao`: dentro de `prisma.$transaction`, antes de `create`/`update` de cada linha com `email`, chamar `validarEmailColaboradorLivre(tx, ...)` (se houver conflito concorrente, abortar transação com erro explícito informando linha e nome).

- [ ] **Step 4: Atualizar `lib/duplicados.ts` e componentes do painel de duplicados**

1. Em `lib/duplicados.ts`:
   - Estender `PessoaParaComparar` com `email?: string | null; empresaMarca?: string;`
   - Estender `MotivoDuplicado` para incluir `"Mesmo e-mail"`.
   - Atualizar `gravidadeDo(grupo, motivo)` para `"Mesmo e-mail"` (dois ativos -> `"alta"`, envolvendo desligado com CPF distinto -> `"media"`).
   - Em `encontrarDuplicados(pessoas)`: após os passos 1 (`Mesmo CPF`) e 2 (`Mesmo telefone`), adicionar passo 3 (`Mesmo e-mail`) agrupando por `normalizarEmailColaborador(p.email)` entre `!jaAgrupado.has(p.id)` apenas quando dentro do grupo existirem pessoas com CPFs diferentes (ou sem CPF).
2. Em `app/(app)/rh/[empresaId]/colaboradores/page.tsx`:
   - Chamar `buscarConflitosDeEmailNoGrupo(prisma, visiveis, colaboradores.map(...))` apenas para `colaboradores` exibidos que tenham `email`, passando `conflitosEmailExternos` para `ColaboradoresTable` -> `AlertaDuplicados`.
3. Em `colaboradores-table.tsx` e `alerta-duplicados.tsx`:
   - Passar `email` em `PessoaParaComparar`.
   - Atualizar `oQueFazer()` com texto orientando corrigir o e-mail duplicado para evitar mistura de links/contracheques.
   - Renderizar eventuais `conflitosEmailExternos` (outra marca/empresa do grupo) na seção do card `AlertaDuplicados`, indicando empresa/marca onde o e-mail já está em uso.

- [ ] **Step 5: Verificação e commit**

Run:
```bash
npx tsx scripts/test-colaborador-email-unico.ts && npx tsx scripts/test-telefone.ts
```
Expected: ambos passam com exit 0.

```bash
git add lib/colaborador-email.ts lib/actions/rh-colaboradores.ts lib/actions/rh-ficha.ts lib/actions/rh-admissao.ts lib/actions/portal-cadastro.ts lib/actions/rh-importacao.ts lib/duplicados.ts app/'(app)'/rh/'[empresaId]'/colaboradores/page.tsx app/'(app)'/rh/'[empresaId]'/colaboradores/colaboradores-table.tsx app/'(app)'/rh/'[empresaId]'/colaboradores/alerta-duplicados.tsx scripts/test-colaborador-email-unico.ts
git commit -m "feat(colaboradores): unicidade de e-mail entre marcas do grupo e alerta de duplicados"
```

---

## Task 5: Frente 4 — Logs SMTP Completos, Query SQL 09–10/11 e Painel `/admin/logs-email`

**Files:**
- Modify: `lib/email.ts`
- Modify: `lib/contracheques/envio.ts`, `lib/actions/assinatura-contracheque.ts`, `lib/convites.ts`, `app/api/cron/lembrete-pesquisa/route.ts`, `lib/convite-portal.ts`, `lib/cobranca-rh-pendencias.ts`, `lib/pesquisa-notificacoes.ts`, `lib/alertas.ts`, `lib/informativos.ts`, `lib/regua-cobranca.ts`, `lib/actions/usuarios.ts`, `lib/actions/recuperacao-senha.ts`, `lib/cobranca-cadastro-colaborador.ts`, `lib/delegacoes/*.ts`
- Create: `scripts/sql/extrair-logs-smtp-2026-11-09-10.sql`
- Create: `app/admin/(painel)/logs-email/page.tsx`
- Create: `app/api/admin/logs-email/csv/route.ts`
- Modify: `app/admin/(painel)/admin-topbar.tsx`
- Create: `scripts/test-email-logs.ts`

- [ ] **Step 1: Escrever teste TDD `scripts/test-email-logs.ts`**

Testar antes da implementação:
1. `intervaloBrasiliaParaDate("2026-11-09", "2026-11-10")` produz `[2026-11-09T03:00:00.000Z, 2026-11-11T03:00:00.000Z)` (meia-noite de Brasília).
2. `montarCsvLogsEmail(linhas)` gera BOM `\uFEFF`, separador `;`, escape de aspas/quebras e colunas exatas: `Data/Hora (Brasília);Destinatário;Origem;Assunto;Marca;Empresa;Status;Erro`.
3. Simulação com mock de `prismaGlobal.emailEnviado`:
   - `sendEmail()` quando e-mail é inválido (`"sem-arroba"`) grava `{ status: "INVALIDO", ok: false, origem: ... }`.
   - `sendEmail()` quando e-mail está na lista de supressão (`emailSuprimido.findUnique` não nulo) grava `{ status: "SUPRIMIDO", ok: false }`.
   - `sendEmail()` quando cota do dia `>= 85` (`emailEnviado.count` retorna `85`) grava `{ status: "BLOQUEADO_TETO", ok: false }` e retorna `{ ok: false, motivo: "COTA" }`.
   - `sendEmail()` quando faltam variáveis SMTP retorna `{ ok: false, motivo: "CONFIG" }` e **não** grava em `emailEnviado`.

Run:
```bash
npx tsx scripts/test-email-logs.ts
```
Expected: FAIL.

- [ ] **Step 2: Estender `lib/email.ts`**

1. Exportar `ORIGENS_EMAIL` e tipos:
   - `export type OrigemEmail = "CONTRACHEQUE" | "CONTRACHEQUE_REENVIO" | "CONTRACHEQUE_COMPROVANTE" | "CONVITE_PESQUISA" | "LEMBRETE_PESQUISA" | "CONVITE_PORTAL" | "COBRANCA_RH" | "NOTIFICACAO_PESQUISA" | "ALERTA_RH" | "AVISO_GESTOR" | "INFORMATIVO" | "REGUA_COBRANCA" | "CONVITE_USUARIO" | "REDEFINIR_SENHA_ADMIN" | "RECUPERACAO_SENHA" | "LEMBRAR_USUARIO" | "COBRANCA_CADASTRO" | "DELEGACOES" | "OUTRO";`
   - `export type StatusLogEmail = "ENVIADO" | "FALHOU" | "BLOQUEADO_TETO" | "SUPRIMIDO" | "INVALIDO";`
   - `ROTULO_ORIGEM_EMAIL: Record<OrigemEmail, string>` e `ROTULO_STATUS_EMAIL: Record<StatusLogEmail, string>`.
2. Estender assinatura de `sendEmail(params)` com campos opcionais `origem?: OrigemEmail`, `empresaId?: string | null`, `marcaNome?: string | null`.
3. Centralizar gravação segura em `registrarLogEmail({ para, chave, assunto, origem, empresaId, marcaNome, ok, status, erro })` com `.catch(() => {})` interno, garantindo gravação em todos os desvios (`INVALIDO`, `SUPRIMIDO`, `BLOQUEADO_TETO`, `ENVIADO`, `FALHOU`), mantendo `CONFIG` sem gravar no banco.
4. Exportar helpers puros `intervaloBrasiliaParaDate(inicioYmd, fimYmd)`, `inicioDoDiaBrasiliaDe(ymd)` e `montarCsvLogsEmail(linhas)` (também usados no `/admin/logs-email` e no endpoint CSV).

- [ ] **Step 3: Propagar `origem`, `empresaId` e `marcaNome` em todos os chamadores de `sendEmail()`**

Inspecionar cada um dos 13 arquivos (19 chamadas) encontrados em `rg -n "sendEmail\(" app lib` e passar os metadados corretos:
- `lib/contracheques/envio.ts`: distinguir `origem: opts?.ehReenvio ? "CONTRACHEQUE_REENVIO" : "CONTRACHEQUE"`, `empresaId`, `marcaNome` (passado/buscado do colaborador). Em `reenviarEmailContrachequeAction` (`lib/actions/rh-contracheques.ts`), marcar `ehReenvio: true` ou passar `origem: "CONTRACHEQUE_REENVIO"`.
- `lib/actions/assinatura-contracheque.ts`: `"CONTRACHEQUE_COMPROVANTE"`, `empresaId: recibo.empresaId`, `marcaNome: recibo.colaborador.empresa.marca.nome`.
- Demais arquivos (`convites.ts`, `cron/lembrete-pesquisa`, `convite-portal.ts`, `cobranca-rh-pendencias.ts`, `pesquisa-notificacoes.ts`, `alertas.ts`, `informativos.ts`, `regua-cobranca.ts`, `usuarios.ts`, `recuperacao-senha.ts`, `cobranca-cadastro-colaborador.ts`, `lib/delegacoes/*.ts`): ler apenas o trecho exato ao redor de cada chamada para passar `origem`, e `empresaId`/`marcaNome` quando já disponíveis em escopo.

- [ ] **Step 4: Criar script SQL pronto `scripts/sql/extrair-logs-smtp-2026-11-09-10.sql`**

Escrever arquivo `.sql` bem documentado com duas consultas prontas para rodar no Neon Console / `psql` contra produção:
1. **Resumo do teto diário (85/dia)** para `09/11/2026` e `10/11/2026` no fuso `America/Sao_Paulo` (`03:00 UTC`), mostrando total de sucessos (`ok = true`), falhas (`ok = false`) e saldo restante vs teto de 85.
2. **Lista detalhada de logs SMTP** entre `'2026-11-09 03:00:00+00'` e `'2026-11-11 03:00:00+00'`, convertendo `"enviadoEm" AT TIME ZONE 'America/Sao_Paulo'`, trazendo destinatário, `status`, `origem` (ou inferência automática por `assunto`/`chave` para registros gravados antes da deploy v1.203.0), `empresa`/`marca` resolvida por `LEFT JOIN` em `Empresa`/`Marca`/`Colaborador`/`User`, e mensagem de erro completa.

- [ ] **Step 5: Criar `/admin/logs-email`, `/api/admin/logs-email/csv` e link no `AdminTopbar`**

1. `app/admin/(painel)/logs-email/page.tsx`:
   - Chama `await requireAreaAdmin()` no topo.
   - Lê `searchParams` (`inicio`, `fim`, `status`, `origem`, `marca`, `q`) — default: últimos 2 dias em Brasília.
   - Exibe cards de KPI no topo: Enviados hoje em Brasília (`enviadosHoje / LIMITE_DIARIO_ENVIOS`), Bloqueados pelo teto hoje, Falhas/Suprimidos no período, Total no filtro e nota explicando que a contagem reinicia à 00:00 de Brasília (`03:00 UTC`) globalmente entre todas as marcas.
   - Formulário GET com filtros (data início, data fim, status, origem, marca/empresa, busca por e-mail/assunto) e botão `<a href={\`/api/admin/logs-email/csv?...\`}>Exportar CSV</a>`.
   - Tabela paginada (take 250 + aviso se houver mais) com data/hora Brasília, destinatário, origem, assunto, marca/empresa, badge de status e erro.
2. `app/api/admin/logs-email/csv/route.ts`:
   - Chama `await requireMaster()` (ou `auth()` retornando 401/403 explícito para API).
   - Aplica os mesmos filtros query string, busca até 5000 linhas e devolve `Response` com `Content-Type: text/csv; charset=utf-8` e `Content-Disposition: attachment; filename="logs-smtp-YYYY-MM-DD.csv"`.
3. `app/admin/(painel)/admin-topbar.tsx`:
   - Adicionar aba `"Logs SMTP"` apontando para `/admin/logs-email` com destaque ativo para `/admin/logs-email`.

- [ ] **Step 6: Verificação e commit**

Run:
```bash
npx tsx scripts/test-email-logs.ts
```
Expected: PASS com exit 0.

```bash
git add lib/email.ts lib/contracheques/envio.ts lib/actions/rh-contracheques.ts lib/actions/assinatura-contracheque.ts lib/convites.ts app/api/cron/lembrete-pesquisa/route.ts lib/convite-portal.ts lib/cobranca-rh-pendencias.ts lib/pesquisa-notificacoes.ts lib/alertas.ts lib/informativos.ts lib/regua-cobranca.ts lib/actions/usuarios.ts lib/actions/recuperacao-senha.ts lib/cobranca-cadastro-colaborador.ts lib/delegacoes/ scripts/sql/extrair-logs-smtp-2026-11-09-10.sql app/admin/'(painel)'/logs-email/page.tsx app/api/admin/logs-email/csv/route.ts app/admin/'(painel)'/admin-topbar.tsx scripts/test-email-logs.ts
git commit -m "feat(email): rastreamento completo de logs SMTP, painel admin CSV e query SQL 09-10/11"
```

---

## Task 6: Complemento OS 11/11 — 2º Contracheque no Dossiê, Selos `"Invalidado"` e Reset de Cobranças

**Contexto (Complemento OS-atualizada-Genilson-contracheque-10-2026.pdf):**
Itens adicionais solicitados em 11/11/2026 pelo RH (Jeanderson):
- **Item 4:** Botão e modal claros `"Invalidar recibo"` / `"Invalidar recibo e reenviar"` na linha do contracheque assinado.
- **Item 5:** Após invalidar, zerar também `enviadoEm`, `enviadoPorNome`, `canal`, `envioErro`, `lembretesEnviados` e `ultimoLembreteEm` em `camposResetAposInvalidacao` para o colaborador sair dos assinados, voltar a pendente real e reiniciar o ciclo completo de cobranças no Telegram (manual e cron automático).
- **Item 6:** Regra explícita para um segundo contracheque da mesma competência lançado manualmente no Dossiê (`documentos-card.tsx` + `lib/actions/rh-documentos.ts`): exigir competência e tipo de folha; se já existir recibo **assinado**, bloquear orientando ir em Contracheques -> `"Invalidar recibo"`; se estiver **pendente** (sem recibo ou `confirmadoEm === null`, inclusive pós-invalidação), substituir o arquivo PDF do envio pendente mantendo histórico/chaveDedupe consistentes e rotacionando o token pendente. Reforçar também a mensagem em `lib/caixa-documentos/gravar.ts` quando o duplicado já estiver assinado.
- **Item 7:** Selo explícito `"Invalidado"` tanto no badge da tabela quanto dentro do histórico forense, além de identificar dono e entidade `ReciboContrachequeInvalidado` na trilha de download em `app/api/rh/[empresaId]/arquivos/[arquivoId]/route.ts`.

**Files:**
- Modify: `lib/contracheques/invalidacao.ts`
- Create: `lib/contracheques/dossie.ts`
- Modify: `lib/actions/rh-documentos.ts`
- Modify: `app/(app)/rh/[empresaId]/colaboradores/[colaboradorId]/documentos-card.tsx`
- Modify: `lib/caixa-documentos/gravar.ts`
- Modify: `app/(app)/rh/[empresaId]/contracheques/contracheques-view.tsx`
- Modify: `app/api/rh/[empresaId]/arquivos/[arquivoId]/route.ts`
- Modify: `scripts/test-contracheques-invalidacao.ts`

- [ ] **Step 1: Escrever testes TDD em `scripts/test-contracheques-invalidacao.ts` (RED)**

Adicionar asserções antes da implementação:
1. `camposResetAposInvalidacao(novoToken)` também zera `enviadoEm: null`, `enviadoPorNome: null`, `canal: null`, `envioErro: null`, `lembretesEnviados: 0`, `ultimoLembreteEm: null` (garantindo reentrada limpa na cobrança do Telegram e contagem de pendentes).
2. Importar de `../lib/contracheques/dossie`:
   - `resolverMetadadosContrachequeManual({ competencia, tipoFolha, descricao })`:
     - `"2026-10"`, `"MENSAL"` -> `{ competencia: 2026-10-01T00:00:00Z, tipoFolha: "MENSAL", chaveDedupe: "CONTRACHEQUE:2026-10:MENSAL", mesAno: "10/2026", rotulo: "10/2026", descricaoPadrao: "Competência 10/2026" }`.
     - `"2026-10"`, `"DECIMO_TERCEIRO"` -> `chaveDedupe: "CONTRACHEQUE:2026-10:DECIMO_TERCEIRO"`, `rotulo: "10/2026 (13º salário)"`, `descricaoPadrao: "Competência 10/2026 (13º salário)"`.
     - `competencia: ""`, `descricao: "Competência 10/2026"` -> infere `"2026-10"` como fallback seguro; `"2026-13"` ou descrição sem mês/ano -> retorna `null`.
   - `decidirSegundoContrachequeDossie(existente, rotulo)`:
     - `null` -> `{ acao: "CRIAR" }`
     - `{ id: "d1", arquivoId: "a1", recibo: null }` -> `{ acao: "SUBSTITUIR_PENDENTE", documentoId: "d1", arquivoAnteriorId: "a1", reciboId: null }`
     - `{ id: "d1", arquivoId: "a1", recibo: { id: "r1", confirmadoEm: null } }` -> `{ acao: "SUBSTITUIR_PENDENTE", documentoId: "d1", arquivoAnteriorId: "a1", reciboId: "r1" }`
     - `{ id: "d1", arquivoId: "a1", recibo: { id: "r1", confirmadoEm: new Date() } }` -> `{ acao: "BLOQUEAR_JA_ASSINADO", error }` contendo `"assinado"` e `"Invalidar recibo"`.

Run:
```bash
npx tsx scripts/test-contracheques-invalidacao.ts
```
Expected: FAIL (`Cannot find module '../lib/contracheques/dossie'` / falha nas novas asserções).

- [ ] **Step 2: Implementar regras puras em `lib/contracheques/invalidacao.ts` e `lib/contracheques/dossie.ts`**

1. `lib/contracheques/invalidacao.ts`: atualizar `camposResetAposInvalidacao` para incluir `enviadoEm: null`, `enviadoPorNome: null`, `canal: null`, `envioErro: null`, `lembretesEnviados: 0`, `ultimoLembreteEm: null`.
2. `lib/contracheques/dossie.ts`: exportar `resolverMetadadosContrachequeManual(...)` e `decidirSegundoContrachequeDossie(...)` reutilizando `competenciaDoTexto`, `rotuloDoContracheque` e `TIPOS_FOLHA_LABEL` de `./situacao`.

- [ ] **Step 3: Atualizar `lib/actions/rh-documentos.ts`, `documentos-card.tsx` e `lib/caixa-documentos/gravar.ts`**

1. `app/(app)/rh/[empresaId]/colaboradores/[colaboradorId]/documentos-card.tsx`:
   - Quando `tipoNovo === "CONTRACHEQUE"`, exibir `<Alert>` informando a regra (aparece automaticamente em Contracheques; substitui envio pendente da mesma competência/folha; bloqueia se já assinado até invalidar em Contracheques), campos `Competência (mês/ano)` (`<Input type="month" name="competencia" required />`), `Tipo de folha` (`MENSAL`, `ADIANTAMENTO`, `DECIMO_TERCEIRO`, `FERIAS`, `COMPLEMENTAR`, `PLR`) e tornar o input `file` `required`.
   - Passar `mensagemSucesso` apropriada ao `FormularioAction`.
2. `lib/actions/rh-documentos.ts` (`criarDocumento`):
   - Quando `tipo === "CONTRACHEQUE"`:
     - Validar `metadados = resolverMetadadosContrachequeManual(...)` e exigir `!anexo` (`"Anexe o arquivo PDF do contracheque."`).
     - Dentro de `prisma.$transaction`:
       - Lock da ficha: `SELECT "id" FROM rh."Colaborador" WHERE "id" = ${colaboradorId} FOR UPDATE`.
       - Buscar candidatos existentes de `DocumentoColaborador` para aquele colaborador e competência (`OR: [{ chaveDedupe: metadados.chaveDedupe }, ...(metadados.tipoFolha === "MENSAL" ? [{ tipo: "CONTRACHEQUE", competencia: metadados.competencia, chaveDedupe: null }, { tipo: "CONTRACHEQUE", competencia: null, descricao: { contains: metadados.mesAno, mode: "insensitive" } }] : [])]`), priorizando recibo confirmado primeiro e, na ausência, match exato de `chaveDedupe`.
       - Aplicar `decidirSegundoContrachequeDossie`: se `BLOQUEAR_JA_ASSINADO`, retornar `{ ok: false, error }`.
       - Se `SUBSTITUIR_PENDENTE`: criar novo `Arquivo`, atualizar o `DocumentoColaborador` existente (`arquivoId: novoArquivo.id`, `competencia`, `chaveDedupe`, `descricao: descricao ?? metadados.descricaoPadrao`, `emitidoEm`, `validoAte`, `observacoes`, `conferidoEm: agora`, `conferidoPorNome: usuario.name ?? null`), se houver `reciboId` pendente atualizar `tx.reciboContracheque.update` com `camposResetAposInvalidacao(gerarTokenAssinatura())` (preservando intacto o histórico em `ReciboContrachequeInvalidado`), e só apagar `arquivoAnteriorId` se ele não for referenciado em nenhum `DocumentoColaborador`, `ReciboContracheque` (`fotoArquivoId`/`comprovanteArquivoId`) ou `ReciboContrachequeInvalidado` (`fotoArquivoId`/`comprovanteArquivoId`).
       - Se `CRIAR`: criar `Arquivo` e `DocumentoColaborador` com `competencia`, `chaveDedupe`, `descricao: descricao ?? metadados.descricaoPadrao`, `conferidoEm: agora`, `conferidoPorNome: usuario.name ?? null`.
     - Registrar auditoria (`ATUALIZAR` na substituição ou `CRIAR` na criação) e revalidar também `/rh/${empresaId}/contracheques` e `/portal`.
3. `lib/caixa-documentos/gravar.ts` (`impedimentosNoBanco`, bloco `DOSSIE`):
   - Selecionar `recibo: { select: { confirmadoEm: true } }` na consulta de duplicata por `chaveDedupe`.
   - Se `tipo === "CONTRACHEQUE"` e `igual?.recibo?.confirmadoEm`, informar explicitamente que já possui recibo assinado e orientar acessar Contracheques -> `"Invalidar recibo"`.

- [ ] **Step 4: Reforçar clareza visual em `contracheques-view.tsx` e auditoria de download de comprovantes invalidados**

1. `app/(app)/rh/[empresaId]/contracheques/contracheques-view.tsx`:
   - Renomear botão da linha confirmada de `"Invalidar"` para `"Invalidar recibo"` (com `title="Invalidar recibo e reenviar ao e-mail atual"`) e título do modal para `"Invalidar Recibo e Reenviar"`.
   - No badge da tabela para histórico existente, exibir `Invalidado (${l.invalidacoes.length})`.
   - Dentro do modal `Histórico Forense de Invalidações`, exibir selo `<Badge variant="destructive" className="text-[10px] uppercase">Invalidado</Badge>` em cada registro preservado ao lado de `Registro #N` e ajustar o texto do link para `Ver comprovante PDF preservado (invalidado)`.
2. `app/api/rh/[empresaId]/arquivos/[arquivoId]/route.ts`:
   - Incluir `contrachequesInvalidadosFoto` e `contrachequesInvalidadosComprovante` (`take: 1, orderBy: { invalidadoEm: "desc" }`) no `select` de `arquivo` para que a auditoria de download registre o colaborador dono e entidade `"ReciboContrachequeInvalidado"` quando o RH baixar evidência preservada.

- [ ] **Step 5: Verificação e commit da Task 6**

Run:
```bash
npx tsx scripts/test-contracheques-invalidacao.ts && \
npx tsx scripts/test-contracheques.ts && \
npm run type-check && \
npm run lint
```
Expected: exit 0 em todos.

```bash
git add lib/contracheques/invalidacao.ts lib/contracheques/dossie.ts lib/actions/rh-documentos.ts app/\(app\)/rh/\[empresaId\]/colaboradores/\[colaboradorId\]/documentos-card.tsx lib/caixa-documentos/gravar.ts app/\(app\)/rh/\[empresaId\]/contracheques/contracheques-view.tsx app/api/rh/\[empresaId\]/arquivos/\[arquivoId\]/route.ts scripts/test-contracheques-invalidacao.ts
git commit -m "feat(contracheques): regra de 2o PDF no dossie, reset de cobrancas Telegram e selo Invalidado"
```

---

## Task 7: Versão v1.203.0, Integração no CI e Verificação Global

**Files:**
- Modify: `.github/workflows/verificacao.yml`
- Modify: `package.json`

- [ ] **Step 1: Registrar os 4 novos testes unitários em `.github/workflows/verificacao.yml`**

Adicionar passos na seção `Testes unitários` de `.github/workflows/verificacao.yml`:
- `npx tsx scripts/test-contracheques-invalidacao.ts`
- `npx tsx scripts/test-selfie-validacao.ts`
- `npx tsx scripts/test-colaborador-email-unico.ts`
- `npx tsx scripts/test-email-logs.ts`
- `npx tsx scripts/test-contracheques-assinatura-action.ts`
- `TESTE_SELFIE_SEM_IA=1 npx tsx scripts/smoke-contracheques-assinatura.ts`

- [ ] **Step 2: Atualizar versão em `package.json` (`1.202.0` -> `1.203.0`)**

Seguir regra de `AGENTS.md`: incremento `minor` por entrega de nova funcionalidade/comportamento.

- [ ] **Step 3: Executar bateria completa de validação local**

Run:
```bash
npm run type-check && \
npm run lint && \
npm run check:migracoes && \
npx tsx scripts/test-contracheques.ts && \
npx tsx scripts/test-contracheques-invalidacao.ts && \
npx tsx scripts/test-selfie-validacao.ts && \
npx tsx scripts/test-colaborador-email-unico.ts && \
npx tsx scripts/test-email-logs.ts && \
npx tsx scripts/test-telefone.ts && \
npx tsx scripts/test-ponto-foto.ts && \
npx tsx scripts/test-contracheques-assinatura-action.ts && \
TESTE_SELFIE_SEM_IA=1 npx tsx scripts/smoke-contracheques-assinatura.ts
```
Expected: 100% exit 0, zero erros de TypeScript ou ESLint.

- [ ] **Step 4: Commit final e preparação da Pull Request**

```bash
git add .github/workflows/verificacao.yml package.json
git commit -m "chore(release): bump v1.203.0 e registro dos testes no CI"
git push -u origin feat/contracheque-auditoria-selfie-email
```

Sem `gh` instalado, fornecer o link de comparação `https://github.com/marcelopaiva007/sistemadoRH/compare/master...feat/contracheque-auditoria-selfie-email?expand=1` (ou abrir PR via ferramenta/API caso disponível e acompanhar o CI conforme fluxo do projeto).
