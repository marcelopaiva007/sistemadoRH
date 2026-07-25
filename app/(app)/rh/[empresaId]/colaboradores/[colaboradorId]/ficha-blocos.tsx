"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { atualizarFicha } from "@/lib/actions/rh-ficha";
import {
  ESCOLARIDADES,
  ESTADOS_CIVIS,
  MOTIVOS_DESLIGAMENTO,
  TIPOS_CONTA_BANCARIA,
  TIPOS_CONTRATO,
} from "@/lib/constants-dp";
import { CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";

// A ficha é dividida em blocos e cada bloco posta só os seus campos — a action
// grava apenas o que veio no FormData, então um bloco nunca apaga o outro.

type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  sexo: string | null;
  dataNascimento: Date | null;
  cidade: string | null;
  matricula: string | null;
  rg: string | null;
  rgOrgaoEmissor: string | null;
  rgUf: string | null;
  pis: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  tituloEleitor: string | null;
  estadoCivil: string | null;
  escolaridade: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  cep: string | null;
  logradouro: string | null;
  numeroEndereco: string | null;
  complemento: string | null;
  bairro: string | null;
  uf: string | null;
  emergenciaNome: string | null;
  emergenciaParentesco: string | null;
  emergenciaTelefone: string | null;
  bancoNome: string | null;
  bancoAgencia: string | null;
  bancoConta: string | null;
  bancoTipoConta: string | null;
  chavePix: string | null;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
  motivoDesligamento: string | null;
  tipoContrato: string | null;
  jornadaSemanal: number | null;
  salarioBase: number | null;
};

const SEXOS = [
  { value: "Masculino", label: "Masculino" },
  { value: "Feminino", label: "Feminino" },
  { value: "Outro", label: "Outro" },
] as const;

function Bloco({
  titulo,
  descricao,
  children,
  acao,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  acao: (prev: import("@/lib/constants").ActionResult, fd: FormData) => Promise<import("@/lib/constants").ActionResult>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        <FormularioAction action={acao} mensagemSucesso="Ficha atualizada.">
          {children}
        </FormularioAction>
      </CardContent>
    </Card>
  );
}

// Salário e dados bancários aparecem sem condicional porque a própria rota já
// é restrita: requireEmpresaAccess só deixa passar ADMIN e o RH_MANAGER da
// empresa (DIRETORIA e GESTOR_SETOR são redirecionados antes de chegar aqui).
export function FichaBlocos({
  empresaId,
  colaborador,
}: {
  empresaId: string;
  colaborador: Colaborador;
}) {
  const acao = atualizarFicha.bind(null, empresaId, colaborador.id);
  const c = colaborador;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco titulo="Identificação" acao={acao}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="nome" label="Nome completo" defaultValue={c.nome} required className="sm:col-span-2" />
          <CampoTexto name="cpf" label="CPF" defaultValue={c.cpf} placeholder="Somente números" maxLength={14} />
          <CampoTexto name="matricula" label="Matrícula" defaultValue={c.matricula} />
          <CampoData name="dataNascimento" label="Nascimento" defaultValue={c.dataNascimento} />
          <CampoSelect name="sexo" label="Sexo" opcoes={SEXOS} defaultValue={c.sexo} />
          <CampoSelect name="estadoCivil" label="Estado civil" opcoes={ESTADOS_CIVIS} defaultValue={c.estadoCivil} />
          <CampoSelect name="escolaridade" label="Escolaridade" opcoes={ESCOLARIDADES} defaultValue={c.escolaridade} />
          <CampoTexto name="email" label="E-mail" type="email" defaultValue={c.email} />
          <CampoTexto name="telefone" label="Telefone" defaultValue={c.telefone} />
          <CampoTexto name="nomeMae" label="Nome da mãe" defaultValue={c.nomeMae} />
          <CampoTexto name="nomePai" label="Nome do pai" defaultValue={c.nomePai} />
          <CampoTexto name="nacionalidade" label="Nacionalidade" defaultValue={c.nacionalidade} />
          <CampoTexto name="naturalidade" label="Naturalidade" defaultValue={c.naturalidade} />
        </div>
      </Bloco>

      <Bloco titulo="Documentos" descricao="Números dos documentos. As cópias digitalizadas ficam na aba Dossiê." acao={acao}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="rg" label="RG" defaultValue={c.rg} />
          <CampoTexto name="rgOrgaoEmissor" label="Órgão emissor" defaultValue={c.rgOrgaoEmissor} />
          <CampoTexto name="rgUf" label="UF do RG" defaultValue={c.rgUf} maxLength={2} />
          <CampoTexto name="pis" label="PIS/PASEP" defaultValue={c.pis} />
          <CampoTexto name="ctpsNumero" label="CTPS — número" defaultValue={c.ctpsNumero} />
          <CampoTexto name="ctpsSerie" label="CTPS — série" defaultValue={c.ctpsSerie} />
          <CampoTexto name="ctpsUf" label="CTPS — UF" defaultValue={c.ctpsUf} maxLength={2} />
          <CampoTexto name="tituloEleitor" label="Título de eleitor" defaultValue={c.tituloEleitor} />
        </div>
      </Bloco>

      <Bloco titulo="Endereço" acao={acao}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="cep" label="CEP" defaultValue={c.cep} maxLength={9} />
          <CampoTexto name="logradouro" label="Logradouro" defaultValue={c.logradouro} />
          <CampoTexto name="numeroEndereco" label="Número" defaultValue={c.numeroEndereco} />
          <CampoTexto name="complemento" label="Complemento" defaultValue={c.complemento} />
          <CampoTexto name="bairro" label="Bairro" defaultValue={c.bairro} />
          <CampoTexto name="cidade" label="Cidade" defaultValue={c.cidade} />
          <CampoTexto name="uf" label="UF" defaultValue={c.uf} maxLength={2} />
        </div>
      </Bloco>

      <Bloco
        titulo="Contato de emergência"
        descricao="Quem o RH aciona se algo acontecer com o colaborador em campo."
        acao={acao}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="emergenciaNome" label="Nome" defaultValue={c.emergenciaNome} className="sm:col-span-2" />
          <CampoTexto name="emergenciaParentesco" label="Parentesco" defaultValue={c.emergenciaParentesco} />
          <CampoTexto name="emergenciaTelefone" label="Telefone" defaultValue={c.emergenciaTelefone} />
        </div>
      </Bloco>

      <Bloco
        titulo="Vínculo"
        descricao="A data de admissão é o que abre o controle de férias — sem ela, o colaborador não entra na programação."
        acao={acao}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoData name="dataAdmissao" label="Admissão" defaultValue={c.dataAdmissao} />
          <CampoSelect name="tipoContrato" label="Tipo de contrato" opcoes={TIPOS_CONTRATO} defaultValue={c.tipoContrato} />
          <CampoTexto
            name="jornadaSemanal"
            label="Jornada semanal (horas)"
            type="number"
            min={1}
            max={60}
            defaultValue={c.jornadaSemanal?.toString() ?? ""}
          />
          <CampoTexto
            name="salarioBase"
            label="Salário base (R$)"
            defaultValue={c.salarioBase?.toString().replace(".", ",") ?? ""}
            placeholder="Ex: 2500,00"
          />
          <CampoData name="dataDesligamento" label="Desligamento" defaultValue={c.dataDesligamento} />
          <CampoSelect
            name="motivoDesligamento"
            label="Motivo do desligamento"
            opcoes={MOTIVOS_DESLIGAMENTO}
            defaultValue={c.motivoDesligamento}
          />
        </div>
      </Bloco>

      <Bloco
        titulo="Dados bancários"
        descricao="Usados para pagamento. A trilha de auditoria registra a alteração, nunca o valor."
        acao={acao}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="bancoNome" label="Banco" defaultValue={c.bancoNome} />
          <CampoSelect
            name="bancoTipoConta"
            label="Tipo de conta"
            opcoes={TIPOS_CONTA_BANCARIA}
            defaultValue={c.bancoTipoConta}
          />
          <CampoTexto name="bancoAgencia" label="Agência" defaultValue={c.bancoAgencia} />
          <CampoTexto name="bancoConta" label="Conta" defaultValue={c.bancoConta} />
          <CampoTexto name="chavePix" label="Chave PIX" defaultValue={c.chavePix} className="sm:col-span-2" />
        </div>
      </Bloco>
    </div>
  );
}
