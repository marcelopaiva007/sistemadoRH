import { EsqueletoPagina } from "@/components/esqueleto-pagina";

// Cobre o início, Meu Setor, Produtividade, Atualizações e Conta — e a primeira
// entrada em qualquer módulo vindo de outro. Dentro de um módulo com lateral
// própria vale o loading.tsx do módulo (RH, Processos, Delegações), que mantém
// a lateral à vista.
export default function Carregando() {
  return <EsqueletoPagina />;
}
