# Migração do schema `rh` para banco dedicado

Roteiro para tirar o Sistema do RH do banco Neon compartilhado com o
lm-bonificacao e o vapt, passando-o para o banco dedicado
(`sistemado_rh-db`, já provisionado na Vercel).

Escrito em 01/08/2026. **Ainda não executado.**

## Por que

Hoje os três apps dividem o mesmo banco. Não dividem dados — cada um tem seu
schema (`rh`, `bonificacao`, `vapt`, `shared`) e não há nenhuma foreign key
cruzando entre eles. O que dividem é uma tabela só: `public._prisma_migrations`,
que o Prisma cria em `public` por padrão.

Esse detalhe é a origem de toda a fricção operacional:

- `prisma migrate deploy` fica proibido, porque tentaria aplicar no RH as
  migrations dos outros apps. Daí aplicar migration virou passo manual
  (`scripts/aplicar-migracao.ts`), daí ficou fácil esquecer, e daí o incidente de
  30/07/2026 — código no ar sem a tabela do pivô `UserEmpresa`, telas em 404, um
  dia perdido achando que o banco tinha zerado.
- Qualquer operação que reescreva `_prisma_migrations` destrói o histórico dos
  três sistemas de uma vez.

Separar resolve isso na raiz e ainda dá isolamento de performance, backup
independente e liberdade para versionar cada app no seu ritmo.

> Existe uma correção mais barata: acrescentar `?schema=rh` à connection string
> faz o Prisma criar `rh._prisma_migrations` em vez de usar a de `public`
> (testado e confirmado no banco de dev em 01/08/2026). Isso desacopla as
> migrations sem mover dado nenhum. Se a separação for adiada, **faça pelo menos
> isso** — é uma linha e elimina o risco de um app apagar o histórico do outro.

## Pré-requisitos

1. **Connection string do banco de ORIGEM** (o que produção usa hoje).
   Não está acessível pela Vercel: as variáveis são *Sensitive*, ou seja,
   write-only — nem a CLI nem o painel mostram o valor. Pegue no painel do Neon,
   no projeto correspondente, em *Connection string*.

2. **Connection string do banco de DESTINO** (`sistemado_rh-db`), idem.

3. **Ferramentas cliente do PostgreSQL 17** (o servidor é 17.10; um `pg_dump`
   mais antigo recusa o dump):

   ```bash
   brew install postgresql@17
   ```

   Confirme com `pg_dump --version` — precisa dizer 17.x.

4. **Janela de manutenção.** O sistema fica fora do ar do passo 3 ao 7. Para o
   volume atual (dezenas de milhares de linhas) espere poucos minutos, mas
   reserve mais folga do que isso.

## Passos

### 1. Backup completo, antes de tudo

Já existe backup diário no Backblaze (`app/api/cron/backup-db/route.ts`, 06:00).
Não confie no de ontem — force um agora:

```bash
curl "https://sistemado-rh-two.vercel.app/api/cron/backup-db?secret=$CRON_SECRET"
```

E tire também um local, que é o que você vai usar se precisar voltar atrás:

```bash
pg_dump --no-owner --no-acl -Fc "$ORIGEM" > backup-completo-pre-migracao.dump
```

### 2. Levantar o estado atual (para conferir depois)

Anote a contagem de linhas de cada tabela do schema `rh` — é o que vai provar que
a cópia veio inteira:

```bash
psql "$ORIGEM" -c "select relname, n_live_tup from pg_stat_user_tables where schemaname='rh' order by relname"
```

Confira também se apareceu alguma FK cruzando schemas desde a última checagem
(em 01/08/2026 não havia nenhuma). Se aparecer, **pare** — a separação deixa de
ser trivial e o vínculo precisa ser resolvido antes:

```bash
psql "$ORIGEM" -c "select tn.nspname||'.'||tc.relname as origem, fn.nspname||'.'||fc.relname as destino from pg_constraint con join pg_class tc on tc.oid=con.conrelid join pg_namespace tn on tn.oid=tc.relnamespace join pg_class fc on fc.oid=con.confrelid join pg_namespace fn on fn.oid=fc.relnamespace where con.contype='f' and tn.nspname<>fn.nspname"
```

### 3. Colocar o sistema em manutenção

A partir daqui, escrita nova no banco antigo se perde. Avise quem usa e evite que
alguém esteja no meio de um cadastro.

### 4. Dump apenas do schema `rh`

```bash
pg_dump --no-owner --no-acl -Fc --schema=rh "$ORIGEM" > rh.dump
```

### 5. Restaurar no banco dedicado

```bash
pg_restore --no-owner --no-acl -d "$DESTINO" rh.dump
```

### 6. Levar junto o histórico de migrations — **não pule este passo**

`pg_dump --schema=rh` **não** traz `public._prisma_migrations`, que fica fora do
schema. Sem ela, o banco novo parece não ter migration nenhuma, e o
`prisma/checar-migracoes.mjs` que roda no `npm run build` barra o deploy.

Copie do banco antigo para o novo apenas as linhas cujo `migration_name`
corresponde a uma pasta de `prisma/migrations/` (as demais são dos outros apps e
não devem ir junto):

```bash
psql "$ORIGEM" -c "\copy (select * from public._prisma_migrations where migration_name in (select trim(both from unnest(string_to_array(:'nomes', ','))))) to 'migrations.csv' csv header" -v nomes="$(ls prisma/migrations | grep '^2026' | paste -sd, -)"
psql "$DESTINO" -c "\copy public._prisma_migrations from 'migrations.csv' csv header"
```

Se a tabela ainda não existir no destino, crie-a antes com
`npx prisma migrate resolve --applied <primeira-migration>` apontando para o
banco novo — isso a cria vazia — e então importe.

### 7. Conferir antes de virar a chave

```bash
psql "$DESTINO" -c "select relname, n_live_tup from pg_stat_user_tables where schemaname='rh' order by relname"
```

Compare com o levantamento do passo 2: **tabela a tabela, número a número**.
Confira também que `_prisma_migrations` no destino tem exatamente a mesma
quantidade de pastas que existe em `prisma/migrations/`.

### 8. Apontar produção para o banco novo

Na Vercel, projeto `sistemado-rh` → Settings → Environment Variables →
`DATABASE_URL` (Production) → colar a connection string do destino.

Use a URL **pooled** (com `-pooler` no host). Sem isso, cada invocação serverless
abre conexão direta e o banco satura.

Cuidado ao editar: o campo vem vazio por ser *Sensitive*, e o formulário mostra
só um texto de exemplo em cinza. Salvar sem colar o valor apaga a variável e
derruba o app.

### 9. Redeploy e teste

```bash
npx vercel --prod
```

O build roda o `checar-migracoes.mjs`; se o passo 6 tiver sido feito direito, ele
passa. Depois teste, logado: login, lista de colaboradores, ficha de um
colaborador, e uma escrita real (editar algo e confirmar que persistiu).

### 10. Só depois de dias estáveis: limpar o banco antigo

Não faça no mesmo dia. Mantendo o schema `rh` no banco antigo, o rollback
continua sendo só trocar a variável de volta. Quando houver confiança:

```sql
DROP SCHEMA rh CASCADE;
```

## Rollback

Enquanto o passo 10 não for feito, voltar é trocar a `DATABASE_URL` de volta para
a origem e redeployar. O que tiver sido escrito no banco novo depois da virada
não volta junto — por isso a janela de manutenção importa, e por isso não se
apaga o schema antigo cedo demais.

## Depois da migração

Com banco exclusivo, `prisma migrate deploy` volta a ser seguro e o fluxo manual
deixa de ser necessário. Vale então revisar:

- `scripts/aplicar-migracao.ts` e `prisma/checar-migracoes.mjs` — a justificativa
  de ambos ("os apps dividem a `_prisma_migrations`") deixa de valer. O checador
  ainda é útil como rede de segurança; o aplicador manual pode dar lugar a
  `migrate deploy` no build.
- `README.md`, seção de migrations, e o comentário do `datasource` em
  `prisma/schema.prisma`, que descrevem o banco como compartilhado.
