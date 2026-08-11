-- Orçamento de e-mail: registro único de tudo que sai por lib/email.ts.
--
-- Antes, o teto diário era calculado contando SurveyToken com canal='EMAIL'.
-- Só que quatro dos seis caminhos de envio não criam SurveyToken (campanha do
-- portal, lembrete de pesquisa, notificação de ciclo e convite de usuário), e
-- portanto gastavam cota sem aparecer no contador. Em 28/07/2026 saíram 118+
-- e-mails num dia de teto 100.
--
-- Contar aqui, e não em SurveyToken, é o que torna o teto verdadeiro: esta
-- tabela é escrita pelo único ponto por onde todo envio passa.

CREATE TABLE rh."EmailEnviado" (
  "id"        TEXT NOT NULL,
  "para"      TEXT NOT NULL,
  "assunto"   TEXT NOT NULL,
  "chave"     TEXT,
  "ok"        BOOLEAN NOT NULL,
  "erro"      TEXT,
  "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailEnviado_pkey" PRIMARY KEY ("id")
);

-- O índice por enviadoEm serve à pergunta feita a cada envio ("quanto já saiu
-- hoje?"); o composto com chave serve ao dedupe do dia.
CREATE INDEX "EmailEnviado_enviadoEm_idx" ON rh."EmailEnviado"("enviadoEm");
CREATE INDEX "EmailEnviado_chave_enviadoEm_idx" ON rh."EmailEnviado"("chave", "enviadoEm");

-- Lista de supressão. Bounce repetido para o mesmo endereço morto queima cota
-- todo dia e derruba a reputação de envios.assinelm.com.br — domínio que o
-- lm-bonificacao também usa.
CREATE TABLE rh."EmailSuprimido" (
  "email"    TEXT NOT NULL,
  "motivo"   TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSuprimido_pkey" PRIMARY KEY ("email")
);
