import type { CSSProperties } from 'react';

/**
 * Retema a árvore inteira do site público (inclusive componentes reaproveitados da
 * equipe, como OrderComposer/JuiceBuilder) pro roxo da marca do Rei do Suco — diferente
 * do azul do sistema de gestão da equipe, de propósito: essa subárvore só sobrescreve as
 * variáveis CSS que o token `brand` do Tailwind lê (ver tailwind.config.js), nenhum
 * componente precisa saber que está "dentro" do site público. #9D1CC4 é o roxo extraído
 * direto do arquivo de logo que o cliente mandou (ver assets/logo-rei-do-suco.png).
 */
export const publicBrandVars: CSSProperties = {
  '--brand-rgb': '157 28 196',
  '--brand-50': '#fbf0fd',
  '--brand-100': '#f2d9f7',
  '--brand-600': '#7e17a0',
  '--brand-700': '#5b0f73',
} as CSSProperties;
