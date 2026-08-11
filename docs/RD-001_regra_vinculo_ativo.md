# REGISTRO DE DECISÃO — RD-001
## Regra de Vínculo Ativo nas Pesquisas de RH

**Data:** 02/08/2026 · **Decisor:** Direção · **Status:** Vigente
**Afeta:** `SISTEMA_PESQUISAS_RH.md` · `pesquisas_rh_seed.json` · `escutaContinua.js`

---

## Decisão

**Pesquisa de medição só é enviada a colaboradores com vínculo ativo.** Colaboradores desligados não entram em nenhuma medição recorrente.

Mantidas como **exceção declarada**: P09 (Desligamento) e P10 (Ex-colaborador D+90), por só existirem para quem está saindo ou já saiu. Ambas constituem série separada e **não alimentam** clima, eNPS, IRP ou qualquer indicador de população ativa.

---

## Matriz de elegibilidade

| Status de vínculo | Medição contínua | Clima / NR-1 | Liderança | P09 | P10 |
|---|:--:|:--:|:--:|:--:|:--:|
| Ativo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Contrato de experiência | ✅ | ✅ | ❌ | ❌ | ❌ |
| Férias | ❌ | ✅ | ❌ | ❌ | ❌ |
| Aviso prévio | ❌ | ❌ | ❌ | ✅ | ❌ |
| Afastado INSS | ❌ | ❌ | ❌ | ❌ | ❌ |
| Licença maternidade | ❌ | ❌ | ❌ | ❌ | ❌ |
| Suspenso | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Desligado** | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## Implicações técnicas travadas

| # | Regra | Onde vive |
|---|---|---|
| 1 | Desligado no lote de medição **lança exceção**, não é filtrado silenciosamente | `validarPopulacaoParaMedicao()` |
| 2 | Data de corte é a **data efetiva** de desligamento, não a do aviso | `filtrarElegiveisPorVinculo()` |
| 3 | Convite pendente de quem foi desligado na janela **expira** | `invalidarConvitesDeDesligados()` |
| 4 | Resposta já enviada é **preservada** — anônima e dissociada; apagar exigiria religar resposta a pessoa | mesma função |
| 5 | n mínimo é calculado sobre a **base ativa**, nunca sobre headcount histórico | `planejarRecortes()` |
| 6 | Recortes são recalculados a cada semana; turnover pode colapsar uma área para a unidade | `planejarSemana()` |

**Cobertura de teste:** `testeVinculo.js` — 7 asserções, incluindo simulação de 12 semanas com turnover de 2%/mês e verificação de **zero convites enviados a desligados**.

---

## Limitação metodológica declarada (para o PGR)

A exclusão de colaboradores afastados por INSS e licença está correta do ponto de vista de vínculo e de LGPD, mas produz **viés de sobrevivência** no diagnóstico de risco psicossocial: quem está afastado por adoecimento mental é justamente quem teria mais a reportar, e sua ausência tende a deixar o IRP otimista.

**Compensação adotada:** o laudo do PGR incorpora, ao lado do resultado do P01, o **dado de afastamento por área** já disponível no SESMT — número de afastamentos com CID do grupo F, tempo médio de afastamento e taxa de retorno. Esse indicador não depende de questionário e cobre exatamente a população ausente da amostra.

**Registro no PGR:** esta limitação e sua compensação devem constar explicitamente na seção de metodologia. Declarar a limitação é defensável em fiscalização, uma vez que a análise fiscal recai sobre a consistência técnica do processo; omitir seria falha metodológica.

---

## Revisão

Reavaliar em 12 meses ou quando houver alteração normativa que afete a definição de população exposta a risco ocupacional.
