// Gera o HTML do documento formal de uma medida disciplinar / notificação —
// a folha que o RH imprime, colhe assinatura do colaborador e arquiva no
// dossiê. É o que faltava no módulo: a tela registrava a ocorrência e o
// status da assinatura, mas nunca produzia o papel a ser assinado.
//
// Mesmo padrão dos relatórios (lib/indicadores-relatorio.ts): HTML puro
// server-side, entregue ao navegador por lib/pdf-browser.ts. Sem Chromium,
// sem biblioteca de PDF.
import { formatarCnpj } from "@/lib/cnpj";
import { formatarCpf } from "@/lib/cpf";
import {
  TIPOS_OCORRENCIA_DISCIPLINAR,
  type TipoOcorrenciaDisciplinar,
} from "@/lib/constants-disciplinar";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dataExtenso(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type DadosDocumentoDisciplinar = {
  ocorrencia: {
    tipo: string;
    motivo: string;
    detalhes: string | null;
    dataFato: Date;
    diasSuspensao: number | null;
    valorDesconto: number | null;
    statusAssinatura: string;
    dataAssinatura: Date | null;
    emitidoPorNome: string | null;
    testemunha1Nome: string | null;
    testemunha1Cpf: string | null;
    testemunha2Nome: string | null;
    testemunha2Cpf: string | null;
    createdAt: Date;
  };
  colaborador: {
    nome: string;
    cpf: string | null;
    matricula: string | null;
    cargo: string | null;
    setor: string | null;
    dataAdmissao: Date | null;
  };
  empresa: {
    nome: string;
    razaoSocial: string | null;
    cnpj: string | null;
    cidade: string | null;
    uf: string | null;
  };
};

/**
 * Título, texto de abertura e fundamento legal de cada tipo.
 *
 * O texto é o corpo jurídico do documento — o motivo e o detalhamento
 * digitados pelo RH entram depois, em bloco próprio, para que a folha nunca
 * dependa de o RH ter escrito um texto formal na caixa de motivo.
 */
function conteudoPorTipo(dados: DadosDocumentoDisciplinar): {
  titulo: string;
  corpo: string;
  fundamento: string;
  cienciaColaborador: string;
} {
  const { ocorrencia, colaborador } = dados;
  const nome = esc(colaborador.nome);
  const dataFato = dataExtenso(ocorrencia.dataFato);

  switch (ocorrencia.tipo as TipoOcorrenciaDisciplinar) {
    case "ADVERTENCIA_VERBAL":
      return {
        titulo: "REGISTRO DE ADVERTÊNCIA VERBAL",
        corpo: `Registramos que, nesta data, o(a) colaborador(a) <strong>${nome}</strong> recebeu
          <strong>ADVERTÊNCIA VERBAL</strong> em razão do fato ocorrido em <strong>${dataFato}</strong>,
          descrito abaixo. Esta orientação tem caráter pedagógico e visa corrigir a conduta,
          ficando o(a) colaborador(a) ciente de que a reincidência poderá ensejar a aplicação de
          penalidade mais severa, observada a gradação das penas.`,
        fundamento:
          "Poder disciplinar do empregador — arts. 2º e 482 da CLT. Aplicação gradativa das penas.",
        cienciaColaborador:
          "Declaro que fui cientificado(a) da advertência verbal acima e das razões que a motivaram.",
      };

    case "ADVERTENCIA_ESCRITA":
      return {
        titulo: "ADVERTÊNCIA ESCRITA",
        corpo: `Vimos, pela presente, aplicar ao(à) colaborador(a) <strong>${nome}</strong>
          <strong>ADVERTÊNCIA ESCRITA</strong>, em razão do fato ocorrido em
          <strong>${dataFato}</strong>, conforme descrito abaixo. Solicitamos que a conduta seja
          imediatamente corrigida, ficando o(a) colaborador(a) ciente de que a reincidência ou a
          prática de nova falta poderá ensejar suspensão disciplinar ou, conforme a gravidade,
          rescisão do contrato de trabalho por justa causa.`,
        fundamento:
          "Poder disciplinar do empregador — arts. 2º e 482 da CLT. Aplicação gradativa das penas.",
        cienciaColaborador:
          "Declaro que recebi a presente advertência, tomei ciência de seu inteiro teor e das razões que a motivaram.",
      };

    case "SUSPENSAO": {
      const dias = ocorrencia.diasSuspensao ?? 1;
      return {
        titulo: "COMUNICADO DE SUSPENSÃO DISCIPLINAR",
        corpo: `Comunicamos ao(à) colaborador(a) <strong>${nome}</strong> a aplicação de
          <strong>SUSPENSÃO DISCIPLINAR de ${dias} dia(s)</strong>,
          em razão do fato ocorrido em <strong>${dataFato}</strong>, descrito abaixo.
          Durante o período de suspensão ficam suspensas as obrigações recíprocas do contrato de
          trabalho, não havendo prestação de serviços nem pagamento de salário quanto aos dias
          suspensos, que serão descontados em folha. A suspensão não excede 30 (trinta) dias
          consecutivos, sob pena de configurar rescisão injusta do contrato.`,
        fundamento:
          "Art. 474 da CLT — a suspensão do empregado por mais de 30 dias consecutivos importa na rescisão injusta do contrato de trabalho. Arts. 2º e 482 da CLT.",
        cienciaColaborador:
          "Declaro que recebi o presente comunicado de suspensão, tomei ciência do período aplicado e das razões que o motivaram.",
      };
    }

    case "JUSTA_CAUSA":
      return {
        titulo: "COMUNICADO DE DISPENSA POR JUSTA CAUSA",
        corpo: `Comunicamos ao(à) colaborador(a) <strong>${nome}</strong> a
          <strong>RESCISÃO DO CONTRATO DE TRABALHO POR JUSTA CAUSA</strong>, em razão da falta
          grave ocorrida em <strong>${dataFato}</strong>, descrita abaixo. A rescisão produz
          efeitos a partir desta data, ficando o(a) colaborador(a) convocado(a) a comparecer ao
          setor de Recursos Humanos para os acertos rescisórios devidos e a devolução de bens,
          crachá, uniformes e equipamentos de propriedade da empresa que estejam em seu poder.`,
        fundamento:
          "Art. 482 da CLT — rescisão do contrato de trabalho por justa causa.",
        cienciaColaborador:
          "Declaro que recebi o presente comunicado e tomei ciência de seu inteiro teor.",
      };

    case "ABANDONO_EMPREGO":
      return {
        titulo: "NOTIFICAÇÃO DE ABANDONO DE EMPREGO",
        corpo: `Notificamos o(a) colaborador(a) <strong>${nome}</strong> de que se encontra
          ausente do trabalho, sem justificativa apresentada a esta empresa, desde
          <strong>${dataFato}</strong>. Fica o(a) colaborador(a) <strong>CONVOCADO(A) a
          comparecer ao setor de Recursos Humanos no prazo de 48 (quarenta e oito) horas</strong>,
          contadas do recebimento desta, para justificar as ausências e reassumir suas funções.
          O não comparecimento no prazo assinalado caracterizará <strong>ABANDONO DE
          EMPREGO</strong>, ensejando a rescisão do contrato de trabalho por justa causa.`,
        fundamento:
          "Art. 482, alínea “i”, da CLT — abandono de emprego. Súmula 32 do TST.",
        cienciaColaborador:
          "Declaro que recebi a presente notificação e tomei ciência do prazo para comparecimento.",
      };

    case "USO_INDEVIDO_EPI":
      return {
        titulo: "TERMO DE NOTIFICAÇÃO — RECUSA OU MAU USO DE EPI",
        corpo: `Registramos que, em <strong>${dataFato}</strong>, o(a) colaborador(a)
          <strong>${nome}</strong> deixou de utilizar corretamente, ou recusou-se a utilizar, o
          Equipamento de Proteção Individual fornecido gratuitamente por esta empresa, conforme
          descrito abaixo. Reiteramos que o uso do EPI é <strong>obrigatório</strong> e que sua
          recusa injustificada constitui <strong>ato faltoso</strong>, sujeitando o(a)
          colaborador(a) às penalidades cabíveis, inclusive rescisão por justa causa.`,
        fundamento:
          "Art. 158, parágrafo único, alínea “b”, da CLT — constitui ato faltoso a recusa injustificada ao uso dos equipamentos de proteção individual fornecidos pela empresa. NR-06 do MTE.",
        cienciaColaborador:
          "Declaro que recebi o presente termo, que o EPI me foi fornecido gratuitamente e que fui orientado(a) quanto à obrigatoriedade de seu uso.",
      };

    case "DANO_PATRIMONIAL": {
      const valor = ocorrencia.valorDesconto;
      return {
        titulo: "TERMO DE RESPONSABILIDADE POR DANO AO PATRIMÔNIO",
        corpo: `Registramos que, em <strong>${dataFato}</strong>, o(a) colaborador(a)
          <strong>${nome}</strong> deu causa a dano ao patrimônio desta empresa, conforme
          descrito abaixo${
            valor != null
              ? `, apurado no valor de <strong>${esc(reais(valor))}</strong>`
              : ""
          }. O desconto do valor apurado em folha de pagamento fica condicionado à concordância
          expressa do(a) colaborador(a), manifestada pela assinatura deste termo, ou à
          comprovação de dolo, nos termos da lei.`,
        fundamento:
          "Art. 462, § 1º, da CLT — o desconto por dano causado pelo empregado é lícito desde que essa possibilidade tenha sido acordada ou na ocorrência de dolo.",
        cienciaColaborador:
          "Declaro que tomei ciência do dano apurado e do valor correspondente, concordando com o desconto na forma acima.",
      };
    }

    case "RECUSA_EXAME":
      return {
        titulo: "TERMO DE RECUSA A EXAME MÉDICO OCUPACIONAL",
        corpo: `Registramos que, em <strong>${dataFato}</strong>, o(a) colaborador(a)
          <strong>${nome}</strong> recusou-se a submeter-se ao exame médico ocupacional
          determinado por esta empresa, conforme descrito abaixo. Esclarecemos que o exame é
          <strong>obrigatório e custeado integralmente pelo empregador</strong>, integrando o
          Programa de Controle Médico de Saúde Ocupacional (PCMSO), e que a recusa injustificada
          constitui <strong>ato faltoso</strong>, sujeitando o(a) colaborador(a) às penalidades
          cabíveis.`,
        fundamento:
          "Art. 158, parágrafo único, alínea “a”, e art. 168 da CLT — obrigatoriedade do exame médico ocupacional. NR-07 (PCMSO).",
        cienciaColaborador:
          "Declaro que recebi o presente termo e fui cientificado(a) da obrigatoriedade do exame médico ocupacional.",
      };

    default:
      return {
        titulo: "NOTIFICAÇÃO DISCIPLINAR",
        corpo: `Notificamos o(a) colaborador(a) <strong>${nome}</strong> a respeito do fato
          ocorrido em <strong>${dataFato}</strong>, descrito abaixo.`,
        fundamento: "Poder disciplinar do empregador — arts. 2º e 482 da CLT.",
        cienciaColaborador:
          "Declaro que recebi a presente notificação e tomei ciência de seu inteiro teor.",
      };
  }
}

function linhaIdentificacao(rotulo: string, valor: string | null): string {
  return `<tr>
    <td style="width:34%;color:#4b5563;padding:4px 0">${esc(rotulo)}</td>
    <td style="padding:4px 0"><strong>${esc(valor && valor.trim() ? valor : "—")}</strong></td>
  </tr>`;
}

function blocoAssinatura(rotulo: string, complemento?: string): string {
  return `<div style="margin-top:38px">
    <div style="border-top:1px solid #111827;width:78%"></div>
    <div style="font-size:11px;margin-top:4px"><strong>${esc(rotulo)}</strong></div>
    ${complemento ? `<div style="font-size:10px;color:#4b5563">${esc(complemento)}</div>` : ""}
  </div>`;
}

/** O nome do documento na aba do navegador e no arquivo salvo. */
export function tituloDocumentoDisciplinar(dados: DadosDocumentoDisciplinar): string {
  const meta = TIPOS_OCORRENCIA_DISCIPLINAR.find((t) => t.value === dados.ocorrencia.tipo);
  return `${meta?.label ?? "Medida Disciplinar"} — ${dados.colaborador.nome}`;
}

export function gerarHtmlDocumentoDisciplinar(dados: DadosDocumentoDisciplinar): string {
  const { ocorrencia, colaborador, empresa } = dados;
  const { titulo, corpo, fundamento, cienciaColaborador } = conteudoPorTipo(dados);

  const recusou = ocorrencia.statusAssinatura === "RECUSADO_COM_TESTEMUNHAS";
  const razao = empresa.razaoSocial ?? empresa.nome;
  const cidadeUf = [empresa.cidade, empresa.uf].filter(Boolean).join("/");
  const localData = `${cidadeUf || "____________________"}, ${dataExtenso(ocorrencia.createdAt)}.`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(tituloDocumentoDisciplinar(dados))}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12.5px; line-height: 1.55; margin: 0; }
  .folha { max-width: 720px; margin: 0 auto; }
  .cabecalho { border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 18px; }
  .cabecalho .razao { font-size: 14px; font-weight: 700; }
  .cabecalho .dados { font-size: 10.5px; color: #4b5563; }
  h1 { font-size: 15px; text-align: center; letter-spacing: 0.5px; margin: 18px 0 16px; }
  .identificacao { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; font-size: 11.5px; }
  .identificacao table { width: 100%; border-collapse: collapse; }
  .secao { margin-top: 18px; }
  .secao .rotulo { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #6b7280; font-weight: 700; margin-bottom: 4px; }
  .caixa { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap; }
  .fundamento { margin-top: 16px; font-size: 10.5px; color: #4b5563; border-left: 3px solid #d1d5db; padding-left: 10px; }
  .ciencia { margin-top: 22px; font-size: 11.5px; }
  .assinaturas { margin-top: 10px; }
  .duas { display: flex; gap: 28px; }
  .duas > div { flex: 1; }
  .recusa { margin-top: 22px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 6px; padding: 10px 12px; font-size: 11.5px; color: #7f1d1d; }
  .rodape { margin-top: 26px; font-size: 9.5px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 6px; }
</style>
</head>
<body>
<div class="folha">

  <div class="cabecalho">
    <div class="razao">${esc(razao)}</div>
    <div class="dados">
      ${empresa.cnpj ? `CNPJ ${esc(formatarCnpj(empresa.cnpj))}` : "CNPJ não informado"}
      ${cidadeUf ? ` — ${esc(cidadeUf)}` : ""}
    </div>
  </div>

  <h1>${esc(titulo)}</h1>

  <div class="identificacao">
    <table>
      ${linhaIdentificacao("Colaborador(a)", colaborador.nome)}
      ${linhaIdentificacao("CPF", colaborador.cpf ? formatarCpf(colaborador.cpf) : null)}
      ${linhaIdentificacao("Matrícula", colaborador.matricula)}
      ${linhaIdentificacao("Cargo", colaborador.cargo)}
      ${linhaIdentificacao("Setor", colaborador.setor)}
      ${linhaIdentificacao(
        "Data de admissão",
        colaborador.dataAdmissao ? dataExtenso(colaborador.dataAdmissao) : null,
      )}
      ${linhaIdentificacao("Data do fato", dataExtenso(ocorrencia.dataFato))}
      ${
        ocorrencia.diasSuspensao != null
          ? linhaIdentificacao("Dias de suspensão", `${ocorrencia.diasSuspensao} dia(s)`)
          : ""
      }
      ${
        ocorrencia.valorDesconto != null
          ? linhaIdentificacao("Valor apurado", reais(ocorrencia.valorDesconto))
          : ""
      }
    </table>
  </div>

  <div class="secao">
    <p>${corpo}</p>
  </div>

  <div class="secao">
    <div class="rotulo">Motivo</div>
    <div class="caixa">${esc(ocorrencia.motivo)}</div>
  </div>

  ${
    ocorrencia.detalhes && ocorrencia.detalhes.trim()
      ? `<div class="secao">
           <div class="rotulo">Descrição das circunstâncias</div>
           <div class="caixa">${esc(ocorrencia.detalhes)}</div>
         </div>`
      : ""
  }

  <div class="fundamento"><strong>Fundamento legal:</strong> ${esc(fundamento)}</div>

  <div class="ciencia">
    <p>${esc(cienciaColaborador)}</p>
    <p style="margin-top:18px">${esc(localData)}</p>
  </div>

  <div class="assinaturas">
    <div class="duas">
      <div>
        ${blocoAssinatura(
          colaborador.nome,
          colaborador.cpf ? `CPF ${formatarCpf(colaborador.cpf)} — Colaborador(a)` : "Colaborador(a)",
        )}
      </div>
      <div>
        ${blocoAssinatura(
          ocorrencia.emitidoPorNome ?? razao,
          "Pela empresa — Recursos Humanos / Gestor responsável",
        )}
      </div>
    </div>

    ${
      recusou
        ? `<div class="recusa">
             <strong>CERTIDÃO DE RECUSA DE ASSINATURA.</strong> Certificamos que o(a)
             colaborador(a) acima identificado(a) tomou ciência do inteiro teor deste documento e
             <strong>recusou-se a assiná-lo</strong>${
               ocorrencia.dataAssinatura
                 ? ` em ${esc(dataExtenso(ocorrencia.dataAssinatura))}`
                 : ""
             }, na presença das duas testemunhas abaixo, que assinam em seu lugar para todos os
             fins de direito.
           </div>`
        : `<div class="recusa" style="border-color:#e5e7eb;background:#f9fafb;color:#4b5563">
             <strong>Em caso de recusa de assinatura:</strong> a leitura do documento na presença de
             duas testemunhas, que o assinam abaixo, supre a assinatura do(a) colaborador(a) e
             valida a medida aplicada.
           </div>`
    }

    <div class="duas">
      <div>
        ${blocoAssinatura(
          ocorrencia.testemunha1Nome ?? "Testemunha 1",
          ocorrencia.testemunha1Cpf
            ? `CPF ${formatarCpf(ocorrencia.testemunha1Cpf)}`
            : "CPF: ______________________",
        )}
      </div>
      <div>
        ${blocoAssinatura(
          ocorrencia.testemunha2Nome ?? "Testemunha 2",
          ocorrencia.testemunha2Cpf
            ? `CPF ${formatarCpf(ocorrencia.testemunha2Cpf)}`
            : "CPF: ______________________",
        )}
      </div>
    </div>
  </div>

  <div class="rodape">
    Documento emitido pelo Sistema de RH em ${esc(dataExtenso(ocorrencia.createdAt))}
    ${ocorrencia.emitidoPorNome ? ` por ${esc(ocorrencia.emitidoPorNome)}` : ""}.
    Via do colaborador e via da empresa — arquivar no dossiê funcional.
  </div>

</div>
</body>
</html>`;
}
