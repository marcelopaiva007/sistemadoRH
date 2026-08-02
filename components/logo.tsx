import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo oficial da L&M Telecom (arquivos originais, baixados de assinelm.com).
 *
 * - `lm-telecom-logo.png`          → versão colorida (fundo claro)
 * - `lm-telecom-logo-branca.png`   → versão de letras brancas (fundo escuro)
 * - `lm-telecom-icon.png`          → logo horizontal (usada como fallback do ícone)
 * - `lm-telecom-logo-vertical.png` → arte oficial nova (01/08/2026, direto de
 *   quem cuida da identidade visual), símbolo empilhado sobre "L&M Telecom",
 *   sem o slogan — usada em `LogoVertical` onde o recorte abaixo não se aplica.
 *
 * No dark mode a versão branca é exibida automaticamente.
 *
 * ── Recorte da faixa inferior ────────────────────────────────────────────
 * O arquivo colorido tem 1024x190, e o slogan "MAIS QUE INTERNET" está
 * pintado de BRANCO PURO nas linhas 171 a 190. Medido pixel a pixel: até a
 * linha 170 há arte colorida; da 171 em diante são ~1.000 pixels claros e 8
 * coloridos.
 *
 * Ou seja: o arquivo foi feito para fundo escuro. Sobre o nosso fundo claro
 * (#f6f8fb) o slogan dá ~1,04:1 de contraste — não é "difícil de ler", é
 * invisível, e ainda ocupa 10% da altura da logo como espaço vazio.
 *
 * Enquanto não vier um arquivo próprio para fundo claro, exibimos só a parte
 * que aparece: proporção de 1024x170 com `object-cover` ancorado no topo.
 * Nada é redesenhado — apenas deixamos de reservar espaço para o que não se
 * vê. A versão branca não precisa disso: sobre fundo escuro o slogan aparece.
 */
const LOGO_COLOR = "/lm-telecom-logo.png";
const LOGO_WHITE = "/lm-telecom-logo-branca.png";
const LOGO_VERTICAL = "/lm-telecom-logo-vertical.png";

/** 1024x190 é o arquivo; 170 é onde a arte colorida termina. */
const RECORTE_CLARO = "aspect-[1024/170] object-cover object-top";

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
        className={cn(RECORTE_CLARO, "dark:hidden", className)}
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
 * Símbolo empilhado sobre o wordmark, sem slogan — a arte oficial pra fundo
 * claro. Usada nas telas públicas centralizadas (login, esqueci a senha,
 * redefinir senha) no lugar do recorte de `Logo`.
 */
export function LogoVertical({
  className,
  width = 280,
  height = 155,
  alt = "L&M Telecom",
}: {
  className?: string;
  width?: number;
  height?: number;
  alt?: string;
}) {
  return (
    <Image
      src={LOGO_VERTICAL}
      alt={alt}
      width={width}
      height={height}
      priority
      unoptimized
      className={cn("object-contain", className)}
    />
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
