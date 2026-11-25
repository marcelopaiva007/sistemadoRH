// Importação de colaboradores × catálogo da marca, histórico e limpeza —
// regras puras, sem banco (26/11/2026).
//
//   npx tsx scripts/test-importacao-catalogo.ts

import {
  casarNoCatalogo,
  camposAlterados,
  movimentacaoDaImportacao,
  motivoDaMovimentacaoImportada,
  type FichaAtual,
  type ItemCatalogo,
  type SituacaoFuncional,
} from "../lib/importacao-catalogo";
import { decidirLimpeza, motivosDeUso, type UsoDoItemCatalogo } from "../lib/limpeza-catalogo";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

// A é o CNPJ de destino da planilha; B é um CNPJ irmão da MESMA marca. O
// catálogo que chega à função já é o da marca (A + B).
const SETORES: ItemCatalogo[] = [
  { id: "s-vendas-b", nome: "Vendas", empresaId: "B", ativo: true },
  { id: "s-rh-b", nome: "Recursos Humanos", empresaId: "B", ativo: true },
  { id: "s-fin-a-inativo", nome: "Financeiro", empresaId: "A", ativo: false },
  { id: "s-fin-b", nome: "Financeiro", empresaId: "B", ativo: true },
  { id: "s-ti-a", nome: "Tecnologia da Informação (TI)", empresaId: "A", ativo: true },
  { id: "s-ti-b", nome: "Tecnologia da Informação (TI)", empresaId: "B", ativo: true },
];
const CARGOS: ItemCatalogo[] = [
  { id: "c-vendedor-b", nome: "Vendedor", empresaId: "B", ativo: true },
  { id: "c-aux-adm-b", nome: "Auxiliar Administrativo", empresaId: "B", ativo: true },
  { id: "c-ger-vendas-b", nome: "Gerente de Vendas", empresaId: "B", ativo: true },
];

console.log("\nSetor/cargo procurado no catálogo da MARCA, não só no CNPJ de destino\n");
{
  const r = casarNoCatalogo("setor", ["Vendas", "  VENDAS ", "vendás"], SETORES, "A");
  const v = r.resolucao.get("vendas");
  ok(v?.tipo === "existente" && v.id === "s-vendas-b", "\"Vendas\" do CNPJ irmão é reaproveitado (não cria duplicata em A)");
  ok(r.novos.length === 0, "nenhum setor novo quando a marca já tem o nome");
  ok(r.casadosComOutroNome.length === 0, "caixa/acento/espaço diferentes não contam como \"outro nome\"");
}
{
  const r = casarNoCatalogo("setor", ["Comercial", "RH", "Setor Financeiro"], SETORES, "A");
  const com = r.resolucao.get("comercial");
  ok(com?.tipo === "existente" && com.id === "s-vendas-b", "\"Comercial\" casa com \"Vendas\" pelo radical (mesma régua da tela de unificar)");
  const rh = r.resolucao.get("rh");
  ok(rh?.tipo === "existente" && rh.id === "s-rh-b", "\"RH\" casa com \"Recursos Humanos\"");
  ok(
    r.casadosComOutroNome.some((c) => c.planilha === "Comercial" && c.cadastro === "Vendas"),
    "o casamento com outra grafia volta para a conferência mostrar",
  );
  ok(r.novos.length === 0, "nada novo é criado");
}
{
  const r = casarNoCatalogo("setor", ["Financeiro", "Tecnologia da Informação (TI)"], SETORES, "A");
  const fin = r.resolucao.get("financeiro");
  ok(fin?.tipo === "existente" && fin.id === "s-fin-b", "empate: o ATIVO do irmão ganha do inativo do destino");
  const ti = r.resolucao.get("tecnologia da informacao (ti)");
  ok(ti?.tipo === "existente" && ti.id === "s-ti-a", "empate entre ativos: o do CNPJ de destino ganha");
}
{
  const r = casarNoCatalogo("cargo", ["Vendedora", "Aux. Administrativo", "Gerente de Redes"], CARGOS, "A");
  ok(r.resolucao.get("vendedora")?.tipo === "existente", "\"Vendedora\" casa com \"Vendedor\"");
  const aux = r.resolucao.get("aux. administrativo");
  ok(aux?.tipo === "existente" && aux.id === "c-aux-adm-b", "\"Aux. Administrativo\" casa com \"Auxiliar Administrativo\"");
  ok(
    r.resolucao.get("gerente de redes")?.tipo === "novo" && r.novos.includes("Gerente de Redes"),
    "\"Gerente de Redes\" NÃO casa com \"Gerente de Vendas\" (substantivo diferente vira cargo novo)",
  );
}
{
  const r = casarNoCatalogo("cargo", ["Analista Financeiro", "analista financeiro", "Analista Financeira"], CARGOS, "A");
  ok(r.novos.length === 1 && r.novos[0] === "Analista Financeiro", "grafias do MESMO cargo novo viram um cadastro só, na grafia da 1ª linha");
  const v2 = r.resolucao.get("analista financeira");
  ok(v2?.tipo === "novo" && v2.nome === "Analista Financeiro", "a variação aponta para o cargo novo criado");
}

console.log("\nMudança que gera Movimentacao (histórico)\n");
const ANTES: SituacaoFuncional = {
  setorId: "s1",
  setorNome: "Vendas",
  posicaoId: "p1",
  posicaoNome: "Vendedor",
  salarioBase: 2000,
};
{
  ok(movimentacaoDaImportacao(ANTES, { ...ANTES }) === null, "nada mudou → nenhuma movimentação");
  const setor = movimentacaoDaImportacao(ANTES, { ...ANTES, setorId: "s2", setorNome: "Atendimento" });
  ok(setor?.tipo === "TRANSFERENCIA_SETOR", "só setor → Transferência de setor");
  ok(setor?.setorAnteriorNome === "Vendas" && setor?.setorNovoNome === "Atendimento", "grava antes e depois do setor por nome");
  ok(setor?.posicaoNovaNome === undefined, "cargo igual não aparece na movimentação");

  const cargo = movimentacaoDaImportacao(ANTES, {
    ...ANTES,
    setorId: "s2",
    setorNome: "Atendimento",
    posicaoId: "p2",
    posicaoNome: "Supervisor",
  });
  ok(cargo?.tipo === "MUDANCA_CARGO", "cargo mudou → Mudança de cargo (promoção não é inferida)");
  ok(cargo?.setorNovoNome === "Atendimento" && cargo?.posicaoAnteriorNome === "Vendedor", "setor e cargo vão juntos na mesma movimentação");

  const salario = movimentacaoDaImportacao(ANTES, { ...ANTES, salarioBase: 2300 });
  ok(salario?.tipo === "OUTRO" && salario.salarioNovo === 2300, "só salário → Outro, com o valor novo");
  ok(
    motivoDaMovimentacaoImportada("folha.csv", salario!).startsWith('Importação de planilha "folha.csv"') &&
      motivoDaMovimentacaoImportada("folha.csv", salario!).includes("→"),
    "o motivo diz a origem (importação) e o salário antes → depois",
  );

  ok(
    movimentacaoDaImportacao({ ...ANTES, salarioBase: null }, { ...ANTES, salarioBase: 2000 }) === null,
    "salário que estava vazio e foi preenchido NÃO é movimentação (é ficha completada)",
  );
  ok(movimentacaoDaImportacao(ANTES, { ...ANTES, salarioBase: 2000.001 }) === null, "diferença de arredondamento não é reajuste");
}

console.log("\nO que a planilha muda de fato (linha igual ao banco não vira UPDATE)\n");
const FICHA: FichaAtual = {
  nome: "Ana Souza",
  cpf: "12345678909",
  matricula: "2001",
  email: "ana@x.com",
  telefone: null,
  dataAdmissao: "2024-01-10",
  dataNascimento: null,
  salarioBase: 2000,
  tipoContrato: "CLT",
  setorId: "s1",
  posicaoId: "p1",
};
{
  ok(Object.keys(camposAlterados(FICHA, { ...FICHA })).length === 0, "linha idêntica → nada a gravar");
  const vazios = camposAlterados(FICHA, { ...FICHA, email: null, salarioBase: null, tipoContrato: null });
  ok(Object.keys(vazios).length === 0, "campo vazio na planilha não apaga o que a ficha tem");
  const d = camposAlterados(FICHA, { ...FICHA, telefone: "11999990000", setorId: "s2", salarioBase: 2100 });
  ok(
    d.telefone === "11999990000" && d.setorId === "s2" && d.salarioBase === 2100 && d.nome === undefined,
    "só os campos que mudam entram no UPDATE",
  );
}

console.log("\nLimpeza de setores/cargos: não apaga dado de outra entidade\n");
const LIVRE: UsoDoItemCatalogo = {
  colaboradores: 0,
  vagasAbertas: 0,
  metas: 0,
  planosAbertos: 0,
  requisitosNR: 0,
  gestoresVinculados: 0,
};
{
  ok(motivosDeUso(LIVRE).length === 0, "sem vínculo nenhum → pode remover");
  ok(motivosDeUso({ ...LIVRE, vagasAbertas: 1 }).includes("vagasAbertas"), "vaga aberta segura o setor/cargo");
  ok(motivosDeUso({ ...LIVRE, metas: 1 }).includes("metas"), "meta segura o setor (FK Cascade apagaria a meta)");
  ok(motivosDeUso({ ...LIVRE, planosAbertos: 1 }).includes("planosAbertos"), "plano de ação aberto segura o setor");
  ok(motivosDeUso({ ...LIVRE, requisitosNR: 2 }).includes("requisitosNR"), "requisito de NR segura o cargo");
  ok(motivosDeUso({ ...LIVRE, gestoresVinculados: 1 }).includes("gestoresVinculados"), "gestor de setor vinculado segura o setor");

  const decisao = decidirLimpeza([
    { id: "livre1", uso: LIVRE },
    { id: "livre2", uso: LIVRE },
    { id: "vaga", uso: { ...LIVRE, vagasAbertas: 1 } },
    { id: "nr", uso: { ...LIVRE, requisitosNR: 3 } },
    { id: "nr2", uso: { ...LIVRE, requisitosNR: 1, vagasAbertas: 2 } },
    { id: "com-gente", uso: { ...LIVRE, colaboradores: 4 } },
  ]);
  ok(decisao.remover.join(",") === "livre1,livre2", "só os sem vínculo nenhum saem");
  ok(decisao.mantidos === 3, "a tela recebe quantos ficaram (quem tem colaborador não é candidato)");
  ok(
    decisao.motivoMantidos.includes("2 com vaga aberta") && decisao.motivoMantidos.includes("2 com requisito de NR"),
    `e por quê: "${decisao.motivoMantidos}"`,
  );
  ok(decidirLimpeza([{ id: "x", uso: LIVRE }]).motivoMantidos === "", "nada mantido → sem explicação extra");
}

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
