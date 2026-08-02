# Sistema do RH — LM Telecom

Aplicação de RH multi-empresa. Duas frentes hoje:

1. **Departamento Pessoal** — ficha completa do colaborador, dossiê digital,
   dependentes, férias (CLT), ausências/atestados, central de aprovações,
   painel de vencimentos, trilha de auditoria LGPD e o **portal do colaborador**
   (autoatendimento pelo celular, com login pelo bot do Telegram).
2. **Pesquisas** — clima organizacional (dimensões GPTW) e Avaliação de Riscos
   Psicossociais NR-01/PGR, com envio de convites por Telegram/e-mail, respostas
   anônimas por link com token e relatório em PDF.

Cada empresa (LM Telecom, Centrysol, VAPT, ...) tem seus próprios setores,
posições, colaboradores e pesquisas — tudo filtrado por `empresaId` nas queries
e nas server actions.

Stack: Next.js 16 (App Router) · React 19 · Prisma 7 + PostgreSQL · NextAuth v5
· Tailwind 4 + shadcn/ui · Recharts · Playwright (PDF). Deploy na Vercel.

> Histórico: este repositório começou como `lm-bonificacao` (motor de
> bonificação de vendas). Esse módulo foi removido em 23/07/2026 e o app passou
> a ser exclusivamente o Sistema do RH. Em 25/07/2026 o último vínculo com o
> lm-bonificacao — a tabela de login `shared.User`, que as duas aplicações
> dividiam — foi desfeito: o RH passou a ter o seu próprio `rh.User`. Em
> 01/08/2026 o banco também foi separado de vez: o RH migrou para um projeto
> Neon **dedicado** (`SOFTrh`, São Paulo), sem nenhuma tabela, schema ou
> `_prisma_migrations` em comum com `lm-bonificacao`/`vapt`/`shared`. O banco
> antigo (compartilhado) continua intacto, sem uso, como rollback.

## Rodando local

```bash
npm install
npm run db:migrate   # aplica as migrations
npm run db:seed      # cria usuários e empresas iniciais (imprime as senhas geradas)
npm run dev
```

Abra http://localhost:3000 — a raiz redireciona para `/login`.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres (Prisma) |
| `AUTH_SECRET` | assinatura de sessão do NextAuth v5. **Precisa ser diferente do valor usado pelo lm-bonificacao** — dois apps com o mesmo segredo aceitam o token de sessão um do outro (ver "Separação do lm-bonificacao") |
| `NEXT_PUBLIC_APP_URL` | URL pública — monta o link do convite (`/responder/<token>`) |
| `TELEGRAM_BOT_TOKEN` | canal preferido de convite + webhook que vincula o `chat_id` do colaborador |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | fallback de convite por e-mail (Resend) |
| `CRON_SECRET` | protege `/api/cron/enviar-convites` |
| `ANTHROPIC_API_KEY` | **opcional** — liga o Assistente de RH. Também dá para cadastrar a chave pela própria tela do assistente; a variável tem preferência sobre o que estiver gravado |
| `SEED_*` | usuários/senhas fixos no seed (opcional; sem eles o seed gera senha aleatória) |

## Separação do lm-bonificacao

Em 25/07/2026 o Sistema do RH foi desacoplado do lm-bonificacao. O que mudou:

| Antes | Agora |
|---|---|
| Login na tabela `shared.User`, a mesma dos dois apps | `rh.User`, própria deste app (cadastro nasceu de uma cópia) |
| FK `rh.Pesquisa.criadoPorId → shared.User` | FK para `rh.User` — nenhuma referência sai do schema `rh` |
| `datasource schemas = ["shared", "rh"]` | `["rh"]` — este app não enxerga mais schema de outro app |
| Mesmo `AUTH_SECRET` nos dois | segredos distintos |

**O `AUTH_SECRET` importa tanto quanto a tabela.** Com o mesmo segredo, um token
de sessão emitido por um app é aceito pelo outro — e, rodando os dois em
`localhost`, o cookie nem muda de dono, porque cookie ignora porta. O `.env`
local já foi separado; **na Vercel o segredo deste projeto precisa ser trocado
por um valor próprio** (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
Trocar derruba as sessões abertas uma vez — todo mundo faz login de novo.

Consequência do cadastro separado: criar usuário ou trocar senha aqui não muda
nada no lm-bonificacao, e vice-versa. As senhas do momento do corte continuam
valendo nos dois (os hashes foram copiados), mas evoluem em separado.

O que ainda é comum, mesmo após a separação do banco em 01/08/2026: só o bot
do Telegram (mesmo `TELEGRAM_BOT_TOKEN`, usado tanto pro convite de pesquisa
quanto pro portal do colaborador). Banco, schema e `_prisma_migrations` já são
inteiramente próprios deste app.

`npm run test:desacoplamento` confere tudo isso contra o banco.

## Navegação

O sistema abre em `/rh`, onde se escolhe a empresa. Dentro dela, a navegação é
um **menu lateral agrupado pelos 5 blocos do artefato de escopo** (Ciclo de
vida · Departamento pessoal · Desempenho & desenvolvimento · Saúde & segurança
· Gestão), mais um grupo **Configuração** no rodapé com o que se ajusta de vez
em quando (Setores, Cargos, Auditoria).

- **A tela inicial da empresa é a central de pendências** (`/rh/<empresa>`),
  não um dashboard: mostra o que exige ação hoje — CAT sem emitir, aprovações
  paradas, ASO/NR vencendo, EPI vencido, integração atrasada — e cada cartão
  leva para onde a coisa se resolve. Item com prazo legal aparece primeiro e
  em vermelho.
- **A empresa continua na URL** (`/rh/<empresaId>/...`). O seletor no topo da
  lateral troca de empresa mantendo a seção: quem está em Colaboradores da LM
  Telecom cai em Colaboradores da Centrysol. **Sub-rota é descartada de
  propósito** — o id de um colaborador da empresa A não existe na B.
- Para `RH_MANAGER`, preso a uma empresa só, o seletor vira apenas o nome.

## Papéis de acesso

| Papel | Enxerga |
|---|---|
| `ADMIN` | tudo, todas as empresas, cadastro de usuários |
| `DIRETORIA` | painéis e relatórios de RH |
| `RH_MANAGER` | só a própria empresa (`empresaId`) |
| `GESTOR_SETOR` | só `/rh/meu-setor`, escopado a `empresaId` + `setorId` |

## Departamento Pessoal

- **Ficha completa** (`/rh/<empresa>/colaboradores/<id>`): identificação,
  documentos, endereço, contato de emergência, dados bancários e vínculo. Cada
  bloco é um formulário próprio e a action grava **só os campos que vieram** —
  um bloco nunca apaga o outro.
- **Dossiê digital**: RG, CTPS, contrato, ASO, certificados de NR. O arquivo é
  guardado no Postgres (`rh."Arquivo"`, bytea) e não num blob público — sai só
  por `/api/rh/<empresa>/arquivos/<id>` autenticado, e **todo download entra na
  auditoria**. Teto de 4 MB por anexo (`TAMANHO_MAXIMO_ANEXO`); o limite de
  corpo de server action está em 5 MB no `next.config.ts`.
- **Férias**: os períodos aquisitivos **não ficam no banco** — são derivados da
  data de admissão em `lib/ferias.ts`. Sem data de admissão preenchida, o
  colaborador não entra no controle de férias. Regras aplicadas: 30 dias por
  período, abono de até 10 dias, fracionamento em até 3 períodos (mínimo 5 dias,
  um deles com 14+), e alerta ao chegar perto do fim do período concessivo
  (12 meses após o aquisitivo — CLT art. 137). Fora do escopo: redução do
  direito por faltas injustificadas (art. 130).
- **Ausências**: atestados, faltas, licenças e afastamentos, com anexo. Ausência
  *abonada* não conta como falta no absenteísmo.
- **Aprovações** (`/rh/<empresa>/aprovacoes`): férias e ausências pendentes num
  lugar só. Aprovar férias revalida o saldo — entre o pedido e a decisão outro
  período pode ter consumido os dias.
- **Vencimentos** (`/rh/<empresa>/vencimentos`): documentos vencendo em até 60
  dias (`DIAS_ALERTA_VENCIMENTO`) e férias chegando no limite legal.
- **Auditoria** (`/rh/<empresa>/auditoria`): append-only. Valores sensíveis
  (salário, conta, PIX, CPF, RG, PIS) entram no log como "(alterado)" — a trilha
  registra **que** mudou, nunca o conteúdo. CID de atestado nunca é logado.

Datas de calendário (admissão, férias, validade) são gravadas e exibidas em
**UTC** via `lib/datas.ts`. Tratadas no fuso local, apareceriam um dia antes no
Brasil (UTC−3) em produção, onde o servidor roda em UTC.

## EPIs (Fase 3)

`EntregaEPI` — ficha de entrega de equipamento de proteção (NR-06): tipo, CA
(do item, não da pessoa), fabricante, quantidade e validade da troca
periódica.

- **`ca` é o Certificado de Aprovação do EQUIPAMENTO**, não um documento da
  pessoa — não confundir com os certificados de treinamento de NR (Fase 2,
  `CertificadoNR`).
- **`assinado` registra a confirmação do recebimento**, exigida pela NR-06. Uma
  entrega pode existir sem assinatura ainda (RH cadastrou, colaborador não
  assinou o canhoto) — a aba da ficha avisa quantas estão pendentes.
- **Mesma lógica de "a reposição mais recente vence a anterior"** dos módulos
  de conformidade da Fase 2, e a mesma deduplicação no painel de vencimentos
  (por `(colaborador, tipo)`).

## Acidentes de trabalho / CAT (Fase 3)

`AcidenteTrabalho` — registro de acidente/doença ocupacional. `/rh/<empresa>
/acidentes` traz a visão consolidada da empresa (CAT pendente primeiro); a
aba **Acidentes** na ficha traz o histórico da pessoa.

- **Este sistema não emite a CAT** — isso continua no eSocial/INSS. Os campos
  `catEmitida`/`catNumero`/`catEmitidaEm` existem para o RH **provar que
  cumpriu o prazo legal** (1 dia útil, imediato se fatal), não para substituir
  o trâmite oficial.
- **`ausenciaId` liga o acidente ao afastamento correspondente** quando houve
  — reaproveita `Ausencia.tipo = "ACIDENTE_TRABALHO"`, já modelado na Fase 1.
  O vínculo é opcional (nem todo acidente tira alguém do trabalho) e tem
  `@unique`: a mesma ausência não pode ser ligada a dois acidentes.
- **Excluir o registro do acidente nunca apaga a `Ausencia` vinculada** — o
  afastamento é um dado independente que existia antes e continua existindo
  depois.

## Escalas de turno (Fase 3)

`EscalaTurno` — grade semanal de plantão por setor, em `/rh/<empresa>/escalas`.
Deliberadamente **sem cálculo de hora extra ou banco de horas**: é só "quem
está de plantão em cada dia", o que a operação de campo pediu. Ponto/folha
completo fica para uma fase futura, se for necessário.

- **Uma linha por (colaborador, dia)**, com `@@unique([colaboradorId, data])`
  — reatribuir o turno de alguém é `upsert`, nunca empilha registro. A grade
  inteira funciona sobre essa única constraint.
- **"Copiar semana anterior" nunca sobrescreve um dia já preenchido** no
  destino — só completa o que está vazio. Evita que copiar o padrão apague um
  ajuste manual que já tinha sido feito.
- Semana calculada em `lib/escala.ts` (`inicioDaSemanaUTC`): sempre começa na
  segunda-feira, mesmo se a data de referência cair num domingo (o domingo
  pertence à semana que já passou, não à seguinte).

## Assistente de RH — IA (Fase 5, em andamento)

`/rh/<empresa>/assistente` — pergunta em português sobre os dados da empresa.

- **Ligar: o ADMIN cola a chave da Anthropic na própria tela.** Não precisa de
  acesso à Vercel nem de deploy novo — o campo aparece em
  `/rh/<empresa>/assistente` só para quem é ADMIN, porque quem grava a chave
  passa a poder gastar na conta da Anthropic do grupo. A chave é testada
  contra a API antes de gravar (chave errada ou revogada falha ali, não na
  primeira pergunta) e vai para `rh.SegredoApp` cifrada em AES-256-GCM
  (`lib/cripto.ts`), com a chave de cifra derivada do `AUTH_SECRET` — que vive
  só no ambiente. Consequências que valem saber:
  - Um dump do banco (o backup diário incluído) leva texto cifrado e nada mais.
  - **Trocar o `AUTH_SECRET` torna a chave gravada ilegível** e ela precisa ser
    cadastrada de novo. Não se perde nada de verdade: a credencial existe do
    lado da Anthropic.
  - A chave entra e não sai: nenhuma rota deste app devolve o valor. A tela
    mostra só os quatro últimos dígitos, para dizer QUAL chave está valendo.
  - A variável de ambiente `ANTHROPIC_API_KEY`, se existir, **tem preferência**
    sobre o que estiver gravado — a tela avisa quando é o caso, para ninguém
    cadastrar uma chave nova e ficar sem entender por que a antiga continua
    valendo.
- **O modelo não recebe acesso ao banco.** Ele escolhe entre as ferramentas de
  leitura em `lib/assistente/ferramentas.ts` e passa parâmetros simples. Três
  consequências que valem entender antes de mexer:
  1. **`empresaId` é fixado no servidor**, nunca vem do modelo — não existe
     pergunta capaz de fazer o assistente ler outra empresa.
  2. Toda consulta tem teto de resultados.
  3. O que não está no arquivo de ferramentas, ele não alcança. Ampliar
     acesso é decisão de código, não de prompt.
- **Teto de 6 idas e voltas por pergunta** — sem isso uma pergunta ambígua
  vira laço de chamadas e queima crédito à toa.
- **A pergunta entra na trilha de auditoria; a resposta não.** A resposta pode
  juntar dado de várias pessoas de uma vez; o que importa para auditar acesso
  é quem perguntou o quê.
- `npm run verificar:assistente` confere as ferramentas contra o banco real —
  inclusive o isolamento entre empresas. **Não cobre a conversa com o modelo**,
  que só dá para testar depois que a chave existir.

## Folha — eventos variáveis (Fase 5, em andamento)

`CompetenciaFolha` + `EventoFolha`, em `/rh/<empresa>/folha`. O que muda todo
mês e a contabilidade precisa receber: hora extra, falta, adicional, bônus,
desconto.

- **Este sistema NÃO calcula folha.** Não sabe salário-hora, INSS, IRRF nem
  FGTS. Ele informa quantidade e valor; quem transforma em dinheiro é o
  Domínio, no escritório contábil. Por isso a rubrica carrega `unidade` — o
  contador precisa saber se "8" são horas ou dias.
- **Horas extras são lançadas à mão.** Quando a operação escolheu escala de
  plantão em vez de ponto eletrônico (Fase 3), o sistema ficou sem fonte de
  horas. Melhor o RH digitar o total do mês do que forjar um cálculo sem dado.
- **`origem` separa DERIVADO de MANUAL, e isso é a regra mais importante do
  módulo**: "Buscar faltas e benefícios" apaga **só** os derivados antes de
  recriar. Lançamento digitado pelo RH nunca é tocado — senão recalcular
  perderia trabalho de conferência.
- **Falta que desconta é a não abonada** (`Ausencia.abonada = false`), mesma
  regra do absenteísmo na Fase 2.
- **Competência fechada trava lançamento** — é o que o escritório recebeu.
  Reabrir é permitido e fica registrado na auditoria.
- ⚠️ **O CSV exportado não é o layout oficial de importação do Domínio.** É um
  arquivo legível com os campos que a folha precisa, para conferência e
  digitação. Para casar 1:1 com a importação do Domínio é preciso um arquivo
  de exemplo vindo do escritório contábil — o cadastro de rubricas é de lá.

## Recrutamento & seleção — ATS (Fase 4, em andamento)

`Vaga` + `Candidato` + `Candidatura` + `EventoCandidatura`, em
`/rh/<empresa>/vagas`. A vaga publicada ganha uma **página pública de
inscrição** em `/vagas/<slug>`.

- **`Candidato` existe independente de vaga** — é o banco de talentos, em
  `/rh/<empresa>/candidatos`. Reprovado numa vaga continua cadastrado e
  concorre a outra sem recadastrar; excluir a candidatura não apaga o
  candidato. **"Disponível" é calculado, não gravado**: é quem não está em
  etapa ativa em nenhuma vaga e ainda não foi contratado.
- **Etapa é foto, evento é filme** — `Candidatura.etapa` guarda onde a pessoa
  está agora e `EventoCandidatura` o histórico de como chegou lá (mesmo par de
  `Movimentacao` na Fase 2).
- **O slug tem sufixo aleatório de propósito** — o endereço da vaga não pode
  ser adivinhado a partir do nome do cargo, senão uma vaga ainda não publicada
  vazaria por tentativa. A página só responde se `publicada` e
  `status = ABERTA`; fora disso é 404, sem confirmar que o slug existiu.
- **CPF é obrigatório só na inscrição pública** (com validação de dígito
  verificador), porque é ele que impede a mesma pessoa de se inscrever duas
  vezes. No cadastro pelo RH é opcional — Postgres trata NULL como distinto,
  então vários candidatos sem CPF convivem.
- **O formulário público usa campos controlados**, diferente do resto do
  sistema: com `<form action={...}>` o React limpa inputs não controlados
  quando a action retorna, e o candidato perderia tudo por causa de um dígito
  errado no CPF.

### Onboarding — trilha de integração

`ChecklistIntegracao`, na aba **Integração** da ficha e consolidado em
`/rh/<empresa>/integracoes`. Espelho do checklist de desligamento: mesma
forma, do outro lado do ciclo de vida.

- **Ganhou `responsavel` e `prazo`, que o offboarding não tem** — a integração
  é distribuída (TI cria acesso, almoxarifado entrega EPI, o gestor apresenta
  o time), enquanto a saída é quase toda do RH. A trilha padrão já nasce com o
  responsável sugerido de cada item.
- `responsavel` é texto livre e **não é FK**: costuma ser uma área ("TI",
  "Almoxarifado"), não uma pessoa do cadastro.
- A tela consolidada agrupa por pessoa e ordena por quem tem item atrasado —
  o RH pensa em "a integração do Fulano", não em itens soltos.

### Admissão digital

"Admitir" no funil cria a ficha do colaborador a partir do que o candidato já
informou e liga as duas pontas (`Candidatura.colaboradorId`). Não precisou de
tabela nova.

- **A conferência de admissão avisa, não bloqueia** — decisão de escopo: em
  campo a pessoa às vezes começa antes de todo papel chegar, e travar a
  criação da ficha só faria o RH cadastrar por fora do sistema.
- **A lista de pendências é calculada** (`lib/admissao.ts`) sobre o dossiê e
  os exames que já existem, nunca gravada. Um campo "status da admissão"
  ficaria desatualizado assim que alguém anexasse o documento que faltava.
- **Só aparece para quem entrou por processo seletivo** — os 208 importados do
  elleven não têm candidatura, e cobrar documento admissional deles seria
  ruído permanente na tela.
- Recontratação distraída esbarra no `@@unique([empresaId, cpf])` do
  `Colaborador`: a action avisa que a ficha já existe em vez de criar a
  segunda.

## Treinamentos & trilhas — não-NR (Fase 3)

`Treinamento` (catálogo) + `ParticipacaoTreinamento`, em `/rh/<empresa>/treinamentos`
e na aba **Treinamentos** da ficha. "Não-NR" porque a capacitação obrigatória de
segurança já mora em `RequisitoNR`/`CertificadoNR` desde a Fase 2 — isto aqui é
desenvolvimento profissional geral.

- **A matriz de competências não ganhou modelo próprio** — é uma leitura sobre
  `Treinamento.competencias` (array `String[]`, chaves do mesmo catálogo fixo
  da avaliação de desempenho) cruzada com quem tem participação com
  `presente = true`. Ausência não conta para a matriz.
- **Catálogo não tem exclusão, só ativar/desativar** — igual a Setor/Posição.
  Apagar um treinamento apagaria em cascata o histórico de quem participou
  (`onDelete: Cascade` existe só como rede de segurança contra escrita fora
  do app, nunca é o caminho oferecido na UI).
- **Certificado é um anexo opcional** (`Arquivo`, mesmo padrão de EPI/CAT) —
  excluir uma participação apaga o arquivo junto, numa transação.

## Metas & PDI (Fase 3)

`Meta` (individual ou de setor) + `PlanoDesenvolvimento` (PDI, uma linha por
ação), em `/rh/<empresa>/metas` e na aba **Metas & PDI** da ficha.

- **Meta é individual OU de setor, nunca as duas nem nenhuma** — garantido
  por uma `CHECK` no banco (`Meta_colaborador_xor_setor_check`), não só na
  action: mesmo uma escrita direta via SQL/Prisma Studio não passa por cima
  dessa regra.
- **Progresso e status são digitados, não calculados** — diferente do padrão
  "situação calculada" usado em conformidade/benefícios. Meta é uma
  combinação de fatores que só quem acompanha sabe avaliar; forçar um cálculo
  automático a partir de datas daria uma falsa precisão.
- **PDI é uma lista de ações, não um documento único** — mesmo formato do
  `ChecklistDesligamento` (item + concluído + quem concluiu). Cada ação de
  desenvolvimento é uma linha própria, com prazo opcional.

## Avaliação de desempenho (Fase 3)

`CicloAvaliacao` + `AvaliacaoDesempenho` + `NotaCompetencia`, em
`/rh/<empresa>/avaliacoes`. Uma linha por avaliador de cada colaborador; a aba
**Desempenho** na ficha mostra o histórico da pessoa em todos os ciclos.

- **Ciclos 90/180/360°** — 90° só o gestor avalia; 180° soma a autoavaliação;
  360° soma avaliadores extras (par/subordinado), adicionados à mão pelo RH
  (não há nomeação automática de pares). "Gerar avaliações" cria a
  autoavaliação e/ou a do gestor conforme o tipo, pulando quem já tem a linha
  e quem não tem `supervisorId` definido (sem gestor, não tem quem preencher).
- **Competências vêm de um catálogo fixo** (`lib/constants-avaliacao.ts`),
  mesmo padrão dos catálogos de EPI/offboarding — sem CRUD de competência por
  empresa. A nota final é a **média das seis notas** (1 a 5), calculada ao
  salvar, nunca digitada direto.
- **Nine-box** cruza desempenho (nota final da avaliação **do gestor**) com
  potencial (também só o gestor informa) — por isso só a avaliação
  `tipoAvaliador = GESTOR` alimenta a grade; autoavaliação e pares não têm
  campo de potencial.
- **`@@unique([colaboradorId, cicloId, avaliadorId])`** é a única trava contra
  duplicidade — mesmo avaliador não avalia a mesma pessoa duas vezes no mesmo
  ciclo, mas o mesmo colaborador pode ter várias linhas (uma por avaliador).

## Offboarding formal (Fase 3)

`ChecklistDesligamento` + `EntrevistaDesligamento` — o que falta depois que a
`dataDesligamento` é preenchida na ficha (Fase 1 já cobre motivo e data). A
aba **Desligamento** só aparece na ficha quando há data de desligamento;
`/rh/<empresa>/desligamentos` traz a visão consolidada de quem saiu.

- **Devolução de ativo é só mais um item do checklist** — sem modelo próprio.
  "Gerar checklist padrão" cria uma linha por item do catálogo
  (`lib/constants-offboarding.ts`) que ainda não existe para a pessoa; itens
  fora do catálogo entram como `item: "OUTRO"` com descrição livre.
- **`EntrevistaDesligamento` é `@unique` por colaborador** — sempre `upsert`,
  nunca duas entrevistas para a mesma pessoa. O motivo real relatado aqui
  pode diferir do `motivoDesligamento` formal na ficha; a auditoria registra
  que a entrevista foi feita, não o conteúdo (dado sensível de opinião).

## Indicadores — BI inicial (Fase 2)

`/rh/<empresa>/indicadores` — headcount, turnover, absenteísmo e custo de
pessoal, por setor. Fecha o último item do roadmap da Fase 2.

- **Tudo calculado na hora** em `lib/bi.ts`, funções puras sem Prisma — nada é
  um número mantido à parte, e por isso dá pra testar sem banco
  (`npm run test:bi`).
- **Turnover reconstrói o headcount do início do período** a partir do de
  agora: `headcountInicio = headcountFim − admissões do período + desligamentos
  do período`. É uma aproximação (assume que ninguém foi reativado no meio do
  caminho) — não exige guardar uma foto de headcount por mês.
- **Absenteísmo só conta falta NÃO abonada**, mesma regra da Fase 1, numa
  janela de 30 dias; a taxa é dias de falta ÷ (headcount do setor × ~22 dias
  úteis).
- **Custo de pessoal soma `Colaborador.salarioBase` + `BeneficioColaborador`
  vigentes**, por setor. A tela avisa quando a base de salários está incompleta
  em vez de mostrar um total artificialmente baixo como se fosse exato.
- Gráficos com Recharts (já usado no dashboard de NR-01) — barra de headcount
  por setor, linha de admissões × desligamentos dos últimos 12 meses.

## Movimentações e organograma (Fase 2)

- **Foto e filme.** `Colaborador.supervisorId` é a foto (a quem a pessoa reporta
  hoje); `Movimentacao` é o filme (cada promoção, transferência ou troca de
  líder, com o antes e o depois). Aplicar uma movimentação atualiza os dois **na
  mesma transação** — o histórico nunca diverge do estado atual.
- **Excluir uma movimentação apaga só o registro histórico**, nunca desfaz a
  mudança aplicada. Reverter é uma movimentação nova.
- **Ciclo de liderança é bloqueado** na action (A lidera B que lidera A), com
  teto de 50 níveis como rede contra loop.
- **O organograma** (`/rh/<empresa>/organograma`) é montado na hora a partir do
  `supervisorId` — não existe desenho mantido à parte. Quem reporta a um líder
  inativo aparece "solto" no topo até ser realocado, em vez de sumir da árvore.
- Telas: aba **Carreira** na ficha do colaborador + `/organograma` na navegação.

## Benefícios (Fase 2)

- **Vigente não é coluna.** Um `BeneficioColaborador` está em vigor quando
  `dataFim` é `null` ou está no futuro — encerrar é preencher `dataFim`,
  **nunca apagar a linha**: o custo histórico (quanto a empresa pagou em cada
  mês) precisa continuar reconstituível depois que o benefício acabou. Excluir
  de verdade só serve para corrigir lançamento errado.
- **Um tipo vigente por vez, por pessoa** — conceder um segundo Plano de Saúde
  ativo para quem já tem um é recusado (senão dobra o custo no total da
  empresa); a correção é encerrar o atual antes de conceder outro.
- **Valor não entra na auditoria.** Mesma regra do salário na ficha: a trilha
  registra que o benefício foi concedido/encerrado, nunca o valor.
- Cobertura de dependente já existe como flag em `Dependente.planoSaude` (Fase
  1) — o card de Benefícios só aponta a contagem, não duplica o dado.
- Telas: aba **Benefícios** na ficha do colaborador; `/beneficios` — panorama
  por tipo (quantas pessoas, custo mensal para a empresa e desconto em folha).

## Reconhecimento (Fase 2)

`/rh/<empresa>/reconhecimento` — aniversariantes e marcos de tempo de casa do
mês corrente, com botão de enviar parabéns pelo mesmo bot do Telegram já usado
nas pesquisas.

- **A unique de `(colaboradorId, tipo, ano)` é o que impede mandar duas vezes**
  no mesmo ano — inclusive protege contra duplo clique, sem precisar de trava
  em memória: a segunda tentativa esbarra na constraint e é silenciosamente
  ignorada (a mensagem já foi entregue, não tem como "desenviar").
- Aniversário usa `dataNascimento`; tempo de casa usa `dataAdmissao`. Sem
  Telegram vinculado, a pessoa aparece na lista mas sem botão de envio.
- Marcos "redondos" (1, 3, 5, 10, 15, 20, 25, 30 anos) ganham destaque visual —
  os demais anos aparecem normalmente, sem realce.

## Conformidade — Saúde e Segurança (Fase 2)

`/rh/<empresa>/conformidade` — matriz de NRs por função e situação de cada
colaborador; os alertas entram junto no painel de `/vencimentos` existente.

**Requisito x evidência, nada persistido como "situação".** `RequisitoNR`
declara o que a FUNÇÃO exige (ex.: NR-35 para quem sobe em poste, reciclagem a
cada 24 meses); `CertificadoNR` é a evidência de que UMA PESSOA cumpriu. Quem
está em dia, vencendo, vencido ou nunca fez é sempre calculado na hora por
`lib/conformidade.ts`, cruzando os dois — não existe coluna para o RH lembrar de
atualizar, que é onde esse tipo de controle costuma apodrecer. Mesma lógica
para `ExameOcupacional` (ASO/PCMSO), sem depender de requisito por função.

Pontos que valem lembrar antes de mexer:
- **A reciclagem mais recente vale, mesmo vencida uma anterior** — o motor pega
  sempre o certificado/exame de data mais recente por (colaborador, norma).
- **Certificado de norma que a função não exige não conta para nada** — só os
  `RequisitoNR` da posição atual entram no cálculo.
- **Exame demissional nunca aparece como "vigente"** — ele encerra o vínculo,
  não mantém ninguém apto para trabalhar.
- **Resultado "apto com restrição" exige a restrição preenchida** — é o dado
  que o gestor precisa respeitar montando a escala.
- Anexos (certificado, ASO) seguem o mesmo modelo do dossiê digital: blob em
  `Arquivo`, download por `/api/rh/.../arquivos/[id]`, auditado.

## Portal do colaborador

`/portal` — autoatendimento pelo celular: saldo e programação de férias,
ausências, documentos para baixar e os próprios dados cadastrais. Só consulta;
pedir férias e enviar atestado continuam passando pelo RH.

**O login é o bot do Telegram.** O colaborador não tem usuário no sistema. Ele
envia `/portal` ao bot e recebe, *só naquele chat*, um link de vida curta
(`MINUTOS_VALIDADE_LINK`) e **uso único**; abrir o link queima o token e cria uma
sessão em cookie de `HORAS_VALIDADE_SESSAO`. Para entrar é preciso controlar o
Telegram já vinculado àquela pessoa — na prática, um segundo fator, e sem
transformar o RH em balcão de "esqueci a senha".

Decisões de segurança que valem lembrar antes de mexer:

- **Tokens são guardados como SHA-256**, nunca em claro. Diferente do
  `SurveyToken`, que é link permanente para uma pesquisa anônima, aqui o token
  abre salário e documentos.
- **Confirmação de CPF na primeira entrada** (`Colaborador.portalVerificadoEm`).
  O vínculo do Telegram casa pelos últimos 8 dígitos do telefone vindo do
  elleven: margem tolerável para convidar a uma pesquisa, inaceitável para abrir
  a ficha. Erradas `MAXIMO_TENTATIVAS_CPF` vezes, a sessão morre.
- **Pedir um link novo invalida o anterior** — no máximo um link vivo por vez.
- **Downloads têm rota própria** (`/api/portal/arquivos/[id]`), que amarra o
  arquivo ao dono da sessão: id de anexo de um colega devolve 404.
- `/portal` é liberado no `auth.config.ts` porque tem autenticação própria —
  passar pelo NextAuth mandaria o colaborador para uma tela de login que não é
  dele.
- A auditoria do portal grava o colaborador como ator (`ator` em
  `registrarAuditoria`), já que não há usuário NextAuth na sessão.

## Envio de convites

- Canal preferido **Telegram** (quando o colaborador tem `telegramChatId`
  vinculado pelo webhook); **fallback e-mail**.
- Teto global de **90 envios por dia-calendário de Brasília**
  (`LIMITE_DIARIO_ENVIOS` em `lib/constants-rh.ts`) — margem sob o limite do
  plano do provedor de e-mail.
- O cron `/api/cron/enviar-convites` roda **1×/dia às 13:00 UTC (10:00 BRT)**
  (ver `vercel.json`) e envia **por setor**: completa os setores menores
  primeiro e usa o resto do orçamento para avançar num setor grande. Em poucos
  dias toda a base é coberta sem estourar o limite.
- Convites `FAILED` **não** são retentados automaticamente — reenvio é manual
  na tela.
- `/responder/[token]` é **público**: quem responde entra pelo token, sem login.
- Anonimato: agregados só aparecem com no mínimo **3 respostas**
  (`AMOSTRA_MINIMA_ANONIMATO`); em pesquisa anônima a `Resposta` nunca grava
  `colaboradorId`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run diag:envios` | diagnóstico **read-only**: quanto do teto do dia já foi usado, o que falhou e por quê, quantos colaboradores estão sem contato |
| `npm run test:ferias` | testes do motor de férias CLT e das datas de calendário (não toca o banco) |
| `npm run test:portal` | testes do acesso ao portal (hash do token, uso único, expiração, CPF) — limpa o que cria |
| `npx tsx scripts/portal-e2e.ts preparar\|alheio\|limpar` | colaborador descartável para conferir o portal no navegador sem tocar em dado de gente real |
| `npm run smoke:dp` | fumaça do DP contra o banco real — ficha, anexo em bytea, férias, ausência e auditoria, **sempre em rollback** |
| `npm run test:conformidade` | testes do motor de conformidade SST — reciclagem, vencimento, exame (não toca o banco) |
| `npm run smoke:sst` | fumaça da conformidade contra o banco real — requisito, certificado, ASO, **sempre em rollback** |
| `npm run smoke:movimentacoes` | fumaça de movimentações/organograma — líder, transferência com histórico, **sempre em rollback** |
| `npm run smoke:beneficios` | fumaça de benefícios — conceder, custo no painel, encerrar, **sempre em rollback** |
| `npm run test:reconhecimento` | testes de `anosCompletos` — tempo de casa e marcos redondos (não toca o banco) |
| `npm run smoke:reconhecimento` | fumaça de reconhecimento — registro e duplicidade no mesmo ano, **sempre em rollback**, nenhuma mensagem enviada |
| `npm run test:bi` | testes do BI inicial — headcount, turnover, absenteísmo, custo (não toca o banco) |
| `npm run verificar:bi` | confere as consultas do BI contra o banco real — **read-only**, não escreve nada |
| `npm run smoke:epi` | fumaça de EPIs — troca vencendo a antiga, assinatura, exclusão sem órfão, **sempre em rollback** |
| `npm run smoke:cat` | fumaça de acidentes/CAT — vínculo com ausência, emissão de CAT, constraint de duplicidade, **sempre em rollback** |
| `npm run test:escala` | testes do cálculo de semana (início na segunda, domingo não avança) — não toca o banco |
| `npm run smoke:escala` | fumaça de escalas — upsert por dia, apagar, copiar semana sem sobrescrever, **sempre em rollback** |
| `npm run smoke:offboarding` | fumaça de offboarding — checklist padrão, item personalizado, entrevista com constraint de unicidade, **sempre em rollback** |
| `npm run smoke:avaliacao` | fumaça de avaliação de desempenho — gerar avaliações, nota final por média de competências, faixa do nine-box, avaliador extra e cascata, **sempre em rollback** |
| `npm run smoke:metas` | fumaça de metas & PDI — meta individual/setor, constraint CHECK de alvo único, progresso/status, item de PDI, **sempre em rollback** |
| `npm run smoke:treinamentos` | fumaça de treinamentos — catálogo com nome único, participação com constraint de duplicidade, ausência fora da matriz de competências, **sempre em rollback** |
| `npm run smoke:ats` | fumaça do ATS — slug único, funil com histórico, inscrição repetida barrada, disponibilidade no banco de talentos, admissão ligando candidatura à ficha, **sempre em rollback** |
| `npm run test:admissao` | testes das pendências da admissão — documento faltando, salário zero, documento extra (não toca o banco) |
| `npm run smoke:onboarding` | fumaça da trilha de integração — responsável sugerido, item personalizado com prazo, concluir/reabrir, gerar duas vezes sem duplicar, **sempre em rollback** |
| `npm run smoke:folha` | fumaça dos eventos variáveis — competência única por mês, recálculo preservando lançamento manual, falta abonada fora do desconto, fechamento, **sempre em rollback** |
| `npm run verificar:assistente` | confere as ferramentas do assistente contra o banco real, inclusive o isolamento entre empresas — **read-only**, não escreve nada |
| `npx tsx scripts/aplicar-migracao.ts <nome> [--dry]` | aplica um `migration.sql` à mão, em transação (ver "Notas sobre o banco") |
| `npm run check:migracoes` | lista migration do repo que o banco ainda não recebeu — **read-only**; roda sozinho antes de todo `npm run build` |
| `npx tsx scripts/importar-colaboradores-elleven.ts [--dry]` | importa/atualiza colaboradores a partir das exportações do elleven (upsert idempotente por CPF → cód. elleven → nome) |
| `npx tsx scripts/configurar-telegram-webhook.ts` | registra o webhook do bot do Telegram |
| `npm run db:studio` | Prisma Studio |

## Notas sobre o banco

Parte do histórico de migrations foi aplicada direto no banco, fora do fluxo do
Prisma (ver o cabeçalho de
`prisma/migrations/20260721120000_sync_funcionario_contato_e_elleven_relatorio`).
Ao rodar `prisma migrate` contra produção, confira o diff antes de aplicar.

**Desde 01/08/2026 o banco (`SOFTrh`, projeto Neon dedicado em São Paulo) não é
mais compartilhado** com `lm-bonificacao`/`vapt`/`shared` — nem schema, nem a
tabela `_prisma_migrations`. `npx prisma migrate deploy` volta a funcionar
normalmente contra produção, sem risco de reaplicar migration de outro app
(`npx prisma migrate status` confirma: banco em dia com as 42 migrations do
repo). O script manual continua disponível para o caso raro de precisar rodar
um `migration.sql` fora do fluxo do Prisma:
`npx tsx scripts/aplicar-migracao.ts <nome>` + `npx prisma migrate resolve --applied <nome>`.

Independente de como a migration é aplicada, é fácil esquecer o passo — e em
30/07/2026 o código subiu sem a migration do pivô `UserEmpresa`: as telas
responderam 404 e lista vazia, e passou-se o dia achando que o banco tinha
zerado (não tinha). Por isso todo `npm run build` roda antes o
`prisma/checar-migracoes.mjs`, que compara as pastas de `prisma/migrations/`
com o que está registrado no banco e **barra o deploy** se faltar alguma. Se
ele não conseguir checar (sem `DATABASE_URL`, banco fora do ar), avisa e deixa
passar — derrubar deploy por defeito da ferramenta foi o que fez a checagem
ser desligada da primeira vez.

O checador mora em `prisma/`, não em `scripts/`, porque o `.vercelignore` exclui
`scripts` inteiro: qualquer coisa que o `build` execute e viva ali some no deploy
com `Cannot find module`.

## Vulnerabilidades de dependências

`npm audit` em 01/08/2026 apontou 10 vulnerabilidades. Resolvidas 8: quatro por
`npm audit fix` (todas em ferramenta de dev — CLI do Prisma e do shadcn, nunca
rodam no app publicado) e o `sharp` (usado de verdade pelo `next/image`) via
`overrides` no `package.json`, já que o Next carrega sua própria cópia interna
e ignora o que está na raiz sem isso.

Aceito como risco, sem fix disponível: o `postcss@8.4.31` que o próprio Next
16.2.12 empacota dentro de `node_modules/next/node_modules/postcss` para o
pipeline interno de CSS do build. As três falhas (XSS no stringify, leitura de
arquivo via `sourceMappingURL`) exigem CSS malicioso passando por esse
pipeline — que só processa o CSS do próprio repositório em tempo de build,
nunca entrada de usuário em produção. Sem patch do Next disponível para essa
versão; revisar de novo no próximo `npm audit` (ou ao atualizar o Next).
