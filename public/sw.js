// Service worker do portal — o mínimo para o celular oferecer "instalar".
//
// ELE NÃO GUARDA NADA EM CACHE, E ISSO É A DECISÃO PRINCIPAL DESTE ARQUIVO.
//
// O Android só oferece instalar um site que tenha service worker com tratador
// de `fetch`. É a única razão de este arquivo existir. A tentação seguinte
// seria "já que tem, vamos cachear para funcionar offline" — e aqui isso seria
// perigoso, não útil:
//
//   - O portal existe para BATER PONTO. Uma tela de ponto servida do cache
//     mostraria a batida de ontem, ou aceitaria um registro que nunca chegou
//     ao servidor. O colaborador iria embora achando que bateu.
//   - Holerite e documentos são dados pessoais. Cache é arquivo no disco do
//     aparelho, que pode ser compartilhado ou perdido.
//   - Sessão do portal dura 12 horas (lib/portal-auth.ts). HTML cacheado
//     sobrevive à sessão e mostraria dado de quem já saiu.
//
// Então: tudo passa direto para a rede, sempre. Sem rede, o navegador mostra o
// erro dele — que é a verdade ("você está sem internet"), e não uma tela antiga
// fingindo estar no ar.
//
// Se um dia offline for pedido de verdade, o caminho é cachear SÓ os arquivos
// estáticos (ícone, fonte, CSS) e nunca resposta de navegação nem de API — e
// isso é decisão própria, com teste próprio.

// Assume o controle assim que instala, sem esperar as abas antigas fecharem.
// Importante justamente por ser um arquivo que pode precisar ser corrigido às
// pressas: sem isto, um service worker ruim ficaria semanas no aparelho.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

// Tratador obrigatório para a instalação ser oferecida. Sem `respondWith`, o
// navegador segue o caminho normal de rede — que é exatamente o que queremos.
self.addEventListener("fetch", () => {});
