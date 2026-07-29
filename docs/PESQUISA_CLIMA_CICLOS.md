# Pesquisa de Clima Organizacional — Ciclos Anuais

## Estratégia

Este sistema foi estruturado **para ser rodado 1-2 vezes por ano** mantendo **comparabilidade histórica**. É o modelo que empresas grandes usam (Gallup, CultureAmp, Mercer, TalentSoft).

### Diferença entre "ciclo único" vs "template repetível"

**Ciclo único** (errado):
- Cria uma pesquisa, deixa ACTIVE, depois encerra manualmente
- Se você mudar as perguntas ano que vem, perde a comparação histórica
- Difícil de padronizar e repetir
- Sem histórico visível de melhoria

**Template repetível** (certo — este sistema):
- Template de perguntas **imutável** (21 perguntas GPTW em 5 dimensões + NPS)
- Cada ano roda o script → **nova pesquisa criada automaticamente**
- A anterior muda de ACTIVE → FINISHED (respostas congeladas, arquivadas)
- Perguntas 100% idênticas — resultados **direcionalmente comparáveis** ano a ano
- Histórico fica visível: "2024: 7.2 → 2025: 7.8 (melhoria de 0.6 pontos em Credibilidade)"

---

## Execução

### Primeiro ciclo (agora)

```bash
cd C:\Users\User\sistemadoRH-temp
DATABASE_URL="postgresql://..." npx tsx scripts/criar-pesquisa-clima-2026.ts
```

Resultado:
- ✓ Pesquisa "Pesquisa de Clima Organizacional 2026" criada em DRAFT
- ✓ 21 perguntas adicionadas (template GPTW + NPS)
- ✓ Pronta para ativar no navegador

### Próximos ciclos (2027, 2028...)

Mesma linha — o script:
1. Fecha a pesquisa 2026 (ACTIVE → FINISHED)
2. Cria "Pesquisa de Clima Organizacional 2027" com as **mesmas 21 perguntas**
3. Novo convite gerado para quem mudou de emprego entre ciclos
4. Histórico intacto

---

## Por que "template imutável"?

### Problema: mudanças de perguntas quebram comparação

| Ano | Pergunta | Média | Comentário |
|-----|----------|-------|-----------|
| 2024 | *"A empresa cumpre compromissos"* | 7.2 | ✓ |
| 2025 | *"A empresa cumpre sempre os compromissos"* | 7.8 | Pergunta diferente! |
| | ❌ Não dá pra comparar — pode ser redação, não melhoria |

### Solução: perguntas idênticas, resultados comparáveis

| Ano | Pergunta | Média | Análise |
|-----|----------|-------|---------|
| 2024 | *"A empresa cumpre os compromissos"* | 7.2 | ✓ |
| 2025 | *"A empresa cumpre os compromissos"* | 7.8 | **+0.6 — melhoria real** |
| 2026 | *"A empresa cumpre os compromissos"* | 7.9 | **+0.1 — evolução contínua** |

---

## Template: 5 Dimensões GPTW + NPS

Aqui está o que o script cria, exatamente igual cada ciclo:

### 1. **Credibilidade** (4Q)
- A empresa cumpre os compromissos que assume com os colaboradores
- A liderança é honesta e transparente na comunicação
- Existe coerência entre o que é dito e o que é feito na empresa
- A empresa oferece benefícios e remuneração justos

### 2. **Respeito** (4Q)
- Sua opinião é ouvida e considerada nas decisões que afetam seu trabalho
- A empresa respeita a vida pessoal e o tempo livre dos colaboradores
- As pessoas são tratadas com equidade, independentemente de cargo ou origem
- A empresa valoriza o desenvolvimento profissional dos colaboradores

### 3. **Imparcialidade** (4Q)
- As decisões sobre promoções e aumentos são justas e imparciais
- A empresa oferece igualdade de oportunidades para todos
- As políticas e regras são aplicadas de forma consistente
- Não há favoritismo nas decisões de gestão

### 4. **Orgulho** (4Q)
- Você se sente orgulhoso em trabalhar para esta empresa
- A empresa oferece produtos/serviços de qualidade que você valoriza
- O propósito e a missão da empresa fazem sentido
- Você recomendaria esta empresa como um bom lugar para trabalhar

### 5. **Camaradagem** (4Q)
- Você tem bom relacionamento com seus colegas de trabalho
- Há espírito de trabalho em equipe e colaboração
- As pessoas se ajudam para resolver problemas
- Existe um ambiente de confiança entre os colaboradores

### 6. **Geral** (1Q — NPS)
- Qual é a probabilidade de você recomendar a empresa como um bom lugar para trabalhar? (0-10)

**Total: 21 perguntas** (20 Likert 1-5 + 1 NPS 0-10)

---

## Fluxo de Status

```
DRAFT (rascunho)
  ↓ [Ativar] (RH clica na interface)
  ↓
ACTIVE (pesquisa aberta, recebendo respostas)
  ↓ [Novo ciclo começa — script roda]
  ↓
FINISHED (encerrada, respostas congeladas, arquivo histórico)
  ↓ [Opcional: limpar da tela]
  ↓
ARCHIVED (fora de circulação, dados ainda no banco)
```

**O script automatiza:**
- ACTIVE → FINISHED quando um novo ciclo é criado
- Nova pesquisa nasce em DRAFT
- Pronta para ativar de novo

---

## Por Empresa

Este script roda **por empresa** — a LM Telecom pode ter ciclos diferentes do Centrysol ou VAPT.

Use:
```bash
EMPRESA_ID="cmruyzwsb00006worlf1dx02k" npx tsx scripts/criar-pesquisa-clima-2026.ts  # LM Telecom
EMPRESA_ID="cmruyzwxdt00026worhr3x5ofe" npx tsx scripts/criar-pesquisa-clima-2026.ts # Centrysol
EMPRESA_ID="cmruyzxfz00036worbqxdg7rqh" npx tsx scripts/criar-pesquisa-clima-2026.ts # VAPT
```

(Padrão: LM Telecom se não passar EMPRESA_ID)

---

## Análise: Como Ler os Resultados

Depois que a pesquisa é respondida, vá para **Resultados** e veja:

### Por Dimensão
- Cada um dos 5 GPTW tem média 1-5
- Agregado por empresa (se anônima) ou por setor (se mostrada para gestor)

### NPS
- Pergunta final: 0-10
- Detractores (0-6), Passivos (7-8), Promotores (9-10)
- Índice = % Promotores − % Detractores (−100 a +100)

### Histórico (próximo ano)
- **"Credibilidade 2024: 7.2 → 2025: 7.8"** — melhoria clara
- **"Camaradagem 2024: 7.5 → 2025: 7.4"** — leve queda, investigar

---

## Checklist: Pronto para Envio?

- [ ] Script rodou sem erro
- [ ] Pesquisa criada em DRAFT com 21 perguntas
- [ ] Verifique no navegador: `sistemado-rh-two.vercel.app/rh/.../pesquisas`
- [ ] Aba "Estrutura" → Clique "Ativar pesquisa" (muda para ACTIVE)
- [ ] Aba "Convites" → Clique "Gerar convites para todos"
- [ ] Aba "Convites" → Clique "Enviar convites" (começa a disparar)

Automático a partir daí — os 176 funcionários recebem links anônimos por Telegram (até 90/dia) ou pelo automático de amanhã.

---

## Referências: Grandes Empresas

| Empresa | Modelo | Ciclo | Template |
|---------|--------|-------|----------|
| **Gallup** | CliftonStrengths + Engagement | Anual | Fixo (mesmas Q há 20+ anos) |
| **CultureAmp** | Values, eNPS, Pulse | 2-3x/ano + mensal | Opção de template + custom |
| **Mercer Moody's** | ESI 76 | Bienal | Fixo (benchmarking) |
| **TalentSoft** | GPTW + OKR | Semestral | Template com ajustes | **LM Telecom** (este sistema) | GPTW 21Q | Anual | Fixo (este template) |

**Padrão ouro:** Template fixo anualmente = você mede *melhoria real*, não muda de pergunta.

---

## Próximas Melhorias (Roadmap)

- [ ] Dashboard de histórico: gráfico de tendência das 5 dimensões ano a ano
- [ ] Alertas: "Dimensão X caiu mais de 0.5 pontos — investigar"
- [ ] Comparação setorial: "Setor Y pior em Credibilidade — gestores reunião"
- [ ] Exportar para Power BI / Tableau (dados estruturados por ciclo)
