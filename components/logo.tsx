import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo oficial da L&M Telecom (arquivos originais, baixados de assinelm.com).
 *
 * - `lm-telecom-logo.png`        → versão colorida (fundo claro)
 * - `lm-telecom-logo-branca.png` → versão de letras brancas (fundo escuro)
 * - `lm-telecom-icon.png`        → logo horizontal (usada como fallback do ícone)
 *
 * No dark mode a versão branca é exibida automaticamente.
 */
const LOGO_COLOR = "/lm-telecom-logo.png";
const LOGO_WHITE = "/lm-telecom-logo-branca.png";

/** Logo horizontal completa (símbolo + wordmark), do arquivo original. */
export function Logo({
  className,
  width = 180,
  height = 48,
  alt = "L&M Telecom",
}: {
  className?: string;
  width?: number;
  height?: number;
  alt?: string;
}) {
  return (
    <>
      <Image
        src={LOGO_COLOR}
        alt={alt}
        width={width}
        height={height}
        priority
        unoptimized
        className={cn("object-contain dark:hidden", className)}
      />
      <Image
        src={LOGO_WHITE}
        alt={alt}
        width={width}
        height={height}
        priority
        unoptimized
        aria-hidden
        className={cn("hidden object-contain dark:block", className)}
      />
    </>
  );
}

/**
 * Símbolo/ícone da marca. Como não há um arquivo isolado só do símbolo,
 * reaproveita a logo horizontal recortada pela metade esquerda via CSS,
 * mantendo a arte original sem redesenhar.
 */
export function LogoMark({
  className,
  size = 40,
  alt = "L&M Telecom",
}: {
  className?: string;
  size?: number;
  alt?: string;
}) {
  return (
    <Image
      src={LOGO_COLOR}
      alt={alt}
      width={size}
      height={size}
      priority
      unoptimized
      className={cn("object-contain", className)}
    />
  );
}
