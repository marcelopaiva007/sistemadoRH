import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;

/**
 * Mesmo formato que lib/constants-disciplinar.ts::STATUS_ASSINATURA_DISCIPLINAR
 * já usava — generaliza o único caso que nasceu centralizado em vez de inventar
 * um formato novo. Cada domínio (férias, solicitação, situação de conformidade
 * etc.) exporta um mapa deste tipo ao lado do label que já tinha.
 */
export type StatusBadgeMap<T extends string> = Record<
  T,
  { label: string; variant: BadgeVariant }
>;

/**
 * Substitui as funções locais (VARIANTE, VARIANTE_PERIODO, VariantePorStatus,
 * varianteStatus ×2) que reimplementavam a mesma tradução "status → variant do
 * Badge" com nomes diferentes por arquivo.
 *
 * `status` aceita as chaves de T e também `string` solto: os campos de status
 * que chegam do Prisma são `String`, não union literal (mesma razão de não
 * existir enum nativo — ver prisma/schema.prisma). O `T |` na frente preserva
 * o autocomplete e pega erro de digitação em quem passa literal.
 *
 * `children` é o sufixo opcional depois do rótulo (ex.: "· 12 d" nos cartões de
 * férias e conformidade), o único motivo pelo qual aqueles dois pontos não
 * conseguiam usar este componente.
 */
export function StatusBadge<T extends string>({
  status,
  map,
  children,
}: {
  status: T | (string & {});
  map: StatusBadgeMap<T>;
  children?: React.ReactNode;
}) {
  const item = (
    map as Record<string, { label: string; variant: BadgeVariant }>
  )[status];
  return (
    <Badge variant={item?.variant ?? "outline"}>
      {/* "—" para status vazio, igual ao helper `rotulo()` de lib/constants-dp.ts. */}
      {item?.label ?? (status || "—")}
      {children}
    </Badge>
  );
}
