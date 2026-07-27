import type { CSSProperties } from 'react';

/**
 * Retema a árvore inteira do site público (inclusive componentes reaproveitados da
 * equipe, como OrderComposer/JuiceBuilder) pro mesmo azul do sistema principal — só
 * sobrescrevendo as variáveis CSS que o token `brand` do Tailwind lê (ver
 * tailwind.config.js) — nenhum componente precisa saber que está "dentro" do site
 * público. Valores idênticos aos --brand-* de index.css, só copiados aqui porque essa
 * subárvore precisa poder retemar independente do resto do app (multi-tenant, futuro).
 */
export const publicBrandVars: CSSProperties = {
  '--brand-rgb': '30 58 138',
  '--brand-50': '#eff4ff',
  '--brand-100': '#dbe6fe',
  '--brand-600': '#1b3478',
  '--brand-700': '#172c66',
} as CSSProperties;
