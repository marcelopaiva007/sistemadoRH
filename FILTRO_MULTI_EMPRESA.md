# Filtro Multi-Empresa: Guia de Integração

## O que foi implementado

O sistema agora tem um **filtro opcional no menu lateral** que permite:
- **Sem filtro** (padrão): Ver dados de TODAS as empresas/CNPJs que o usuário tem acesso
- **Filtro por Marca**: Automaticamente seleciona todos os CNPJs daquela marca
- **Filtro por CNPJ individual**: Checkboxes para escolher CNPJs específicos

O filtro é persistido em `sessionStorage` e pode ser acessado por qualquer componente client-side.

---

## Como Integrar em uma Tela

### Passo 1: Modificar a page.tsx para buscar de múltiplas empresas

**Antes (atual)**:
```typescript
// Busca apenas de empresaId específico
const colaboradores = await prisma.colaborador.findMany({
  where: { empresaId },
  orderBy: { nome: "asc" },
});
```

**Depois**:
```typescript
// Buscar de todas as empresas do usuário
const empresasDoUsuario = usuario.empresas.map((e) => e.empresaId);

const colaboradores = await prisma.colaborador.findMany({
  where: { empresaId: { in: empresasDoUsuario } },
  orderBy: [{ empresaId: "asc" }, { nome: "asc" }],
  include: { empresa: { select: { id: true, nome: true } } },
});
```

### Passo 2: Passar dados para o componente client-side

```typescript
<ColaboradoresTable
  colaboradores={colaboradores}
  empresasDoUsuario={empresasDoUsuario}
  // ... outros props
/>
```

### Passo 3: Usar o hook `useFiltroEmpresas` no componente

```typescript
"use client";

import { useFiltroEmpresas } from "../filtro-empresas";

export function ColaboradoresTable({
  colaboradores,
  empresasDoUsuario,
}: {
  colaboradores: Colaborador[];
  empresasDoUsuario: string[];
  // ... outros props
}) {
  // Obter IDs das empresas que o usuário selecionou no filtro
  const empresasFiltradas = useFiltroEmpresas(empresasDoUsuario);

  // Filtrar colaboradores com base na seleção do filtro
  const colaboradoresFiltrados = colaboradores.filter((c) =>
    empresasFiltradas.includes(c.empresaId)
  );

  return (
    // ... renderizar colaboradoresFiltrados
  );
}
```

---

## Exemplo Completo: Colaboradores

### page.tsx (server)
```typescript
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ColaboradoresTable } from "./colaboradores-table";

export default async function ColaboradoresPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  // Todas as empresas do usuário
  const empresasDoUsuario = usuario.empresas.map((e) => e.empresaId);

  const [colaboradores, setores, posicoes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: [{ empresaId: "asc" }, { nome: "asc" }],
      include: {
        setor: true,
        posicao: true,
        empresa: { select: { id: true, nome: true } },
      },
    }),
    prisma.setor.findMany({
      where: { empresaId: { in: empresasDoUsuario }, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.posicao.findMany({
      where: { empresaId: { in: empresasDoUsuario }, ativo: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <ColaboradoresTable
      colaboradores={colaboradores}
      empresasDoUsuario={empresasDoUsuario}
      setores={setores}
      posicoes={posicoes}
    />
  );
}
```

### colaboradores-table.tsx (client)
```typescript
"use client";

import { useFiltroEmpresas } from "../filtro-empresas";

export function ColaboradoresTable({
  colaboradores,
  empresasDoUsuario,
  setores,
  posicoes,
}: {
  colaboradores: Colaborador[];
  empresasDoUsuario: string[];
  setores: Setor[];
  posicoes: Posicao[];
}) {
  // Obter empresas selecionadas no filtro (ou todas, se nenhuma foi selecionada)
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);

  // Filtrar colaboradores
  const colaboradoresFiltrados = colaboradores.filter((c) =>
    empresasSelecionadas.includes(c.empresaId)
  );

  // Filtrar setores e posições para as empresas selecionadas
  const setoresFiltrados = setores.filter((s) =>
    empresasSelecionadas.includes(s.empresaId)
  );
  const posicoesFiltradas = posicoes.filter((p) =>
    empresasSelecionadas.includes(p.empresaId)
  );

  return (
    // ... usar colaboradoresFiltrados, setoresFiltrados, posicoesFiltradas
  );
}
```

---

## Telas que Precisam de Atualização

1. **Colaboradores** (`/rh/[empresaId]/colaboradores`)
2. **Setores** (`/rh/[empresaId]/setores`)
3. **Cargos** (`/rh/[empresaId]/posicoes`)
4. **Pesquisas/Clima** (`/rh/[empresaId]/pesquisas`)
5. **Folha de Pagamento** (`/rh/[empresaId]/folha`)
6. Qualquer outra tela que mostre dados vinculados a empresa

---

## Como Funciona o Filtro

### sessionStorage
- Chave: `rh_filtro_empresas`
- Valor: JSON array de IDs de empresas selecionadas
- Exemplo: `["cms6u3mln0003si10dsp1fey5", "cms6u3nis0005si10ktd8a3pe"]`

### Hook `useFiltroEmpresas()`
```typescript
function useFiltroEmpresas(usuarioEmpresas: string[]): string[] {
  // Retorna IDs das empresas selecionadas no filtro
  // Se nenhuma foi selecionada, retorna TODAS as empresas do usuário
}
```

### Componente `FiltroEmpresas`
```typescript
<FiltroEmpresas
  marcas={marcas}           // Lista de marcas
  empresas={empresas}       // Lista de empresas com marcaId
  usuarioEmpresas={empresasDoUsuario} // Empresas que o usuário tem acesso
/>
```

---

## Notas Importantes

1. **O filtro é persistido apenas em sessionStorage** — desaparece quando a aba é fechada
2. **O usuário vê TODAS as empresas por padrão** — o filtro é opcional
3. **A URL não muda** — continua `/rh/[empresaId]` para backward compatibility
4. **O primeiro empresaId da URL é apenas para validação** — a query busca de múltiplas empresas

---

## Próximos Passos

1. Integrar o filtro em **Colaboradores**
2. Integrar em **Setores**
3. Integrar em **Cargos**
4. Integrar em **Pesquisas/Clima**
5. Integrar em **Folha de Pagamento**

Cada tela seguirá o mesmo padrão:
- Page.tsx: busca de múltiplas empresas
- Component.tsx: usa `useFiltroEmpresas()` para filtrar
