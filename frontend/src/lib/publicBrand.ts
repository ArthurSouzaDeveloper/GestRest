import type { CSSProperties } from 'react';

/** Cor usada enquanto o restaurante ainda não configurou a própria (ou pra tenants
 * antigos sem brandColor salvo) — o roxo do Rei do Suco, extraído do arquivo de logo
 * que o cliente mandou (ver assets/logo-rei-do-suco.png). */
export const DEFAULT_BRAND_COLOR = '#9D1CC4';

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Mistura `c1` com `c2` na proporção `t` (0 = c1 puro, 1 = c2 puro). */
function mix(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

/**
 * Retema a árvore inteira do site público (inclusive componentes reaproveitados da
 * equipe, como OrderComposer/JuiceBuilder) pra cor que o restaurante escolher — cada
 * tenant só precisa configurar UMA cor (Restaurant.brandColor, ver tela de Identidade
 * Visual); os tons claros/escuros usados em fundo de painel, gradiente de botão etc. são
 * derivados matematicamente daqui, ninguém precisa escolher 5 tons à mão. Só sobrescreve
 * as variáveis CSS que o token `brand` do Tailwind lê (ver tailwind.config.js) — nenhum
 * componente precisa saber que está "dentro" do site público.
 */
export function deriveBrandVars(hex: string | null | undefined): CSSProperties {
  const rgb = hexToRgb(hex ?? '') ?? hexToRgb(DEFAULT_BRAND_COLOR)!;
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  return {
    '--brand-rgb': rgb.join(' '),
    '--brand-50': rgbToHex(mix(rgb, white, 0.94)),
    '--brand-100': rgbToHex(mix(rgb, white, 0.85)),
    '--brand-600': rgbToHex(mix(rgb, black, 0.2)),
    '--brand-700': rgbToHex(mix(rgb, black, 0.42)),
  } as CSSProperties;
}
