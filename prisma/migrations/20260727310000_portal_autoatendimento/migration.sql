-- Portal do colaborador: autoatendimento cadastral.
--
-- 1) Colaborador.razaoSocial — aplicado à mão em 27/07/2026 durante a carga da
--    planilha do DP e registrado aqui para o schema.prisma não acusar deriva.
--    A planilha traz 11 Razões Sociais para 3 marcas; guardar no colaborador
--    evita multiplicar Empresa (33 tabelas apontam para empresaId).
--
-- 2) Arquivo.blobUrl — os anexos passam a viver no Vercel Blob em vez da coluna
--    Bytes. Com 253 pessoas enviando documentos, manter no Postgres levaria o
--    banco de 18 MB para poucos GB, com backup e restore proporcionais.
--    `conteudo` vira opcional para os dois modos coexistirem: o que já está no
--    banco continua servindo de lá, o novo vai para o Blob.
--
-- 3) DocumentoColaborador.origem/conferência — o que o colaborador envia pelo
--    portal não entra direto na ficha: fica aguardando o RH conferir contra o
--    documento. Sem isso, um anexo errado ou de outra pessoa viraria verdade
--    cadastral sem ninguém olhar.

ALTER TABLE "rh"."Colaborador" ADD COLUMN IF NOT EXISTS "razaoSocial" TEXT;

ALTER TABLE "rh"."Arquivo" ADD COLUMN IF NOT EXISTS "blobUrl" TEXT;
ALTER TABLE "rh"."Arquivo" ALTER COLUMN "conteudo" DROP NOT NULL;

ALTER TABLE "rh"."DocumentoColaborador"
  ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'RH',
  ADD COLUMN IF NOT EXISTS "conferidoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "conferidoPorNome" TEXT;

-- Fila de conferência do RH: só o que veio do portal e ninguém olhou ainda.
CREATE INDEX IF NOT EXISTS "DocumentoColaborador_empresaId_origem_conferidoEm_idx"
  ON "rh"."DocumentoColaborador" ("empresaId", "origem", "conferidoEm");
