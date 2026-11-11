-- ============================================================================
-- Extração e Auditoria de Logs SMTP — Dias 09/11/2026 e 10/11/2026
-- ============================================================================
-- Objetivo:
--   Executar no Neon Console (banco SOFTrh / schema rh) ou psql para auditar
--   o consumo da cota diária de SMTP (teto de 85 e-mails/dia em Brasília)
--   durante o período crítico de envio de contracheques de 09 e 10 de novembro.
--
-- Compatibilidade:
--   Este script utiliza APENAS colunas preexistentes na tabela rh."EmailEnviado"
--   (id, para, chave, assunto, ok, erro, enviadoEm) e pode ser executado
--   inclusive ANTES da aplicação da migration da v1.203.0.
--
-- Limites de Fuso Horário (Horário de Brasília = UTC-3):
--   09/11/2026 00:00 BRT = '2026-11-09 03:00:00+00' UTC
--   10/11/2026 00:00 BRT = '2026-11-10 03:00:00+00' UTC
--   11/11/2026 00:00 BRT = '2026-11-11 03:00:00+00' UTC
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CONSULTA 1: Resumo do Teto Diário (Cap de 85/dia) por Dia-Calendário Brasília
-- ----------------------------------------------------------------------------
WITH janelas AS (
  SELECT
    id,
    para,
    ok,
    erro,
    "enviadoEm",
    DATE("enviadoEm" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS dia_brasilia
  FROM rh."EmailEnviado"
  WHERE "enviadoEm" >= TIMESTAMP WITH TIME ZONE '2026-11-09 03:00:00+00'
    AND "enviadoEm" <  TIMESTAMP WITH TIME ZONE '2026-11-11 03:00:00+00'
)
SELECT
  dia_brasilia AS "Data (Brasília)",
  85 AS "Teto Diário",
  COUNT(*) FILTER (WHERE ok = true) AS "Envios Bem-Sucedidos (Consumiu Cota)",
  COUNT(*) FILTER (WHERE ok = false) AS "Envios Falhados / Bloqueados",
  COUNT(*) AS "Total de Tentativas",
  GREATEST(0, 85 - COUNT(*) FILTER (WHERE ok = true)) AS "Saldo Restante do Teto",
  CASE
    WHEN COUNT(*) FILTER (WHERE ok = true) >= 85 THEN 'ESTOURADO / ESGOTADO'
    WHEN COUNT(*) FILTER (WHERE ok = true) >= 70 THEN 'ALERTA (Próximo do Teto)'
    ELSE 'OK'
  END AS "Situação da Cota"
FROM janelas
GROUP BY dia_brasilia
ORDER BY dia_brasilia ASC;


-- ----------------------------------------------------------------------------
-- CONSULTA 2: Lista Detalhada de Todos os Disparos SMTP com Heurística Forense
-- ----------------------------------------------------------------------------
WITH logs_brutos AS (
  SELECT
    e.id,
    e.para,
    e.assunto,
    e.chave,
    e.ok,
    e.erro,
    e."enviadoEm",
    (e."enviadoEm" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS enviado_em_brasilia
  FROM rh."EmailEnviado" e
  WHERE e."enviadoEm" >= TIMESTAMP WITH TIME ZONE '2026-11-09 03:00:00+00'
    AND e."enviadoEm" <  TIMESTAMP WITH TIME ZONE '2026-11-11 03:00:00+00'
),
vinculos_resolvidos AS (
  SELECT
    lb.*,
    -- Heurística de Status
    CASE
      WHEN lb.ok = true THEN 'ENVIADO'
      WHEN lb.erro ILIKE '%inválido%' OR lb.erro ILIKE '%invalido%' THEN 'INVALIDO'
      WHEN lb.erro ILIKE '%supress%' THEN 'SUPRIMIDO'
      WHEN lb.erro ILIKE '%teto%' OR lb.erro ILIKE '%cota%' THEN 'BLOQUEADO_TETO'
      ELSE 'FALHOU'
    END AS status_calculado,

    -- Heurística de Origem a partir da chave e assunto preexistentes
    CASE
      WHEN lb.chave LIKE 'recibo:%' OR lb.assunto ILIKE '%contracheque%' AND lb.assunto NOT ILIKE '%comprovante%' THEN 'CONTRACHEQUE'
      WHEN lb.assunto ILIKE '%comprovante%' THEN 'CONTRACHEQUE_COMPROVANTE'
      WHEN lb.chave LIKE 'convite:%' OR lb.assunto ILIKE 'Pesquisa:%' THEN 'CONVITE_PESQUISA'
      WHEN lb.chave LIKE 'lembrete:%' OR lb.assunto ILIKE 'Lembrete: pesquisa%' THEN 'LEMBRETE_PESQUISA'
      WHEN lb.chave LIKE 'portal:%' OR lb.assunto ILIKE '%acesso ao RH%' THEN 'CONVITE_PORTAL'
      WHEN lb.chave LIKE 'cobranca-rh:%' OR lb.assunto ILIKE '%pendência(s) aguardando você%' THEN 'COBRANCA_RH'
      WHEN lb.chave LIKE 'ciclo:%' OR lb.assunto ILIKE '[RH] Nova pesquisa%' OR lb.assunto ILIKE '[RH] Pesquisa encerrada%' OR lb.assunto ILIKE '[RH] Relatório disponível%' THEN 'NOTIFICACAO_PESQUISA'
      WHEN lb.chave LIKE 'alerta:%' OR lb.assunto ILIKE '[RH] Alerta%' THEN 'ALERTA_RH'
      WHEN lb.chave LIKE 'informativo:%' OR lb.assunto ILIKE '%informativo%' THEN 'INFORMATIVO'
      WHEN lb.chave LIKE 'regua:%' THEN 'REGUA_COBRANCA'
      WHEN lb.chave LIKE 'senha-admin:%' OR lb.assunto ILIKE '%Crie sua nova senha%' THEN 'REDEFINIR_SENHA_ADMIN'
      WHEN lb.chave LIKE 'recuperacao-senha:%' OR lb.assunto ILIKE 'Redefinição de senha%' THEN 'RECUPERACAO_SENHA'
      WHEN lb.assunto ILIKE '%usuário de acesso%' THEN 'LEMBRAR_USUARIO'
      WHEN lb.chave LIKE 'cobranca-cadastro:%' THEN 'COBRANCA_CADASTRO'
      WHEN lb.chave LIKE 'delegacoes%' OR lb.assunto ILIKE '[Delegações]%' THEN 'DELEGACOES'
      ELSE 'OUTRO'
    END AS origem_calculada,

    -- Resolução de Marca e Empresa por Colaborador
    c.id AS colaborador_id,
    c.nome AS colaborador_nome,
    emp_c.nome AS empresa_colaborador,
    m_c.nome AS marca_colaborador,

    -- Resolução de Marca e Empresa por Usuário (se não for colaborador)
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    emp_u.nome AS empresa_usuario,
    m_u.nome AS marca_usuario
  FROM logs_brutos lb
  -- Tenta encontrar o Colaborador pelo e-mail
  LEFT JOIN rh."Colaborador" c ON LOWER(c.email) = LOWER(lb.para)
  LEFT JOIN rh."Empresa" emp_c ON emp_c.id = c."empresaId"
  LEFT JOIN rh."Marca" m_c ON m_c.id = emp_c."marcaId"
  -- Tenta encontrar o Usuário pelo e-mail
  LEFT JOIN rh."User" u ON LOWER(u.email) = LOWER(lb.para)
  LEFT JOIN rh."UserEmpresa" ue ON ue."userId" = u.id AND ue.ativo = true
  LEFT JOIN rh."Empresa" emp_u ON emp_u.id = ue."empresaId"
  LEFT JOIN rh."Marca" m_u ON m_u.id = emp_u."marcaId"
)
SELECT
  id AS "ID do Log",
  TO_CHAR(enviado_em_brasilia, 'YYYY-MM-DD HH24:MI:SS') AS "Data/Hora (Brasília)",
  para AS "Destinatário",
  status_calculado AS "Status",
  origem_calculada AS "Origem",
  assunto AS "Assunto",
  COALESCE(marca_colaborador, marca_usuario, '—') AS "Marca",
  COALESCE(empresa_colaborador, empresa_usuario, '—') AS "Empresa",
  COALESCE(colaborador_nome, usuario_nome, '—') AS "Pessoa Identificada",
  chave AS "Chave Dedupe",
  COALESCE(erro, '') AS "Mensagem de Erro"
FROM vinculos_resolvidos
ORDER BY enviado_em_brasilia ASC;
