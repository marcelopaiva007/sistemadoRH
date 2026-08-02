#!/usr/bin/env node

/**
 * Valida variáveis de ambiente obrigatórias antes do build.
 * Corre durante `npm run build` pra falhar claro se algo tá faltando.
 *
 * NÃO mover para scripts/: o .vercelignore exclui aquela pasta inteira do
 * deploy (comentário lá explica o porquê — foi o que derrubou três deploys
 * em 30/07/2026 com o checador de migrations, pelo mesmo motivo). Qualquer
 * arquivo que `npm run build` execute tem que morar fora de scripts/.
 */

const required = ['DATABASE_URL', 'AUTH_SECRET', 'NEXTAUTH_URL'];
const missing = required.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error('');
  console.error('❌ ERRO: Variáveis de ambiente obrigatórias faltando:');
  missing.forEach(v => console.error(`   - ${v}`));
  console.error('');
  console.error('📝 Solução:');
  console.error('');
  console.error('   Em PRODUÇÃO (Vercel):');
  console.error('   1. Vercel Dashboard → Projeto → Settings → Environment Variables');
  console.error('   2. Adicione:');
  console.error('      - DATABASE_URL (do Neon SOFTrh)');
  console.error('      - AUTH_SECRET (gerado: openssl rand -base64 32)');
  console.error('      - NEXTAUTH_URL (URL da app)');
  console.error('');
  console.error('   Em DESENVOLVIMENTO (local):');
  console.error('   1. Copie .env.example → .env');
  console.error('   2. Escolha UMA opção de DATABASE_URL:');
  console.error('      a) Neon dev: postgresql://...@ep-[ID].us-east-1.aws.neon.tech/...');
  console.error('      b) Docker: postgresql://postgres:password@localhost:5432/sistemadorh?schema=rh');
  console.error('      c) SQLite (testes só): file:./prisma/dev.db');
  console.error('   3. Execute: npm run db:migrate');
  console.error('');
  console.error('📖 Documentação: README.md#banco-de-dados');
  console.error('');
  process.exit(1);
}

// Validação extra: DATABASE_URL deve ser URL válida (ou arquivo SQLite)
const dbUrl = process.env.DATABASE_URL;
const isPostgres = dbUrl.startsWith('postgresql://');
const isSqlite = dbUrl.startsWith('file:');

if (!isPostgres && !isSqlite) {
  console.error('');
  console.error('❌ ERRO: DATABASE_URL deve começar com postgresql:// ou file:');
  console.error(`   Você passou: ${dbUrl.substring(0, 50)}...`);
  console.error('');
  process.exit(1);
}

console.log('✅ Variáveis de ambiente validadas');
