/** Observações rápidas — botões prontos para os pedidos mais comuns, evitando digitação do garçom. */
export const DRINK_NOTE_PRESETS = ['Sem açúcar', 'Muito gelo', 'Pouco gelo', 'Sem gelo'];
export const FOOD_NOTE_PRESETS = [
  'Sem cebola',
  'Sem tomate',
  'Bem passado',
  'Ao ponto',
  'Borda recheada',
  'Bem crocante',
  'Extra queijo',
  'Sem pimenta',
];

/** Adiciona (ou remove, se já presente) um preset ao texto livre de observações, separando por vírgula. */
export function toggleNotePreset(notes: string, preset: string): string {
  const parts = notes
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const idx = parts.findIndex((p) => p.toLowerCase() === preset.toLowerCase());
  if (idx >= 0) {
    parts.splice(idx, 1);
  } else {
    parts.push(preset);
  }
  return parts.join(', ');
}
