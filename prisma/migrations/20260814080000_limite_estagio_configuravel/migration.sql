-- Teto de jornada do estagiário deixa de ser constante no código e passa a ser
-- configuração da empresa.
--
-- O DEFAULT É O TETO LEGAL, não um número escolhido por quem programou: a Lei
-- 11.788/2008, art. 10, II fixa 6h por dia e 30h por semana para estudantes do
-- ensino superior, do médio regular e da educação profissional de nível médio.
-- O RH pode APERTAR (política interna mais restritiva é direito da empresa),
-- nunca afrouxar — quem garante isso é lib/ponto-regras.ts::limitesDeEstagio,
-- que trunca no teto ao LER, além da recusa na hora de salvar.
--
-- Truncar na leitura é proposital e não é redundância inútil: a coluna pode ser
-- alterada por fora da tela (SQL direto, restauração de backup antigo), e a
-- proteção não pode depender de todo caminho de escrita se comportar.
--
-- Até 14/08/2026 o valor era 5h fixo no código. Empresas existentes passam a
-- 6h com esta migração; quem quiser manter 5h configura na tela de Ponto →
-- Configurações.

ALTER TABLE "rh"."ConfiguracaoPontoEmpresa"
  ADD COLUMN IF NOT EXISTS "estagioMinDia" INTEGER NOT NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS "estagioMinSemana" INTEGER NOT NULL DEFAULT 1800;
