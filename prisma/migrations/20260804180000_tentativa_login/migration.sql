-- Limite de tentativas de login: 5 falhas por usuário+IP em 15 minutos.
--
-- Até aqui o formulário de login aceitava tentativa infinita, e cada uma
-- rodava um bcrypt completo — o que é caro de propósito para quem adivinha
-- senha, mas também é o que transforma tentativa em massa em carga no
-- servidor. A checagem nova acontece ANTES do bcrypt, então tentativa barrada
-- custa uma consulta indexada, não um hash.
--
-- Uma linha por falha (e não um contador em "User") porque o usuário digitado
-- pode nem existir — e é justamente o caso de quem está adivinhando.
CREATE TABLE "rh"."TentativaLogin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- "Quantas falhas deste usuário, deste IP, depois de tal horário" — a única
-- pergunta do caminho de login, e ela roda a cada tentativa.
CREATE INDEX "TentativaLogin_username_ip_criadoEm_idx"
  ON "rh"."TentativaLogin"("username", "ip", "criadoEm");

-- A faxina das linhas com mais de 24h pergunta só pela idade.
CREATE INDEX "TentativaLogin_criadoEm_idx"
  ON "rh"."TentativaLogin"("criadoEm");
