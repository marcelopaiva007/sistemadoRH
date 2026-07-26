import { lerCsv, type LinhaCsv } from "@/lib/csv";
import { apenasDigitosCpf, cpfValido } from "@/lib/cpf";
import { apenasDigitosCnpj } from "@/lib/cnpj";
import { dataUTC } from "@/lib/datas";
import { TIPOS_CONTRATO } from "@/lib/constants-dp";

/**
 * Validação da planilha de colaboradores — pura, sem banco e sem sessão, para
 * o smoke test exercitar cada regra sem subir servidor. Quem consulta o banco
 * (resolver setor/cargo, achar quem já existe) é a action.
 */

// A planilha real vem com o cabeçalho que o RH usa, não com o nosso nome
// interno. Os apelidos cobrem as variações prováveis; a coluna desconhecida é
// reportada, nunca adivinhada.
const APELIDOS: Record<string, string> = {
  nome: "nome",
  nome_completo: "nome",
  colaborador: "nome",
  cpf: "cpf",
  matricula: "matricula",
  setor: "setor",
  departamento: "setor",
  cargo: "cargo",
  funcao: "cargo",
  posicao: "cargo",
  email: "email",
  e_mail: "email",
  telefone: "telefone",
  celular: "telefone",
  data_admissao: "data_admissao",
  admissao: "data_admissao",
  data_nascimento: "data_nascimento",
  nascimento: "data_nascimento",
  salario_base: "salario_base",
  salario: "salario_base",
  tipo_contrato: "tipo_contrato",
  contrato: "tipo_contrato",
  cnpj: "cnpj",
};

export const COLUNAS_MODELO = [
  "nome",
  "cpf",
  "matricula",
  "setor",
  "cargo",
  "email",
  "telefone",
  "data_admissao",
  "data_nascimento",
  "salario_base",
  "tipo_contrato",
] as const;

export type LinhaValidada = {
  numeroDaLinha: number;
  nome: string;
  cpf: string | null;
  matricula: string | null;
  setor: string;
  cargo: string;
  email: string | null;
  telefone: string | null;
  dataAdmissao: string | null; // ISO yyyy-mm-dd — Date não sobrevive a JSON
  dataNascimento: string | null;
  salarioBase: number | null;
  tipoContrato: string | null;
};

export type ProblemaLinha = { numeroDaLinha: number; nome: string; mensagens: string[] };

/** dd/mm/aaaa ou aaaa-mm-dd → ISO aaaa-mm-dd. null = não informado; erro = string ruim. */
function lerData(valor: string): { iso: string | null } | { erro: string } {
  if (!valor) return { iso: null };
  let dia: number, mes: number, ano: number;
  const br = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (br) [dia, mes, ano] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else if (iso) [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return { erro: `data "${valor}" não está em dd/mm/aaaa` };

  const d = dataUTC(ano, mes, dia);
  // dataUTC não valida; o Date "corrige" 31/02 para 03/03. Conferir a volta.
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) {
    return { erro: `data "${valor}" não existe no calendário` };
  }
  if (ano < 1900 || ano > 2100) return { erro: `ano ${ano} fora do intervalo aceito` };
  return { iso: `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` };
}

/** "2.500,00" (Excel BR), "2500,5" ou "2500.50" → número. */
function lerValor(valor: string): { numero: number | null } | { erro: string } {
  if (!valor) return { numero: null };
  const limpo = valor.replace(/\s|R\$/g, "");
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n < 0) return { erro: `valor "${valor}" não é um número` };
  return { numero: n };
}

function lerTipoContrato(valor: string): { tipo: string | null } | { erro: string } {
  if (!valor) return { tipo: null };
  const norm = valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .trim();
  const achado = TIPOS_CONTRATO.find(
    (t) =>
      t.value === norm ||
      t.label
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toUpperCase() === norm,
  );
  if (!achado) {
    const aceitos = TIPOS_CONTRATO.map((t) => t.value).join(", ");
    return { erro: `tipo de contrato "${valor}" não reconhecido (aceitos: ${aceitos})` };
  }
  return { tipo: achado.value };
}

/**
 * Valida a planilha inteira, sem tocar no banco.
 *
 * `cnpjDaEmpresa` participa por segurança: se a planilha trouxer uma coluna de
 * CNPJ, cada linha precisa apontar para a MESMA empresa em que a importação
 * está sendo feita. Linha apontando para outro CNPJ é erro, nunca redirecionada
 * — importar silenciosamente para outra empresa é o pior desfecho possível.
 */
export function validarPlanilhaColaboradores(
  bytes: Uint8Array,
  cnpjDaEmpresa: string | null,
): {
  colunasReconhecidas: string[];
  colunasIgnoradas: string[];
  validas: LinhaValidada[];
  problemas: ProblemaLinha[];
  erroGeral: string | null;
} {
  const { colunas, linhas } = lerCsv(bytes);

  const mapa = new Map<string, string>(); // coluna do arquivo -> nome interno
  const ignoradas: string[] = [];
  for (const c of colunas) {
    const interno = APELIDOS[c];
    if (interno) mapa.set(c, interno);
    else if (c) ignoradas.push(c);
  }
  const reconhecidas = [...new Set(mapa.values())];

  if (linhas.length === 0) {
    return { colunasReconhecidas: reconhecidas, colunasIgnoradas: ignoradas, validas: [], problemas: [], erroGeral: "O arquivo não tem nenhuma linha de dados." };
  }
  for (const obrigatoria of ["nome", "setor", "cargo"]) {
    if (!reconhecidas.includes(obrigatoria)) {
      return {
        colunasReconhecidas: reconhecidas,
        colunasIgnoradas: ignoradas,
        validas: [],
        problemas: [],
        erroGeral: `Falta a coluna obrigatória "${obrigatoria}". Baixe o modelo para ver o formato esperado.`,
      };
    }
  }

  const pegar = (dados: LinhaCsv, interno: string): string => {
    for (const [doArquivo, nomeInterno] of mapa) {
      if (nomeInterno === interno && dados[doArquivo] !== undefined && dados[doArquivo] !== "") {
        return dados[doArquivo];
      }
    }
    return "";
  };

  const validas: LinhaValidada[] = [];
  const problemas: ProblemaLinha[] = [];
  const cpfsVistos = new Map<string, number>(); // cpf -> primeira linha

  for (const { numeroDaLinha, dados } of linhas) {
    const mensagens: string[] = [];
    const nome = pegar(dados, "nome");
    if (!nome) mensagens.push("sem nome");

    let cpf: string | null = null;
    const cpfBruto = pegar(dados, "cpf");
    if (cpfBruto) {
      cpf = apenasDigitosCpf(cpfBruto);
      if (!cpfValido(cpf)) {
        mensagens.push(`CPF "${cpfBruto}" inválido`);
        cpf = null;
      } else if (cpfsVistos.has(cpf)) {
        mensagens.push(`CPF repetido na planilha (mesmo da linha ${cpfsVistos.get(cpf)})`);
      } else {
        cpfsVistos.set(cpf, numeroDaLinha);
      }
    }

    const cnpjBruto = pegar(dados, "cnpj");
    if (cnpjBruto) {
      const cnpjLinha = apenasDigitosCnpj(cnpjBruto);
      if (!cnpjDaEmpresa) {
        mensagens.push(
          "a linha traz CNPJ, mas a empresa atual ainda não tem o número cadastrado — preencha em Marcas & CNPJs antes de importar",
        );
      } else if (cnpjLinha !== cnpjDaEmpresa) {
        mensagens.push(`a linha aponta para o CNPJ ${cnpjBruto}, mas a importação é para a empresa atual`);
      }
    }

    const setor = pegar(dados, "setor");
    const cargo = pegar(dados, "cargo");
    if (!setor) mensagens.push("sem setor");
    if (!cargo) mensagens.push("sem cargo");

    const admissao = lerData(pegar(dados, "data_admissao"));
    if ("erro" in admissao) mensagens.push(`admissão: ${admissao.erro}`);
    const nascimento = lerData(pegar(dados, "data_nascimento"));
    if ("erro" in nascimento) mensagens.push(`nascimento: ${nascimento.erro}`);

    const salario = lerValor(pegar(dados, "salario_base"));
    if ("erro" in salario) mensagens.push(`salário: ${salario.erro}`);

    const contrato = lerTipoContrato(pegar(dados, "tipo_contrato"));
    if ("erro" in contrato) mensagens.push(contrato.erro);

    if (mensagens.length > 0) {
      problemas.push({ numeroDaLinha, nome: nome || "(sem nome)", mensagens });
      continue;
    }

    validas.push({
      numeroDaLinha,
      nome,
      cpf,
      matricula: pegar(dados, "matricula") || null,
      setor,
      cargo,
      email: pegar(dados, "email") || null,
      telefone: pegar(dados, "telefone") || null,
      dataAdmissao: "iso" in admissao ? admissao.iso : null,
      dataNascimento: "iso" in nascimento ? nascimento.iso : null,
      salarioBase: "numero" in salario ? salario.numero : null,
      tipoContrato: "tipo" in contrato ? contrato.tipo : null,
    });
  }

  return { colunasReconhecidas: reconhecidas, colunasIgnoradas: ignoradas, validas, problemas, erroGeral: null };
}
