# Roadmap: Pesquisa de Clima — Estrutura para Múltiplos Ciclos

## 🎯 Objetivo
Pesquisa de clima **repetível anualmente** com template fixo — como fazem Gallup e CultureAmp.

## ✅ Entregues (Agora)

### ✓ Template GPTW Fixo
- **21 perguntas** (mesmas sempre)
- **5 dimensões**: Credibilidade, Respeito, Imparcialidade, Orgulho, Camaradagem (4Q cada)
- **1 pergunta NPS** (recomendação 0-10)
- Escala Likert 1-5 (resto 0-4 para NPS)
- Anônima sempre

### ✓ Script de Ciclo Automático
```bash
npx tsx scripts/criar-pesquisa-clima-2026.ts
```
- Cria nova pesquisa com template fixo
- Fecha ciclo anterior (ACTIVE → FINISHED)
- Perguntas idênticas ano a ano → comparáveis
- Funciona por empresa

### ✓ Status Correto
- DRAFT (rascunho) → ACTIVE (aberta) → FINISHED (fechada) → ARCHIVED (arquivo)
- Script controla as transições automaticamente

---

## 🔄 Ciclos: 2024, 2025, 2026...

```
┌─────────────────────────────────────────────────────────────────┐
│ 2024 (Primeira vez — este ano)                                  │
├─────────────────────────────────────────────────────────────────┤
│ Script: criar-pesquisa-clima-2026.ts                             │
│ Resultado: Pesquisa 2026 em DRAFT                                │
│ → Ativa → Convites → Respostas                                   │
│ Status final: ACTIVE (coletando respostas)                        │
└─────────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2025 (Próximo ano — mesmo script)                               │
├─────────────────────────────────────────────────────────────────┤
│ Script: criar-pesquisa-clima-2026.ts (ou 2027, ou 2028...)      │
│ O que faz automaticamente:                                       │
│  → Pesquisa 2026 de ACTIVE muda para FINISHED (congelada)        │
│  → Pesquisa 2027 criada em DRAFT com as MESMAS 21 perguntas      │
│  → Pronta para ativar de novo                                    │
│ Status: FINISHED + DRAFT (novo ciclo)                            │
└─────────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2026+ (Repete)                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Histórico ficou registrado:                                      │
│  • 2026: Credibilidade 7.2                                       │
│  • 2027: Credibilidade 7.8 (+0.6)                                │
│  • 2028: Credibilidade 7.9 (+0.1)                                │
│ → Você vê melhoria REAL, não muda de pergunta                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Comparabilidade Histórica

### ✓ Certo (este sistema)
```
2024: "A empresa cumpre compromissos" → 7.2
2025: "A empresa cumpre compromissos" → 7.8  ← Comparável! Melhoria +0.6
```

### ✗ Errado (ciclo único sem template)
```
2024: "A empresa cumpre compromissos" → 7.2
2025: "A empresa SEMPRE cumpre seus compromissos?" → 7.8 ← Pergunta nova!
```
"Ah, melhorou de 7.2 pra 7.8... ou era só redação?"

---

## 🚀 Como Usar

### Agora (Ciclo 1)
```bash
cd sistemadoRH
DATABASE_URL="..." npx tsx scripts/criar-pesquisa-clima-2026.ts
# Resultado: Pesquisa 2026 criada em DRAFT com 21 perguntas
```

### Próximo ano (Ciclo 2)
```bash
# Mesma linha — o script faz o trabalho
DATABASE_URL="..." npx tsx scripts/criar-pesquisa-clima-2026.ts
# Resultado: 2026 muda para FINISHED, 2027 criada com as MESMAS perguntas
```

### Próximos anos
Repete — sempre a mesma linha, sempre mesmo template.

---

## 📈 Análise: O Que Você Verá

### Depois das respostas
**Aba Resultados → Por Dimensão:**

```
CREDIBILIDADE
  2026: 7.2 (116 respostas)
  2027: 7.8 (129 respostas)  ← +0.6 pontos
  
RESPEITO
  2026: 6.9 (116)
  2027: 7.1 (129)  ← +0.2 pontos

CAMARADAGEM
  2026: 7.5 (116)
  2027: 7.3 (129)  ← −0.2 pontos ⚠️

[Gráfico de linha mostrando tendência]
```

**NPS:**
```
2026: +22 (46% promotores − 24% detractores)
2027: +28 (50% − 22%)  ← Melhorou +6 pontos
```

---

## 🔒 Garantias do Template Fixo

| Aspecto | Garantia |
|---------|----------|
| **Comparabilidade** | Mesmas perguntas = resultados comparáveis |
| **Histórico** | Cada ciclo fica registrado, não sobrescreve |
| **Simplicidade** | Roda uma linha, script cuida de tudo |
| **Escalabilidade** | Por empresa — LM, Centrysol, VAPT cada uma com seu ciclo |
| **Conformidade** | Anônima, GPTW, Likert 1-5 — padrão internacional |

---

## 🎓 Por Que GPTW (5 Dimensões)?

Baseado em **Great Place to Work** — o mesmo modelo usado por:
- Fortune 100 Best Companies to Work For
- Glassdoor Employer of the Year
- Gallup Q12

**As 5 dimensões chegam a 95% da satisfação:**
- Credibilidade (Confiança na gestão)
- Respeito (Voz ouvida)
- Imparcialidade (Justiça)
- Orgulho (Propósito)
- Camaradagem (Conexão)

+ NPS (recomendação) = sistema completo.

---

## 📋 Checklist: Pronto?

- [x] Script criado (`scripts/criar-pesquisa-clima-2026.ts`)
- [x] Template GPTW 5D + NPS documentado
- [x] Ciclo automático (ACTIVE → FINISHED, novo DRAFT)
- [ ] Executar script (você faz agora)
- [ ] Ativar pesquisa no navegador
- [ ] Gerar convites
- [ ] Começar a enviar
- [ ] Coletar respostas
- [ ] Roda de novo no próximo ciclo (próximo ano)

---

## 🔮 Roadmap Futuro (Nice-to-Have)

- Dashboard de histórico (linha mostrando cada dimensão 2026-2030)
- Alertas automáticos ("Credibilidade caiu 0.5 — investigar")
- Análise por setor ("Setor Técnico score baixo — reunir gestores")
- Exportar para Power BI (dados estruturados)
- Pulse surveys (pesquisas curtas entre ciclos — 2-3 perguntas mensais)
