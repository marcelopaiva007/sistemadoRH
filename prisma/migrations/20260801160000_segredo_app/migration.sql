-- Credenciais cadastradas pela tela (hoje: a chave da API da Anthropic, que
-- liga o assistente de RH). `valor` é AES-256-GCM cifrado com chave derivada
-- do AUTH_SECRET, que vive só no ambiente — um dump desta tabela não abre.
-- `dica` guarda os últimos caracteres em claro, e só isso: é o que a tela
-- mostra para dizer QUAL chave está gravada sem devolver a chave.
CREATE TABLE "rh"."SegredoApp" (
    "chave"         TEXT NOT NULL,
    "valor"         TEXT NOT NULL,
    "dica"          TEXT NOT NULL,
    "atualizadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "SegredoApp_pkey" PRIMARY KEY ("chave")
);
