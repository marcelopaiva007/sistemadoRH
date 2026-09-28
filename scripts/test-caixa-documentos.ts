// Caixa de documentos: limpeza da resposta da IA, identificação da pessoa e a
// regra "grava sozinho ou manda conferir". Regra pura, sem banco nem IA.
//
//   npx tsx scripts/test-caixa-documentos.ts
import {
  competenciaValida,
  dataValida,
  juntarFronteiras,
  normaValida,
  normalizarBloco,
  type ItemLido,
} from "../lib/caixa-documentos/extracao";
import { identificar, nomeComparavel, type Candidato, type EmpresaPorCnpj } from "../lib/caixa-documentos/identificar";
import {
  conferenciaDasPaginas,
  decidir,
  faltasParaGravar,
  ocupaAsPaginas,
  paginasSemDocumento,
  paginasSoDele,
} from "../lib/caixa-documentos/decidir";
import { marcaDoId, marcasDe } from "../lib/caixa-documentos/sigilo";
import { DESTINO, MOTIVO_FORA_DO_ESCOPO, TIPOS_CAIXA, VALORES_TIPO_CAIXA } from "../lib/caixa-documentos/tipos";
import { TIPOS_DOCUMENTO } from "../lib/constants-dp";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

// CPFs válidos (dígitos verificadores certos), gerados para teste.
const CPF_ANA = "52998224725";
const CPF_BRUNO = "11144477735";
const CNPJ_A = "11222333000181";
const PIS_ANA = "12056412545"; // dígito verificador certo
const CNPJ_FORA = "11444777000161";

const vazio = {
  dataDocumento: null,
  competencia: null,
  tipoFolha: null,
  anoCalendario: null,
  validoAte: null,
  asoTipo: null,
  asoResultado: null,
  restricoes: null,
  medico: null,
  crm: null,
  clinica: null,
  dataInicio: null,
  dataFim: null,
  dias: null,
  norma: null,
  cargaHoraria: null,
  descricao: null,
};

console.log("1. Todo tipo da Caixa tem destino declarado, e os do Dossiê existem no Dossiê:");
{
  ok(VALORES_TIPO_CAIXA.every((t) => t in DESTINO), "DESTINO cobre todos os tipos");
  const tiposDossie = TIPOS_DOCUMENTO.map((t) => t.value as string);
  const semLugar = TIPOS_CAIXA.filter((t) => DESTINO[t.value] === "DOSSIE" && !tiposDossie.includes(t.value));
  ok(semLugar.length === 0, `todo tipo que vai para o Dossiê é um TIPOS_DOCUMENTO${semLugar.length ? ` (faltam: ${semLugar.map((t) => t.value).join(", ")})` : ""}`);
}

console.log("\n2. Datas, competência e norma — só o que existe passa:");
{
  ok(dataValida("2026-02-28") === "2026-02-28", "28/02 existe");
  ok(dataValida("2026-02-30") === null, "30/02 não existe");
  ok(dataValida("28/02/2026") === null, "formato brasileiro não é aceito (a IA foi instruída a usar AAAA-MM-DD)");
  ok(competenciaValida("2026-08") === "2026-08", "competência 2026-08");
  ok(competenciaValida("2026-13") === null, "mês 13 não existe");
  ok(normaValida("NR 35") === "NR-35", "'NR 35' → NR-35");
  ok(normaValida("nr-10 SEP") === "NR-10-SEP", "'nr-10 SEP' → NR-10-SEP");
  ok(normaValida("NR-6") === "NR-06", "'NR-6' → NR-06");
  ok(normaValida("NR-99") === null, "norma fora da lista → nula");
  ok(normaValida("Direção Defensiva") === "DIRECAO-DEFENSIVA", "direção defensiva");
}

console.log("\n3. Limpeza de um bloco — páginas viram páginas do arquivo, lixo cai fora:");
{
  const r = normalizarBloco(
    {
      resumo: "Contracheques de agosto",
      documentos: [
        { tipo: "CONTRACHEQUE", paginaInicio: 17, paginaFim: 17, continuaAntes: false, continuaDepois: false, nome: " Ana  Souza ", cpf: "529.982.247-25", cnpjEmpregador: "11.222.333/0001-81", confianca: 0.97, campos: { competencia: "2026-08" } },
        { tipo: "INVENTADO", paginaInicio: 2, paginaFim: 1, nome: "X", cpf: "123.456.789-00", confianca: 7, campos: { dataDocumento: "2026-02-30" } },
      ],
    },
    { inicio: 16, fim: 30 },
  );
  ok(r.itens.length === 2, "dois itens");
  const [a, b] = r.itens;
  ok(a.paginaInicio === 17 && a.paginaFim === 17, "a página vem como número do arquivo (rótulo), sem conversão");
  ok(a.cpf === CPF_ANA && a.cnpj === CNPJ_A, "CPF e CNPJ viram só dígitos");
  ok(a.nome === "Ana Souza", "nome com espaço único");
  ok(a.campos.competencia === "2026-08", "competência preservada");
  ok(b.tipo === "OUTRO_DO_COLABORADOR" && b.avisos.includes("Tipo não reconhecido."), "tipo inventado vira OUTRO, com aviso");
  ok(b.paginaInicio === 16 && b.paginaFim === 30 && b.avisos.some((x) => x.includes("páginas")), "página fora do bloco não é 'ajeitada': aviso e conferência");
  ok(b.cpf === null && b.avisos.some((x) => x.includes("CPF")), "CPF com dígito errado some, com aviso");
  ok(b.confianca === 1, "confiança é limitada a 1");
  ok(b.campos.dataDocumento === null, "data inexistente vira nula");
  const inv = normalizarBloco(
    { paginas: [{ pagina: 16, pessoas: 1, identificadores: ["529.982.247-25", "123", PIS_ANA] }, { pagina: 17, pessoas: 2, identificadores: [] }, { pagina: 40, pessoas: 1, identificadores: [] }], documentos: [] },
    { inicio: 16, fim: 30 },
  ).inventario;
  ok(inv["16"]?.pessoas === 1 && inv["16"].ids.length === 2 && inv["16"].ids.includes(CPF_ANA) && inv["16"].ids.includes(PIS_ANA), "inventário: CPF e PIS válidos ficam, lixo sai");
  ok(inv["17"]?.pessoas === 2, "inventário: duas pessoas na página 17");
  ok(!("40" in inv), "página fora do bloco é ignorada");
  const sentinelas = normalizarBloco(
    { documentos: [{ tipo: "aso", paginaInicio: 1, paginaFim: 1, nome: "", cpf: "", cnpjEmpregador: "", confianca: 0.9, campos: { asoTipo: "NAO_LIDO", asoResultado: "apto", dias: 0, dataDocumento: "" } }] },
    { inicio: 1, fim: 1 },
  ).itens[0];
  ok(sentinelas.tipo === "ASO" && sentinelas.nome === null && sentinelas.cpf === null, "tipo em minúscula é aceito; \"\" vira nulo");
  ok(sentinelas.campos.asoTipo === null && sentinelas.campos.asoResultado === "APTO" && sentinelas.campos.dias === null, "NAO_LIDO e 0 viram nulo; enum em minúscula é aceito");
  const semLixo = normalizarBloco({ documentos: [{ tipo: "ASO", campos: { cid: "F32", salario: 5000 } }] }, { inicio: 1, fim: 1 });
  ok(!("cid" in semLixo.itens[0].campos) && !("salario" in semLixo.itens[0].campos), "campo não previsto (CID, salário) não passa");
}

console.log("\n4. Documento cortado entre dois blocos vira um só:");
{
  const base = (p: Partial<ItemLido>): ItemLido => ({
    tipo: "CONTRACHEQUE", paginaInicio: 1, paginaFim: 1, continuaAntes: false, continuaDepois: false,
    nome: "Ana Souza", cpf: CPF_ANA, cnpj: null, confianca: 0.9, campos: { ...vazio }, avisos: [], ...p,
  });
  const juntos = juntarFronteiras([
    base({ paginaInicio: 14, paginaFim: 15, continuaDepois: true, campos: { ...vazio, competencia: "2026-08" } }),
    base({ paginaInicio: 16, paginaFim: 16, continuaAntes: true, confianca: 0.85, cnpj: CNPJ_A }),
    base({ paginaInicio: 17, paginaFim: 17, nome: "Bruno Lima", cpf: CPF_BRUNO }),
  ]);
  ok(juntos.length === 2, "as duas metades da Ana viraram um documento");
  ok(juntos[0].paginaInicio === 14 && juntos[0].paginaFim === 16, "páginas 14 a 16");
  ok(juntos[0].confianca === 0.85 && juntos[0].cnpj === CNPJ_A, "fica a menor confiança; campo que só a 2ª metade tinha é aproveitado");
  ok(juntos[0].avisos.length === 0, "sem aviso de corte");
  const solto = juntarFronteiras([base({ paginaInicio: 15, paginaFim: 15, continuaDepois: true })]);
  ok(solto[0].avisos.length === 1, "metade sem par ganha aviso (vai para conferência)");
  const outraPessoa = juntarFronteiras([
    base({ paginaInicio: 15, paginaFim: 15, continuaDepois: true }),
    base({ paginaInicio: 16, paginaFim: 16, continuaAntes: true, nome: "Bruno Lima", cpf: CPF_BRUNO }),
  ]);
  ok(outraPessoa.length === 2, "não junta metades de pessoas diferentes");
}

console.log("\n5. De quem é o documento:");
{
  const hoje = new Date(Date.UTC(2026, 8, 28));
  const cand = (p: Partial<Candidato>): Candidato => ({
    id: "x", empresaId: "A", nome: "Ana Souza", cpf: null, ativo: true, dataAdmissao: null, dataDesligamento: null, ...p,
  });
  const empresas: EmpresaPorCnpj = new Map([
    [CNPJ_A, { id: "A", noEscopo: true }],
    [CNPJ_FORA, { id: "Z", noEscopo: false }],
  ]);
  type Tipo = "CONTRACHEQUE" | "ASO" | "TRCT" | "RG";
  const doc = (p: Partial<{ tipo: Tipo; nome: string | null; cpf: string | null; cnpj: string | null; asoTipo: string | null }>) => ({
    tipo: "RG" as Tipo, nome: "ANA SOUZA", cpf: null, cnpj: null, asoTipo: null, ...p,
  });
  const ana = cand({ id: "ana", cpf: "529.982.247-25" });

  const r1 = identificar(doc({ cpf: CPF_ANA }), [ana, cand({ id: "bruno", nome: "Bruno", cpf: CPF_BRUNO })], empresas, hoje);
  ok(r1.tipo === "CPF" && r1.colaboradorId === "ana", "RG: CPF com pontuação no cadastro casa com o lido");
  const r1b = identificar(doc({ tipo: "CONTRACHEQUE", cpf: CPF_ANA }), [ana], empresas, hoje);
  ok(r1b.tipo === "SUGESTAO", "contracheque com CPF mas SEM CNPJ → só sugestão (documento do empregador)");
  const r1c = identificar(doc({ tipo: "CONTRACHEQUE", cpf: CPF_ANA, cnpj: CNPJ_A }), [ana], empresas, hoje);
  ok(r1c.tipo === "CPF", "contracheque com CPF + CNPJ da empresa da ficha → grava");
  const r1d = identificar(doc({ tipo: "CONTRACHEQUE", cpf: CPF_ANA, cnpj: "11222333000262" }), [ana], empresas, hoje);
  ok(r1d.tipo === "SUGESTAO" && r1d.motivo.includes("não é de nenhuma empresa cadastrada"), "CNPJ desconhecido → sugestão avisando");

  const duas = [cand({ id: "ana-A", cpf: CPF_ANA, empresaId: "A" }), cand({ id: "ana-B", cpf: CPF_ANA, empresaId: "B" })];
  const r2 = identificar(doc({ cpf: CPF_ANA }), duas, empresas, hoje);
  ok(r2.tipo === "NENHUM" && r2.opcoes.length === 2, "mesmo CPF em duas fichas ativas sem CNPJ → RH escolhe");
  const r3 = identificar(doc({ tipo: "CONTRACHEQUE", cpf: CPF_ANA, cnpj: CNPJ_A }), duas, empresas, hoje);
  ok(r3.tipo === "CPF" && r3.colaboradorId === "ana-A", "o CNPJ do documento desempata");

  const r4 = identificar(doc({ cnpj: CNPJ_FORA, cpf: CPF_ANA }), [cand({ id: "ana", cpf: CPF_ANA })], empresas, hoje);
  ok(r4.tipo === "NENHUM" && r4.opcoes.length === 0 && !r4.motivo.includes("Z"), "CNPJ fora do acesso → não grava e não revela nada");

  const r5 = identificar(doc({ tipo: "CONTRACHEQUE" }), [cand({ id: "ana" })], empresas, hoje);
  ok(r5.tipo === "SUGESTAO", "só pelo nome, sem CNPJ → sugestão");
  const r6 = identificar(doc({ tipo: "CONTRACHEQUE", cnpj: CNPJ_A }), [cand({ id: "ana", nome: "Âna  Souza" })], empresas, hoje);
  ok(r6.tipo === "SUGESTAO", "nome + CNPJ em documento que vai para o PORTAL → ainda só sugestão");
  const r6b = identificar(doc({ tipo: "ASO", asoTipo: "PERIODICO", cnpj: CNPJ_A }), [cand({ id: "ana", nome: "Âna  Souza" })], empresas, hoje);
  ok(r6b.tipo === "NOME_CNPJ", "nome (sem acento/caixa) + CNPJ num ASO (não vai ao portal) → grava");
  const r7 = identificar(doc({ tipo: "ASO", asoTipo: "PERIODICO", cnpj: CNPJ_A }), [cand({ id: "a1" }), cand({ id: "a2", ativo: false })], empresas, hoje);
  ok(r7.tipo === "NENHUM" && r7.opcoes.length === 2, "homônimo (mesmo desligado) na empresa → RH escolhe");

  const desligada = cand({ id: "ana", cpf: CPF_ANA, ativo: false, dataDesligamento: new Date(Date.UTC(2026, 7, 1)) });
  ok(identificar(doc({ tipo: "TRCT", cpf: CPF_ANA, cnpj: CNPJ_A }), [desligada], empresas, hoje).tipo === "CPF", "TRCT de quem saiu há 58 dias, com CNPJ, casa");
  ok(identificar(doc({ tipo: "ASO", cpf: CPF_ANA, cnpj: CNPJ_A, asoTipo: "PERIODICO" }), [desligada], empresas, hoje).tipo === "NENHUM", "ASO periódico não vai para ficha desligada");
  ok(identificar(doc({ tipo: "ASO", cpf: CPF_ANA, cnpj: CNPJ_A, asoTipo: "DEMISSIONAL" }), [desligada], empresas, hoje).tipo === "CPF", "ASO demissional vai");
  const antiga = cand({ id: "ana", cpf: CPF_ANA, ativo: false, dataDesligamento: new Date(Date.UTC(2025, 0, 1)) });
  ok(identificar(doc({ tipo: "TRCT", cpf: CPF_ANA, cnpj: CNPJ_A }), [antiga], empresas, hoje).tipo !== "CPF", "desligada há mais de 180 dias não casa");
  const recontratada = [cand({ id: "velha", cpf: CPF_ANA, ativo: false, dataDesligamento: new Date(Date.UTC(2026, 8, 1)) }), cand({ id: "nova", cpf: CPF_ANA, empresaId: "B" })];
  const r8 = identificar(doc({ cpf: CPF_ANA }), recontratada, empresas, hoje);
  ok(r8.tipo === "CPF" && r8.colaboradorId === "nova", "RG de recontratada: a ficha ativa ganha da desligada");
  const r9 = identificar(doc({ cpf: CPF_BRUNO, nome: "Ana Souza" }), [cand({ id: "ana", cpf: CPF_ANA })], empresas, hoje);
  ok(r9.tipo === "NENHUM", "CPF lido de outra pessoa com nome igual → não sugere a Ana (CPF dela é outro)");
  ok(nomeComparavel("(SERASA) José da Silva 45.799.041") === "jose da silva", "lixo antigo no nome do cadastro não atrapalha");
  const saiuEmAgosto = cand({ id: "ana", cpf: CPF_ANA, ativo: false, dataAdmissao: new Date(Date.UTC(2024, 0, 10)), dataDesligamento: new Date(Date.UTC(2026, 7, 15)) });
  ok(identificar({ ...doc({ tipo: "CONTRACHEQUE", cpf: CPF_ANA, cnpj: CNPJ_A }), dataReferencia: new Date(Date.UTC(2026, 7, 1)) }, [saiuEmAgosto], empresas, hoje).tipo === "CPF", "contracheque de agosto de quem saiu em agosto → casa");
  ok(identificar({ ...doc({ tipo: "CONTRACHEQUE", cpf: CPF_ANA, cnpj: CNPJ_A }), dataReferencia: new Date(Date.UTC(2026, 9, 1)) }, [saiuEmAgosto], empresas, hoje).tipo !== "CPF", "contracheque de outubro de quem saiu em agosto → não casa");
  const transferida = [saiuEmAgosto, cand({ id: "ana-B", cpf: CPF_ANA, empresaId: "B" })];
  const r10 = identificar({ ...doc({ tipo: "TRCT", cpf: CPF_ANA, cnpj: CNPJ_A }), dataReferencia: new Date(Date.UTC(2026, 7, 20)) }, transferida, empresas, hoje);
  ok(r10.tipo === "NENHUM" && r10.opcoes.length === 2, "TRCT da ficha antiga com ficha ativa em outro CNPJ → RH escolhe");
  ok(identificar(doc({ tipo: "ASO", asoTipo: "ADMISSIONAL", cnpj: CNPJ_A }), [cand({ id: "ana" })], empresas, hoje).tipo === "SUGESTAO", "ASO admissional só pelo nome → sugestão (pode ser homônimo de quem ainda não tem ficha)");
}

console.log("\n6. Grava sozinho só quando está tudo certo:");
{
  const aso = { ...vazio, asoTipo: "PERIODICO", asoResultado: "APTO", dataDocumento: "2026-09-10" };
  const semFatos = { impedimentos: [] as string[], paginasCompartilhadas: false };
  const porCpf = { tipo: "CPF" as const, colaboradorId: "ana", empresaId: "A" };

  ok(decidir({ tipo: "ASO", confianca: 0.95, campos: aso, avisos: [] }, porCpf, semFatos).acao === "GRAVAR", "ASO completo, CPF, confiança alta → grava");
  const baixa = decidir({ tipo: "ASO", confianca: 0.6, campos: aso, avisos: [] }, porCpf, semFatos);
  ok(baixa.acao === "CONFERIR" && baixa.motivos[0].includes("60%"), "confiança 60% → conferir, dizendo o número");
  const sug = decidir({ tipo: "ASO", confianca: 0.95, campos: aso, avisos: [] }, { tipo: "SUGESTAO", colaboradorId: "ana", empresaId: "A", motivo: "só nome" }, semFatos);
  ok(sug.acao === "CONFERIR", "sugestão por nome nunca grava sozinha");
  const semResultado = decidir({ tipo: "ASO", confianca: 0.95, campos: { ...aso, asoResultado: null }, avisos: [] }, porCpf, semFatos);
  ok(semResultado.acao === "CONFERIR", "ASO sem resultado → conferir (igual ao formulário)");
  ok(decidir({ tipo: "CONTRACHEQUE", confianca: 0.95, campos: { ...vazio, competencia: "2026-08" }, avisos: [] }, porCpf, { ...semFatos, paginasCompartilhadas: true }).acao === "CONFERIR", "página com duas pessoas → conferir");
  ok(decidir({ tipo: "CONTRACHEQUE", confianca: 0.95, campos: { ...vazio, competencia: "2026-08" }, avisos: [] }, porCpf, { ...semFatos, impedimentos: ["Já existe"] }).acao === "CONFERIR", "duplicado → conferir");
  ok(decidir({ tipo: "OUTRO_DO_COLABORADOR", confianca: 1, campos: vazio, avisos: [] }, porCpf, semFatos).acao === "CONFERIR", "tipo sem destino → conferir");
  ok(decidir({ tipo: "RG", confianca: 0.9, campos: vazio, avisos: ["O documento parece continuar"] }, porCpf, semFatos).acao === "CONFERIR", "aviso da limpeza → conferir");
  ok(decidir({ tipo: "ASO", confianca: 0.99, campos: { ...aso, asoResultado: "INAPTO" }, avisos: [] }, porCpf, semFatos).acao === "CONFERIR", "ASO inapto nunca entra em silêncio");
  ok(faltasParaGravar("ATESTADO", { ...vazio, dataInicio: "2026-09-10", dias: 3 }).length === 0, "atestado com início e dias basta");
  ok(faltasParaGravar("ATESTADO", { ...vazio, dataInicio: "2026-09-10", dataFim: "2026-09-01" }).length === 1, "atestado com fim antes do início → falta");
  ok(faltasParaGravar("CONTRACHEQUE", vazio).length === 1, "contracheque sem competência → falta");
  ok(faltasParaGravar("CERTIFICADO_NR", { ...vazio, norma: "NR-35", dataDocumento: "2026-01-10" }).length === 0, "NR com norma e data basta");
}

console.log("\n7. Páginas só da pessoa (senão, separar o arquivo exporia outra):");
{
  const item = { paginaInicio: 3, paginaFim: 4, ids: [CPF_ANA] };
  const soAna = { "3": { pessoas: 1, ids: [CPF_ANA] }, "4": { pessoas: 1, ids: [CPF_ANA] } };
  ok(paginasSoDele(item, [{ paginaInicio: 5, paginaFim: 5 }], soAna, true), "páginas exclusivas, só a Ana em cada uma → ok");
  ok(!paginasSoDele(item, [{ paginaInicio: 4, paginaFim: 4 }], soAna, true), "outro item na página 4 → não");
  ok(!paginasSoDele(item, [], { ...soAna, "4": { pessoas: 2, ids: [CPF_ANA, CPF_BRUNO] } }, true), "IA contou 2 pessoas na página 4 → não (portal)");
  ok(!paginasSoDele(item, [], { "3": soAna["3"] }, true), "página sem inventário → não (portal)");
  ok(!paginasSoDele(item, [], { ...soAna, "4": { pessoas: 1, ids: [CPF_BRUNO] } }, true), "CPF de outra pessoa na página 4 (página trocada) → não");
  ok(paginasSoDele(item, [], { "3": soAna["3"] }, false), "fora do portal (exame), o inventário não bloqueia");
  ok(paginasSoDele({ paginaInicio: 3, paginaFim: 3, ids: [PIS_ANA] }, [], { "3": { pessoas: 1, ids: [PIS_ANA] } }, true), "contracheque só com PIS: o PIS na página basta");
}

console.log("\n9. PIS no lugar do CPF:");
{
  const hoje = new Date(Date.UTC(2026, 8, 28));
  const empresas: EmpresaPorCnpj = new Map([[CNPJ_A, { id: "A", noEscopo: true }]]);
  const ana = { id: "ana", empresaId: "A", nome: "Ana Souza", cpf: null, pis: "120.56412.54-5", ativo: true, dataAdmissao: null, dataDesligamento: null };
  const r = identificar({ tipo: "CONTRACHEQUE", nome: "ANA SOUZA", cpf: null, pis: PIS_ANA, cnpj: CNPJ_A, asoTipo: null }, [ana], empresas, hoje);
  ok(r.tipo === "PIS" && r.colaboradorId === "ana", "contracheque sem CPF, com PIS + CNPJ → grava (PIS com pontuação no cadastro)");
  const lido = normalizarBloco({ documentos: [{ tipo: "CONTRACHEQUE", paginaInicio: 1, paginaFim: 1, pis: "120.5641.254-8" }] }, { inicio: 1, fim: 1 }).itens[0];
  ok(lido.pis === null && lido.avisos.some((a) => a.includes("PIS")), "PIS com dígito errado some, com aviso");
}

console.log("\n8. CPF certo, nome errado:");
{
  const hoje = new Date(Date.UTC(2026, 8, 28));
  const ficha = { id: "ana", empresaId: "A", nome: "Ana Maria Souza", cpf: CPF_ANA, ativo: true, dataAdmissao: null, dataDesligamento: null };
  const empresas: EmpresaPorCnpj = new Map([[CNPJ_A, { id: "A", noEscopo: true }]]);
  const r = identificar({ tipo: "CONTRACHEQUE", nome: "Bruno Lima", cpf: CPF_ANA, cnpj: CNPJ_A, asoTipo: null }, [ficha], empresas, hoje);
  ok(r.tipo === "SUGESTAO", "contracheque com CPF da Ana e nome do Bruno → não grava sozinho");
  const r2 = identificar({ tipo: "CONTRACHEQUE", nome: "ANA M. SOUZA", cpf: CPF_ANA, cnpj: CNPJ_A, asoTipo: null }, [ficha], empresas, hoje);
  ok(r2.tipo === "CPF", "nome do meio abreviado ainda confere");
}

console.log("\n10. Conferência à mão: página de duas pessoas não vai ao portal de nenhuma:");
{
  const inv = {
    "1": { pessoas: 1, ids: [CPF_ANA] },
    "2": { pessoas: 2, ids: [CPF_ANA, CPF_BRUNO] },
    "3": { pessoas: 1, ids: [CPF_BRUNO] },
    "4": { pessoas: 1, ids: [] },
    "5": { pessoas: 0, ids: [] },
  };
  ok(conferenciaDasPaginas(1, 1, inv, [CPF_ANA]) === "OK", "página só da Ana, para a Ana → ok");
  ok(conferenciaDasPaginas(1, 2, inv, [CPF_ANA]) === "OUTRA_PESSOA", "duas pessoas na página 2 → bloqueia, sem confirmação possível");
  ok(conferenciaDasPaginas(3, 3, inv, [CPF_ANA]) === "OUTRA_PESSOA", "página só com o CPF do Bruno, escolhida para a Ana → bloqueia");
  ok(conferenciaDasPaginas(4, 4, inv, [CPF_ANA]) === "DUVIDA", "página com uma pessoa e sem CPF lido → o RH confirma olhando");
  ok(conferenciaDasPaginas(9, 9, inv, [CPF_ANA]) === "DUVIDA", "página sem leitura → o RH confirma olhando");
  ok(conferenciaDasPaginas(1, 1, inv, [CPF_ANA]) === "OK" && conferenciaDasPaginas(5, 5, inv, [CPF_ANA]) === "OK", "página sem pessoa nenhuma (verso) não atrapalha");
  ok(conferenciaDasPaginas(1, 1, inv, []) === "DUVIDA", "ficha sem CPF nem PIS → dúvida, nunca ok");
}

console.log("\n11. Descartar o item do outro não libera a página dele:");
{
  const base = { tipo: "CONTRACHEQUE", status: "DESCARTADO", colaboradorId: null, nomeLido: "BRUNO LIMA", motivo: null };
  ok(ocupaAsPaginas({ ...base, status: "CONFERIR" }, "ana"), "item ativo de outro ocupa");
  ok(ocupaAsPaginas(base, "ana"), "contracheque do Bruno descartado continua ocupando a página");
  ok(!ocupaAsPaginas({ ...base, colaboradorId: "ana" }, "ana"), "descartado que era da própria Ana (leitura repetida) libera");
  ok(!ocupaAsPaginas({ ...base, nomeLido: null }, "ana"), "descartado sem pessoa lida (página solta) libera");
  ok(!ocupaAsPaginas({ ...base, tipo: "NAO_E_DE_COLABORADOR", status: "CONFERIR" }, "ana"), "página sem pessoa (capa, boleto) não ocupa");
  ok(ocupaAsPaginas({ ...base, nomeLido: null, motivo: `${MOTIVO_FORA_DO_ESCOPO} — ignorado.` }, "ana"), "de empresa fora do alcance: ocupa, mesmo sem nome guardado");
}

console.log("\n12. Página que a leitura pulou não some:");
{
  const itens = [{ paginaInicio: 1, paginaFim: 2 }, { paginaInicio: 4, paginaFim: 4 }];
  ok(JSON.stringify(paginasSemDocumento(1, 5, itens, {})) === "[3,5]", "páginas 3 e 5 fora de qualquer documento → viram itens");
  ok(JSON.stringify(paginasSemDocumento(1, 5, itens, { "3": { pessoas: 0, ids: [] } })) === "[5]", "página que a leitura disse não ter pessoa (capa) fica de fora");
}

console.log("\n13. Atestado e contracheque que não gravam sozinhos:");
{
  ok(
    faltasParaGravar("ATESTADO", { ...vazio, dataInicio: "2026-09-10", dataFim: "2026-09-13", dias: 3 }).length === 1,
    "fim 13/09 e 3 dias a partir de 10/09 não batem (seriam 4) → falta",
  );
  ok(faltasParaGravar("ATESTADO", { ...vazio, dataInicio: "2026-09-10", dataFim: "2026-09-12", dias: 3 }).length === 0, "fim 12/09 e 3 dias batem");
  const porCpf = { tipo: "CPF" as const, colaboradorId: "x", empresaId: "A" };
  const semFatos = { impedimentos: [], paginasCompartilhadas: false };
  ok(
    decidir({ tipo: "CONTRACHEQUE", confianca: 0.99, campos: { ...vazio, competencia: "2026-12" }, avisos: [] }, porCpf, semFatos).acao === "CONFERIR",
    "contracheque sem o tipo da folha lido → conferir (podia ser o 13º)",
  );
  ok(
    decidir({ tipo: "CONTRACHEQUE", confianca: 0.99, campos: { ...vazio, competencia: "2026-12", tipoFolha: "MENSAL" }, avisos: [] }, porCpf, semFatos).acao === "GRAVAR",
    "contracheque mensal lido → grava",
  );
}

console.log("\n14. Empresa fora do alcance e informe de quem saiu:");
{
  const hoje = new Date(Date.UTC(2026, 8, 28));
  const empresas: EmpresaPorCnpj = new Map([
    [CNPJ_A, { id: "A", noEscopo: true }],
    [CNPJ_FORA, { id: "Z", noEscopo: false }],
  ]);
  const ana: Candidato = { id: "ana", empresaId: "A", nome: "Ana Souza", cpf: CPF_ANA, ativo: true, dataAdmissao: null, dataDesligamento: null };
  const fora = identificar({ tipo: "CONTRACHEQUE", nome: "Ana Souza", cpf: CPF_ANA, cnpj: CNPJ_FORA, asoTipo: null }, [ana], empresas, hoje);
  ok(fora.tipo === "NENHUM" && fora.foraDoEscopo === true, "CNPJ de empresa que quem enviou não acessa → marcado para sair sem mostrar");
  const saiu: Candidato = {
    id: "bruno",
    empresaId: "A",
    nome: "Bruno Lima",
    cpf: CPF_BRUNO,
    ativo: false,
    dataAdmissao: new Date(Date.UTC(2020, 0, 1)),
    dataDesligamento: new Date(Date.UTC(2025, 5, 15)),
  };
  const informe = (ano: number) =>
    identificar(
      {
        tipo: "INFORME_RENDIMENTOS",
        nome: "Bruno Lima",
        cpf: CPF_BRUNO,
        cnpj: CNPJ_A,
        asoTipo: null,
        dataReferencia: new Date(Date.UTC(ano + 1, 1, 20)),
        periodoReferencia: { inicio: new Date(Date.UTC(ano, 0, 1)), fim: new Date(Date.UTC(ano, 11, 31)) },
      },
      [saiu],
      empresas,
      hoje,
    );
  ok(informe(2025).tipo === "CPF", "informe de 2025 de quem saiu em junho/2025 → acha a ficha");
  ok(informe(2026).tipo !== "CPF", "informe de 2026 de quem saiu em 2025 → não é daquela ficha");
}

console.log("\n15. Inventário sem CPF guardado:");
{
  ok(marcaDoId(CPF_ANA) === marcaDoId(CPF_ANA), "mesma entrada, mesma marca");
  ok(!marcaDoId(CPF_ANA).includes(CPF_ANA.slice(0, 6)) && marcaDoId(CPF_ANA) !== marcaDoId(CPF_BRUNO), "a marca não carrega o CPF e separa pessoas");
  ok(marcasDe("529.982.247-25", null)[0] === marcaDoId(CPF_ANA), "CPF formatado da ficha dá a mesma marca do lido");
}

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
