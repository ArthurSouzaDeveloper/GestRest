import type { CSSProperties } from 'react';

/**
 * Retema a árvore inteira do site público (inclusive componentes reaproveitados da
 * equipe, como OrderComposer/JuiceBuilder) pra roxo, só sobrescrevendo as variáveis CSS
 * que o token `brand` do Tailwind lê (ver tailwind.config.js) — nenhum componente
 * precisa saber que está "dentro" do site público.
 */
export const publicBrandVars: CSSProperties = {
  '--brand-rgb': '109 46 158',
  '--brand-50': '#F3E8FB',
  '--brand-100': '#E5CFF2',
  '--brand-600': '#4A1D72',
  '--brand-700': '#351C4D',
} as CSSProperties;
