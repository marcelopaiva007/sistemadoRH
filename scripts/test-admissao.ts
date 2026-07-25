// Testes do cálculo de pendências da admissão. Função pura — não toca o banco.
//
//   npx tsx scripts/test-admissao.ts
import { DOCUMENTOS_ADMISSIONAIS, pendenciasDaAdmissao } from "../lib/admissao";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const completo = {
  dataAdmissao: new Date("2026-07-01T00:00:00Z"),
  salarioBase: 2200,
  tipoContrato: "CLT",
  tiposDeDocumentoNoDossie: [...DOCUMENTOS_ADMISSIONAIS],
  temExameAdmissional: true,
};

console.log("1. Admissão completa não gera pendência");
{
  const p = pendenciasDaAdmissao(completo);
  ok(p.length === 0, "nada pendente quando está tudo preenchido e anexado");
}

console.log("2. Cada item faltando vira uma pendência");
{
  ok(
    pendenciasDaAdmissao({ ...completo, dataAdmissao: null }).some((p) => p.chave === "DATA_ADMISSAO"),
    "sem data de admissão acusa pendência",
  );
  ok(
    pendenciasDaAdmissao({ ...completo, salarioBase: null }).some((p) => p.chave === "SALARIO"),
    "sem salário acusa pendência",
  );
  ok(
    pendenciasDaAdmissao({ ...completo, tipoContrato: null }).some((p) => p.chave === "TIPO_CONTRATO"),
    "sem tipo de contrato acusa pendência",
  );
  ok(
    pendenciasDaAdmissao({ ...completo, temExameAdmissional: false }).some((p) => p.chave === "ASO_ADMISSIONAL"),
    "sem ASO admissional acusa pendência",
  );
}

console.log("3. Salário zero é válido — não confundir com ausente");
{
  const p = pendenciasDaAdmissao({ ...completo, salarioBase: 0 });
  ok(!p.some((x) => x.chave === "SALARIO"), "salário 0 não é tratado como faltando (estagiário sem bolsa, por ex.)");
}

console.log("4. Documento faltando no dossiê aparece pelo rótulo");
{
  const semCtps = [...DOCUMENTOS_ADMISSIONAIS].filter((d) => d !== "CTPS");
  const p = pendenciasDaAdmissao({ ...completo, tiposDeDocumentoNoDossie: semCtps });
  ok(p.length === 1 && p[0].chave === "CTPS", "só a CTPS fica pendente");
  ok(p[0].descricao === "CTPS", "a descrição usa o rótulo do catálogo de documentos");
}

console.log("5. Dossiê vazio acusa todos os documentos, e só eles");
{
  const p = pendenciasDaAdmissao({ ...completo, tiposDeDocumentoNoDossie: [] });
  ok(p.length === DOCUMENTOS_ADMISSIONAIS.length, `${DOCUMENTOS_ADMISSIONAIS.length} documentos pendentes`);
}

console.log("6. Documento extra no dossiê não atrapalha");
{
  const p = pendenciasDaAdmissao({
    ...completo,
    tiposDeDocumentoNoDossie: [...DOCUMENTOS_ADMISSIONAIS, "DIPLOMA", "CNH"],
  });
  ok(p.length === 0, "documento fora do catálogo admissional é ignorado");
}

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
