/** @type {import("prettier").Config} */
const config = {
  semi: true,
  // Falso no config original (copiado de um template genérico, sem checar
  // este projeto) — todo o código existente usa aspas duplas. Corrigido antes
  // que o hook de pre-commit reformatasse arquivos reais na convenção errada.
  singleQuote: false,
  trailingComma: 'es5',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'avoid',
  endOfLine: 'lf',
}

export default config
