# Filtro multi-empresa (marca / CNPJ)

Guia curto de como uma tela decide **quais CNPJs mostra**. É a classe de
defeito que não dá erro na tela — mostra um número plausível e errado (ver o
incidente da v1.105.0 no `AGENTS.md`). Mudança aqui vai por PR.

> Versão anterior deste arquivo descrevia um filtro em `sessionStorage` e
> ensinava `where: { empresaId: { in: usuario.empresas } }`. As duas coisas
> estão erradas hoje: o filtro mora na URL, e o pivô `UserEmpresa` é **vazio
> por desenho** para ADMIN e DIRETORIA e não inclui quem tem acesso por marca.
> Nunca monte escopo a partir de `usuario.empresas`.

## As três peças

1. **Quem o usuário enxerga** — `empresasVisiveis(user)` em
   `lib/rh-auth-guard.ts`. Já resolve tudo:
   - recorta pelo **grupo** do usuário (`lib/grupo.ts`): CNPJ de outro grupo é
     inalcançável para todo mundo, ADMIN inclusive;
   - ADMIN/DIRETORIA veem o grupo inteiro, ou só as marcas em que o admin os
     prendeu (`marcasMarcadasNoGrupo`);
   - demais papéis: vínculos ativos em `UserEmpresa` **+** CNPJs das marcas em
     `UserMarca` (lido do banco a cada requisição, não do JWT).
   - Memorizada por requisição (`cache` do React).

2. **O que a tela pediu** — querystring `?empresas=id1,id2` (vírgula literal).
   Quem escreve é o seletor da barra de topo
   (`components/seletor-marca-empresa.tsx`), que usa `urlDoFiltro` /
   `trocarEmpresaNoCaminho` de `app/(app)/rh/[empresaId]/filtro-empresas.tsx`.
   Sem `?empresas=` = visão consolidada (tudo que o usuário enxerga).
   O `<empresaId>` do caminho **segue a seleção**: é o CNPJ em que os
   formulários de criação gravam. A regra é testada em
   `scripts/test-troca-empresa-caminho.ts`.

3. **O escopo final** — `escopoDeEmpresas(user, empresasParam)`: a
   **interseção** entre o pedido e o visível. Um id digitado à mão na URL não
   vira acesso.

## Tela de servidor (página)

```ts
// app/(app)/rh/[empresaId]/aso/page.tsx
const { empresaId } = await params;
const { empresas: empresasParam } = await searchParams;
const usuario = await requireEmpresaAccess(empresaId); // guarda da tela

const escopo = await escopoDeEmpresas(usuario, empresasParam);
const colaboradores = await prisma.colaborador.findMany({
  where: { empresaId: { in: escopo }, ativo: true, empresa: { ativo: true } },
  // ...
});
```

`requireEmpresaAccess` redireciona: GESTOR_SETOR vai para `/rh/meu-setor`,
quem não alcança o CNPJ vai para `/rh`.

## Rota de API

`redirect()` não serve em handler de API. Use `podeOperarEmpresaRH` (mesma
pergunta de `requireEmpresaAccess`, responde booleano) e devolva 403:

```ts
// app/api/rh/[empresaId]/indicadores/csv/route.ts
const empresasParam = new URL(req.url).searchParams.get("empresas") ?? undefined;
if (!(await podeOperarEmpresaRH(user, empresaId))) {
  return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
}
const empresaIds = await escopoDeEmpresas(user, empresasParam);
```

Exportação (CSV/PDF) segue o **mesmo** `?empresas=` da tela que a gerou; para
o título use `rotuloDoEscopo(empresaIds)` de `lib/escopo-marca.ts`.

Não use `usuarioAlcancaEmpresa` direto em rota nova: ele deixa passar o
GESTOR_SETOR e não confere o módulo `rh` do perfil.

## Telas escopadas pela marca do caminho

Algumas telas (Colaboradores, ficha do colaborador, Auditoria) têm como padrão
a **marca** do CNPJ do caminho, não o grupo. Use `empresasDaMesmaMarca` de
`lib/escopo-marca.ts` e **intersecte com o visível** — a marca sozinha não é
fronteira de acesso:

```ts
// app/api/rh/[empresaId]/disciplinar/[ocorrenciaId]/documento/route.ts
const visiveis = await empresasVisiveis(user);
const idsDaMarca = (await empresasDaMesmaMarca(empresaId)).filter((id) => visiveis.includes(id));
```

Para modelo que já tem `marcaId` (ex.: `Pesquisa`), filtre direto por
`marcaDaEmpresa(empresaId)`.

## Componente de cliente

Quando a página manda a lista inteira e a filtragem é no navegador, use
`useFiltroEmpresas(empresasVisiveisDoUsuario)` de `filtro-empresas.tsx` — já
faz a mesma interseção com `?empresas=`. A lista passada tem de vir de
`empresasVisiveis` no servidor, nunca de `usuario.empresas`.

## Checklist de tela nova

- [ ] Guarda: `requireEmpresaAccess` (página) ou `podeOperarEmpresaRH` (API).
- [ ] Escopo: `escopoDeEmpresas` — nada de `.split(",")` do `?empresas=` à mão.
- [ ] Escrita usa o `<empresaId>` do caminho, já validado pela guarda.
- [ ] Exportação carrega o `?empresas=` da tela.
