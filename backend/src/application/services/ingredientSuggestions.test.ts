import { describe, expect, it } from 'vitest';
import {
  extractIngredientsFromDescription,
  extractJuiceBase,
  suggestIngredientsFromMenu,
} from './ingredientSuggestions';

describe('sugestão de insumos pelo cardápio', () => {
  it('separa a receita por vírgula e "e", sem quantidade nem observação', () => {
    expect(extractIngredientsFromDescription('frango, creme de milho, queijo, catupiry, milho, ervilha e ovo')).toEqual([
      'Frango', 'Creme de milho', 'Queijo', 'Catupiry', 'Milho', 'Ervilha', 'Ovo',
    ]);
    expect(extractIngredientsFromDescription('140g salmão, cream cheese, cebolinha, molho tarê e gergelim')).toEqual([
      'Salmão', 'Cream cheese', 'Cebolinha', 'Molho tarê', 'Gergelim',
    ]);
    expect(extractIngredientsFromDescription('carne, cheddar, milho — servido no prato com talheres')).toEqual([
      'Carne', 'Cheddar', 'Milho',
    ]);
  });

  it('ignora frases compridas e descrição vazia', () => {
    expect(extractIngredientsFromDescription('banana, granola e 3 bolas de açaí em cima do pastel')).toEqual([
      'Banana', 'Granola',
    ]);
    expect(extractIngredientsFromDescription(undefined)).toEqual([]);
    // Montável ("Monte o Seu"): a descrição é instrução, não receita.
    const custom = { id: 'c', name: 'Monte o Seu Pastel', isCustom: true, description: 'Escolha o sabor-base e monte do seu jeito com os adicionais.' };
    expect(suggestIngredientsFromMenu([custom, { ...custom, id: 'd' }], { min: 1 })).toEqual([]);
  });

  it('pega a base do suco só no fim do nome', () => {
    expect(extractJuiceBase('Morango (Laranja)')).toBe('Laranja');
    expect(extractJuiceBase('Morango (Água)')).toBeNull();
    expect(extractJuiceBase('Salada de Frutas (mamão, morango, banana e laranja)')).toBeNull();
    expect(extractJuiceBase('Açaí 300ml (Puro)')).toBeNull();
    expect(extractIngredientsFromDescription('com chocolate branco')).toEqual(['Chocolate branco']);
  });

  it('agrupa: base do suco é essencial, receita é "dá pra tirar", e respeita o mínimo', () => {
    const products = [
      { id: '1', name: 'Morango (Laranja)' },
      { id: '2', name: 'Uva (Laranja)' },
      { id: '3', name: 'Uva (Água)' },
      { id: '4', name: 'Caipira', description: 'frango, milho e ovo' },
      { id: '5', name: 'Hot Dog', description: 'salsicha, milho, ervilha' },
    ];
    const s = suggestIngredientsFromMenu(products, { min: 2 });
    const laranja = s.find((x) => x.name === 'Laranja')!;
    expect(laranja.essentialProductIds).toEqual(['1', '2']);
    const milho = s.find((x) => x.name === 'Milho')!;
    expect(milho.optionalProductIds).toEqual(['4', '5']);
    expect(s.find((x) => x.name === 'Ovo')).toBeUndefined(); // só 1 produto
    expect(suggestIngredientsFromMenu(products, { min: 2, only: ['milho'] }).map((x) => x.name)).toEqual(['Milho']);
  });
});
