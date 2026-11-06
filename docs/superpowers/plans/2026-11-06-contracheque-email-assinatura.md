# Contracheque por E-mail com Assinatura Eletrônica e Evidências — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o envio de contracheques por e-mail com link exclusivo de assinatura, autenticação 2FA (Telegram/e-mail), leitor integrado de PDF, assinatura eletrônica com selfie e registro de evidências em PDF acoplado (`pdf-lib`), régua de cobrança automática no Telegram e painel de acompanhamento completo para o RH.

**Architecture:** O sistema estende `ReciboContracheque` para gerenciar tokens seguros e estados de assinatura. Um fluxo público desacoplado em `/assinar/[token]` conduz o colaborador pelas etapas de desafio CPF, validação de código de 6 dígitos, visualização do PDF, captura de selfie com câmera do aparelho e aceite formal. A selagem via `pdf-lib` gera uma folha de evidências A4 acoplada ao documento original e envia cópia em anexo por e-mail. Cobranças automáticas (dias 2, 4 e 5) e manuais ocorrem via bot do Telegram com registro de ciência ("Estou ciente") integrado ao painel do RH.

**Tech Stack:** Next.js 14+ (App Router, Server Actions, Route Handlers), Prisma ORM (PostgreSQL), `pdf-lib` v1.17, Sharp, `@vercel/blob`, Nodemailer (SMTP), Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-11-06-contracheque-email-assinatura-design.md`

## Global Constraints

- Assinatura eletrônica simples nos termos do art. 10, § 2º da MP 2.200-2/2001 e Lei 14.063/2020.
- E-mail inicial **NÃO** deve conter arquivo anexado — apenas o link seguro para a página de assinatura.
- E-mail de confirmação pós-assinatura **DEVE** conter o PDF assinado completo anexado.
- Proteção contra força bruta: limite de 5 tentativas incorretas (CPF ou código 2FA) bloqueia o link.
- Desbloqueio operacional: ação de "Reenviar e-mail" pelo RH invalida o token anterior, gera novo token e zera tentativas.
- Fuso horário padrão em todas as evidências e telas: Brasília (`America/Sao_Paulo`).
- Multi-empresa e multi-marca: respeitar estritamente o escopo de autorização do RH e CNPJs vinculados.
- Todo PR que muda produção incrementa a versão em `package.json` (`1.196.0` -> `1.197.0`).

## Review Focus

1. **Tentativas excessivas de 2FA:** Colaborador erra 5 vezes o CPF ou código -> Link deve ser bloqueado (`bloqueadoEm != null`), impedindo novas requisições até o RH reenviar.
2. **Reenvio de e-mail e concorrência:** RH clica em "Reenviar e-mail" -> Token antigo é invalidado imediatamente e tentativas são zeradas; link antigo acessado deve exibir 404/inválido.
3. **Validação de integridade do arquivo:** Hash SHA-256 do arquivo original gravado na folha de evidências deve ser idêntico ao do arquivo do Dossiê, garantindo que o contracheque não foi modificado.
4. **Resiliência da selfie:** Foto corrompida, vazia ou payload manipulado deve ser barrado no servidor por `fotoDeBatidaValida()`.
5. **Colaborador sem Telegram:** Envio inicial, código 2FA e avisos caem para o e-mail sem travar a régua de cobrança nem gerar exceções no webhook.

---

### Task 1: Modelo de Dados e Migrations Prisma

**Files:**
- Modify: `prisma/schema.prisma:725-765`
- Create: `prisma/migrations/20261106160000_contracheque_assinatura_evidencias/migration.sql`
- Test: `scripts/test-contracheques-schema.ts`

**Interfaces:**
- Consumes: `DocumentoColaborador`, `Colaborador`, `Arquivo`
- Produces: `ReciboContracheque` com campos `tokenAssinatura`, `codigo2faHash`, `codigoExpiraEm`, `canalCodigo`, `codigoValidadoEm`, `tentativasCodigo`, `bloqueadoEm`, `cienciaTelegramEm`, `lembretesEnviados`, `ultimoLembreteEm`, `confirmadoLocalizacao`, `textoAceite`, `comprovanteArquivoId`.

- [ ] **Step 1: Escrever teste de validação do schema do Prisma**

```typescript
// scripts/test-contracheques-schema.ts
import { prisma } from "../lib/prisma";

async function run() {
  console.log("Validando campos de assinatura no Prisma...");
  const fields = (prisma as any)._dmmf?.modelMap?.ReciboContracheque?.fields;
  const fieldNames = fields?.map((f: any) => f.name) ?? [];
  const required = [
    "tokenAssinatura",
    "codigo2faHash",
    "codigoExpiraEm",
    "canalCodigo",
    "codigoValidadoEm",
    "tentativasCodigo",
    "bloqueadoEm",
    "cienciaTelegramEm",
    "lembretesEnviados",
    "ultimoLembreteEm",
    "confirmadoLocalizacao",
    "textoAceite",
    "comprovanteArquivoId",
  ];
  for (const req of required) {
    if (!fieldNames.includes(req)) throw new Error(`Campo ausente no schema: ${req}`);
  }
  console.log("✓ Todos os campos de assinatura presentes no schema.");
}
run().catch((e) => {
  console.error("✗ Falha no teste de schema:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar o teste para certificar que falha**

Run: `npx tsx scripts/test-contracheques-schema.ts`  
Expected: FAIL com "Campo ausente no schema: tokenAssinatura"

- [ ] **Step 3: Adicionar os novos campos ao modelo `ReciboContracheque` e `Arquivo` em `prisma/schema.prisma` e gerar migration**

Atualizar `prisma/schema.prisma` adicionando as colunas especificadas e criar migration SQL:
`ALTER TABLE "rh"."ReciboContracheque" ADD COLUMN "tokenAssinatura" TEXT UNIQUE;` ... etc.
Executar `npx prisma generate`.

- [ ] **Step 4: Executar o teste para verificar aprovação**

Run: `npx tsx scripts/test-contracheques-schema.ts`  
Expected: PASS com "✓ Todos os campos de assinatura presentes no schema."

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations scripts/test-contracheques-schema.ts
git commit -m "feat(contracheques): adicionar campos de assinatura e evidencias ao schema"
```

---

### Task 2: Módulo de Autenticação por Token e Código 2FA (`lib/contracheques/token-auth.ts`)

**Files:**
- Create: `lib/contracheques/token-auth.ts`
- Test: `scripts/test-contracheques-token-auth.ts`

**Interfaces:**
- Consumes: `prisma.reciboContracheque`, `crypto`
- Produces:
  - `gerarTokenAssinatura(): string`
  - `gerarCodigo2fa(): { codigo: string; hash: string; expiraEm: Date }`
  - `validarTentativaCpf(reciboId: string, cpfDigitado: string): Promise<{ ok: boolean; bloqueado: boolean; tentativasRestantes: number }>`
  - `validarCodigo2fa(reciboId: string, codigoDigitado: string): Promise<{ ok: boolean; bloqueado: boolean; motivo?: string }>`
  - `resetarBloqueioRecibo(reciboId: string): Promise<{ token: string }>`

- [ ] **Step 1: Escrever teste unitário para o ciclo de vida do token e 2FA**

```typescript
// scripts/test-contracheques-token-auth.ts
import {
  gerarCodigo2fa,
  gerarTokenAssinatura,
} from "../lib/contracheques/token-auth";

async function test() {
  const token1 = gerarTokenAssinatura();
  const token2 = gerarTokenAssinatura();
  if (!token1 || token1.length < 32 || token1 === token2) throw new Error("Geração de token inválida");

  const { codigo, hash, expiraEm } = gerarCodigo2fa();
  if (!/^\d{6}$/.test(codigo)) throw new Error("Código 2FA deve ter 6 dígitos");
  if (!hash || hash.length !== 64) throw new Error("Hash SHA-256 inválido");
  if (expiraEm.getTime() <= Date.now()) throw new Error("Expiração deve ser no futuro");
  console.log("✓ Token e código 2FA gerados com sucesso.");
}
test().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar teste para verificar que falha**

Run: `npx tsx scripts/test-contracheques-token-auth.ts`  
Expected: FAIL com módulo não encontrado.

- [ ] **Step 3: Implementar `lib/contracheques/token-auth.ts`**

Implementar geração segura de token (`randomBytes(32).toString("base64url")`), geração de código de 6 dígitos numéricos aleatórios com hash SHA-256 e expiração de 10 minutos, validação de CPF e código com bloqueio estrito em 5 tentativas, e reset do bloqueio gerando novo token.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx scripts/test-contracheques-token-auth.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/contracheques/token-auth.ts scripts/test-contracheques-token-auth.ts
git commit -m "feat(contracheques): implementar funcoes de seguranca e 2fa para assinatura"
```

---

### Task 3: Geração da Folha de Evidências com `pdf-lib` (`lib/contracheques/comprovante-pdf.ts`)

**Files:**
- Create: `lib/contracheques/comprovante-pdf.ts`
- Test: `scripts/test-contracheques-comprovante-pdf.ts`

**Interfaces:**
- Consumes: `pdf-lib`, `crypto`
- Produces:
  - `gerarPdfComprovanteAssinado(params: DadosComprovante): Promise<{ bytes: Uint8Array; hashOriginal: string }>`

- [ ] **Step 1: Escrever teste de geração e anexação de folha A4 no PDF**

```typescript
// scripts/test-contracheques-comprovante-pdf.ts
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { gerarPdfComprovanteAssinado } from "../lib/contracheques/comprovante-pdf";

async function test() {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const pdfOriginal = await doc.save();

  const fotoBuffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 120, b: 255 } },
  }).jpeg().toBuffer();
  const fotoDataUrl = `data:image/jpeg;base64,${fotoBuffer.toString("base64")}`;

  const { bytes, hashOriginal } = await gerarPdfComprovanteAssinado({
    pdfOriginalBytes: pdfOriginal,
    reciboId: "recibo-123",
    colaboradorNome: "Maria da Silva",
    colaboradorCpf: "12345678900",
    empresaRazaoSocial: "LM Telecom LTDA",
    empresaCnpj: "12.345.678/0001-90",
    competenciaRotulo: "11/2026",
    tipoFolhaRotulo: "Mensal",
    enviadoEm: new Date(),
    cienciaTelegramEm: new Date(),
    vistoEm: new Date(),
    codigoValidadoEm: new Date(),
    canalCodigo: "TELEGRAM",
    confirmadoEm: new Date(),
    confirmadoIp: "189.10.20.30",
    confirmadoDispositivo: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    confirmadoLocalizacao: null,
    textoAceite: "Declaro que recebi o contracheque de 11/2026 e estou ciente do seu conteúdo.",
    fotoDataUrl,
  });

  const docFinal = await PDFDocument.load(bytes);
  if (docFinal.getPageCount() !== 2) throw new Error("PDF final deve conter 2 páginas (original + folha de evidências)");
  if (!hashOriginal || hashOriginal.length !== 64) throw new Error("Hash original inválido");
  console.log("✓ PDF com folha de evidências e selfie gerado com sucesso.");
}
test().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar teste para verificar que falha**

Run: `npx tsx scripts/test-contracheques-comprovante-pdf.ts`  
Expected: FAIL com módulo não encontrado.

- [ ] **Step 3: Implementar `lib/contracheques/comprovante-pdf.ts`**

Implementar geração da folha A4 com `pdf-lib`: cabeçalho estilizado, grade de dados, datas formatadas no fuso de Brasília (`America/Sao_Paulo`), foto da selfie embutida via `embedJpg`/`embedPng`, texto legal do aceite, hash SHA-256 e fundamento na MP 2.200-2/2001.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx scripts/test-contracheques-comprovante-pdf.ts`  
Expected: PASS com "✓ PDF com folha de evidências e selfie gerado com sucesso."

- [ ] **Step 5: Commit**

```bash
git add lib/contracheques/comprovante-pdf.ts scripts/test-contracheques-comprovante-pdf.ts
git commit -m "feat(contracheques): implementar acoplamento de folha de evidencias em pdf"
```

---

### Task 4: Envio Inicial por E-mail e Notificação com Botão "Estou Ciente" no Telegram

**Files:**
- Modify: `lib/contracheques/envio.ts:1-150`
- Test: `scripts/test-contracheques-envio.ts`

**Interfaces:**
- Consumes: `lib/contracheques/token-auth.ts`, `lib/email.ts`, `lib/telegram.ts`
- Produces: `avisarColaborador`, `enviarContracheques` atualizados com geração de `tokenAssinatura`, e-mail sem anexo com link único, e aviso no Telegram com botão "Estou ciente".

- [ ] **Step 1: Escrever teste do formato dos avisos de e-mail e Telegram**

```typescript
// scripts/test-contracheques-envio.ts
import { montarCorpoEmailContracheque, montarTextoTelegramAviso } from "../lib/contracheques/envio";

async function test() {
  const link = "https://rh.assinelm.com.br/assinar/token-xyz-123";
  const email = montarCorpoEmailContracheque("João", "11/2026", "LM Telecom", link);
  if (!email.html.includes(link) || !email.html.includes("Abrir e assinar")) {
    throw new Error("E-mail deve conter o link e botão 'Abrir e assinar'");
  }

  const tg = montarTextoTelegramAviso("João", "11/2026", "LM Telecom", "j***@gmail.com", "15/11/2026");
  if (!tg.text.includes("Estou ciente") && !tg.replyMarkup) {
    throw new Error("Aviso do Telegram deve conter botão inline 'Estou ciente'");
  }
  console.log("✓ Formatação dos avisos de e-mail e Telegram aprovada.");
}
test().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar teste para verificar que falha**

Run: `npx tsx scripts/test-contracheques-envio.ts`  
Expected: FAIL

- [ ] **Step 3: Implementar e atualizar `lib/contracheques/envio.ts`**

Adicionar as funções de template e atualizar `enviarContracheques` para gerar `tokenAssinatura` único via `gerarTokenAssinatura()`, enviar e-mail com botão para `/assinar/[token]` para todos os colaboradores com e-mail, e enviar aviso no Telegram com botão `Estou ciente` (`contracheque:ciente:<reciboId>`) para quem possui Telegram.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx scripts/test-contracheques-envio.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/contracheques/envio.ts scripts/test-contracheques-envio.ts
git commit -m "feat(contracheques): enviar email com link exclusivo e telegram com botao estou ciente"
```

---

### Task 5: Webhook do Telegram — Callback "Estou Ciente" e Disparo de Código 2FA

**Files:**
- Modify: `app/api/telegram/webhook/route.ts:310-340`
- Modify: `lib/telegram.ts`
- Test: `scripts/test-telegram-contracheques.ts`

**Interfaces:**
- Consumes: `prisma.reciboContracheque`, `answerCallbackQuery`, `sendTelegramMessage`
- Produces: tratamento de `contracheque:ciente:<reciboId>` e função `enviarCodigo2faTelegram`.

- [ ] **Step 1: Escrever teste de processamento do callback "Estou ciente"**

```typescript
// scripts/test-telegram-contracheques.ts
import { tratarCallbackCienciaContracheque } from "../app/api/telegram/webhook/route";

async function test() {
  if (typeof tratarCallbackCienciaContracheque !== "function") {
    throw new Error("tratarCallbackCienciaContracheque deve ser exportada para teste");
  }
  console.log("✓ Função de callback de ciência declarada.");
}
test().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar teste para verificar que falha**

Run: `npx tsx scripts/test-telegram-contracheques.ts`  
Expected: FAIL

- [ ] **Step 3: Implementar tratamento no webhook e envio de 2FA**

Adicionar `tratarCallbackCienciaContracheque`: registra `cienciaTelegramEm = new Date()`, responde callback com aviso e edita a mensagem no chat com carimbo de ciência. Implementar `enviarCodigo2faTelegram` que envia mensagem destacada com o código de 6 dígitos.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx scripts/test-telegram-contracheques.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/telegram/webhook/route.ts lib/telegram.ts scripts/test-telegram-contracheques.ts
git commit -m "feat(telegram): processar ciencia do contracheque e envio de codigo 2fa"
```

---

### Task 6: Server Actions e Rota de Leitura do PDF (`lib/actions/assinatura-contracheque.ts` e `/api/assinar/[token]/pdf`)

**Files:**
- Create: `lib/actions/assinatura-contracheque.ts`
- Create: `app/api/assinar/[token]/pdf/route.ts`
- Test: `scripts/test-contracheques-assinatura-action.ts`

**Interfaces:**
- Consumes: `lib/contracheques/token-auth.ts`, `lib/contracheques/comprovante-pdf.ts`, `lib/blob.ts`, `lib/email.ts`
- Produces:
  - `solicitarCodigo2faAction(token: string, cpf: string)`
  - `validarCodigo2faAction(token: string, codigo: string)`
  - `assinarContrachequeAction(token: string, payload: AssinaturaPayload)`
  - `GET /api/assinar/[token]/pdf`

- [ ] **Step 1: Escrever teste de guarda das Server Actions de assinatura**

```typescript
// scripts/test-contracheques-assinatura-action.ts
import {
  solicitarCodigo2faAction,
  validarCodigo2faAction,
  assinarContrachequeAction,
} from "../lib/actions/assinatura-contracheque";

async function test() {
  const r1 = await solicitarCodigo2faAction("token-inexistente", "12345678900");
  if (r1.ok) throw new Error("Token inexistente não pode solicitar código");

  const r2 = await validarCodigo2faAction("token-inexistente", "123456");
  if (r2.ok) throw new Error("Token inexistente não pode validar código");

  const r3 = await assinarContrachequeAction("token-inexistente", {
    fotoDataUrl: "data:image/jpeg;base64,invalid",
    aceite: false,
    localizacao: null,
  });
  if (r3.ok) throw new Error("Assinatura sem aceite e com token inexistente deve falhar");

  console.log("✓ Validações de segurança das actions verificadas.");
}
test().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar teste para verificar que falha**

Run: `npx tsx scripts/test-contracheques-assinatura-action.ts`  
Expected: FAIL

- [ ] **Step 3: Implementar `lib/actions/assinatura-contracheque.ts` e `/api/assinar/[token]/pdf/route.ts`**

Implementar as três Server Actions e a rota de streaming do PDF. Integrar validação de foto com `fotoDeBatidaValida`, geração da folha com `gerarPdfComprovanteAssinado`, upload no Blob, gravação no Prisma e disparo de e-mail de confirmação com o PDF anexado.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx scripts/test-contracheques-assinatura-action.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/assinatura-contracheque.ts app/api/assinar/[token]/pdf/route.ts scripts/test-contracheques-assinatura-action.ts
git commit -m "feat(contracheques): server actions de autenticacao e selagem da assinatura"
```

---

### Task 7: Interface Pública da Página de Assinatura (`app/(publico)/assinar/[token]/page.tsx`)

**Files:**
- Create: `app/(publico)/assinar/[token]/page.tsx`
- Create: `app/(publico)/assinar/[token]/etapas/desafio-cpf.tsx`
- Create: `app/(publico)/assinar/[token]/etapas/validacao-codigo.tsx`
- Create: `app/(publico)/assinar/[token]/etapas/visualizador-pdf.tsx`
- Create: `app/(publico)/assinar/[token]/etapas/selfie-aceite.tsx`
- Create: `app/(publico)/assinar/[token]/etapas/sucesso-assinatura.tsx`

**Interfaces:**
- Consumes: Server Actions de `lib/actions/assinatura-contracheque.ts`
- Produces: Página responsiva com 4 etapas sequenciais, câmera nativa, bloqueio de 5 tentativas e download imediato.

- [ ] **Step 1: Criar componentes das etapas com suporte a layout mobile-first**

Criar os componentes de cada etapa isoladamente em `app/(publico)/assinar/[token]/etapas/` garantindo formulários acessíveis, máscaras e feedback de carregamento.

- [ ] **Step 2: Montar a página principal em `app/(publico)/assinar/[token]/page.tsx`**

Gerenciar o fluxo sequencial:
1. `DesafioCpf`: digita CPF;
2. `ValidacaoCodigo`: insere 6 dígitos com contagem de 10 min;
3. `VisualizadorPdf`: exibe PDF na tela e marca `vistoEm`;
4. `SelfieAceite`: captura selfie + checkbox legal obrigatório + botão "Assinar";
5. `SucessoAssinatura`: confirmação + download do PDF selado.
Tratar visualmente estados de link bloqueado (5 erros) e link já assinado.

- [ ] **Step 3: Verificar tipagem TypeScript**

Run: `npm run type-check`  
Expected: PASS sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add app/\(publico\)/assinar
git commit -m "feat(contracheques): interface publica e guiada de assinatura de contracheque"
```

---

### Task 8: Régua de Cobrança Automática e Cron Job (`app/api/cron/lembrete-contracheque/route.ts`)

**Files:**
- Create: `app/api/cron/lembrete-contracheque/route.ts`
- Modify: `lib/cron-horario.ts`
- Modify: `vercel.json`
- Test: `scripts/test-contracheques-lembrete-cron.ts`

**Interfaces:**
- Consumes: `lib/cron-horario.ts`, `lib/telegram.ts`, `prisma.reciboContracheque`
- Produces: Cobrança automática nos dias 2, 4 e 5 após `enviadoEm` via cron e configuração no RH.

- [ ] **Step 1: Escrever teste da lógica de dias decorridos para cobrança**

```typescript
// scripts/test-contracheques-lembrete-cron.ts
import { deveCobrarContracheque } from "../lib/contracheques/lembretes";

async function test() {
  const agora = new Date("2026-11-06T12:00:00Z");
  // Dia 2: enviado há 2 dias
  const d2 = new Date("2026-11-04T12:00:00Z");
  if (!deveCobrarContracheque(d2, agora, 0)) throw new Error("Deve cobrar no dia 2");

  // Dia 3: não cobra
  const d3 = new Date("2026-11-03T12:00:00Z");
  if (deveCobrarContracheque(d3, agora, 1)) throw new Error("Não deve cobrar no dia 3");

  // Dia 4: cobra
  const d4 = new Date("2026-11-02T12:00:00Z");
  if (!deveCobrarContracheque(d4, agora, 1)) throw new Error("Deve cobrar no dia 4");

  // Dia 5: cobra
  const d5 = new Date("2026-11-01T12:00:00Z");
  if (!deveCobrarContracheque(d5, agora, 2)) throw new Error("Deve cobrar no dia 5");

  console.log("✓ Lógica de régua de dias 2, 4 e 5 aprovada.");
}
test().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar teste para verificar que falha**

Run: `npx tsx scripts/test-contracheques-lembrete-cron.ts`  
Expected: FAIL

- [ ] **Step 3: Implementar `lib/contracheques/lembretes.ts`, cron route e adicionar ao `vercel.json`**

Implementar cálculo de dias corridos em Brasília, registro de `lembretesEnviados`, rota de cron com checagem de secret e horário configurado em `ConfiguracaoLembrete`.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx scripts/test-contracheques-lembrete-cron.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/lembrete-contracheque lib/contracheques/lembretes.ts lib/cron-horario.ts vercel.json scripts/test-contracheques-lembrete-cron.ts
git commit -m "feat(contracheques): regua de cobranca automatica nos dias 2, 4 e 5 via cron"
```

---

### Task 9: Reformulação do Painel do RH, Filtros, Ações em Lote e Exportação

**Files:**
- Modify: `app/(app)/rh/[empresaId]/contracheques/contracheques-view.tsx`
- Modify: `app/(app)/rh/[empresaId]/contracheques/page.tsx`
- Modify: `lib/actions/rh-contracheques.ts`
- Test: `scripts/test-contracheques-painel-rh.ts`

**Interfaces:**
- Consumes: `prisma.reciboContracheque`, `lib/contracheques/situacao.ts`
- Produces: 6 contadores, % por CNPJ, ações em lote ("Cobrar todos os pendentes", "Exportar CSV/PDF"), e reenvio com reset de bloqueio.

- [ ] **Step 1: Escrever teste das funções de exportação e cobrança em lote**

```typescript
// scripts/test-contracheques-painel-rh.ts
import { montarCsvContracheques } from "../lib/contracheques/exportar";

async function test() {
  const csv = montarCsvContracheques([
    {
      colaboradorNome: "Ana Silva",
      colaboradorCpf: "123.456.789-00",
      empresaNome: "LM Telecom",
      cnpj: "12.345.678/0001-90",
      setor: "Operações",
      email: "ana@exemplo.com",
      status: "CONFIRMADO",
      enviadoEm: "06/11/2026 10:00",
      cienciaEm: "06/11/2026 10:15",
      confirmadoEm: "06/11/2026 10:30",
      ip: "189.10.20.30",
      hash: "a".repeat(64),
    },
  ]);
  if (!csv.includes("Ana Silva") || !csv.includes("LM Telecom") || !csv.includes("CONFIRMADO")) {
    throw new Error("CSV deve conter colunas completas de auditoria");
  }
  console.log("✓ Exportação CSV testada com sucesso.");
}
test().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Executar teste para verificar que falha**

Run: `npx tsx scripts/test-contracheques-painel-rh.ts`  
Expected: FAIL

- [ ] **Step 3: Implementar melhorias no painel do RH e ações em lote**

1. 6 Indicadores no topo com taxa de adesão por CNPJ;
2. Filtros de Competência, Marca, CNPJ, Setor, Status e toggle "Só pendentes";
3. Botão "Cobrar todos os pendentes" (dispara lembrete imediato no Telegram);
4. Botão "Exportar CSV" e "Exportar Relatório";
5. Linha da tabela com status atualizado, botão "Ver comprovante" para assinados, botão "Cobrar no Telegram" e botão "Reenviar e-mail" que zera bloqueio e gera novo token.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx scripts/test-contracheques-painel-rh.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/rh/\[empresaId\]/contracheques lib/actions/rh-contracheques.ts lib/contracheques/exportar.ts scripts/test-contracheques-painel-rh.ts
git commit -m "feat(contracheques): painel do rh com 6 contadores, exportacao e cobranca em lote"
```

---

### Task 10: Smoke Test Completo de Ponta a Ponta e Bump de Versão (`v1.197.0`)

**Files:**
- Create: `scripts/smoke-contracheques-assinatura.ts`
- Modify: `package.json` (sobe versão para `1.197.0` e adiciona script `smoke:contracheques-assinatura`)

**Interfaces:**
- Consumes: Todo o subsistema integrado
- Produces: Validação ponta a ponta sem mocks de banco.

- [ ] **Step 1: Criar o script de smoke test integrado**

Criar `scripts/smoke-contracheques-assinatura.ts`:
1. Cria empresa, colaborador com e-mail e contracheque teste;
2. Dispara envio (`enviarContracheques`) -> confere `tokenAssinatura` gerado;
3. Simula callback de Telegram "Estou ciente" -> confere `cienciaTelegramEm`;
4. Simula solicitação de 2FA com CPF correto -> confere código de 6 dígitos;
5. Simula validação do 2FA -> confere `codigoValidadoEm`;
6. Simula abertura do PDF -> confere `vistoEm`;
7. Simula assinatura com selfie válida -> confere criação de `comprovanteArquivoId` com 2 páginas e hash SHA-256;
8. Limpa os registros de teste criados.

- [ ] **Step 2: Executar o smoke test contra o banco**

Run: `npx tsx scripts/smoke-contracheques-assinatura.ts`  
Expected: PASS com "✓ Smoke test de assinatura de contracheques concluído com sucesso."

- [ ] **Step 3: Incrementar a versão no `package.json` para `1.197.0`**

Atualizar `"version": "1.197.0"` em `package.json` e registrar o script no `package.json`.
Executar `npm run type-check`.

- [ ] **Step 4: Commit final**

```bash
git add package.json scripts/smoke-contracheques-assinatura.ts
git commit -m "feat(contracheques): smoke test integrado e bump para v1.197.0"
```
