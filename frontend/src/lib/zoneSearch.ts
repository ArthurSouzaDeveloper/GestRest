/**
 * Busca de bairro do site de pedidos (entrega por bairro).
 *
 * Antes era um `includes` direto no nome, então "JD Mollon" não achava "Mollon" (a lista
 * não tem "JD", e o bairro nem tem "Jardim" no nome) e "jardim sao" não achava "Jardim
 * São Camilo" (acento). Agora:
 *  - ignora acento, maiúscula e pontuação ("Sta. Bárbara" = "sta barbara");
 *  - entende abreviação comum de endereço (JD → jardim, PQ → parque, VL → vila, STA →
 *    santa, RES → residencial...);
 *  - cada palavra digitada é procurada separado, em qualquer ordem ("mollon jardim" acha
 *    "Jardim Fernando Mollon");
 *  - palavra de tipo (jardim, vila, parque...) não é obrigatória: o cliente costuma digitar
 *    "Jd Mollon" mesmo quando o bairro está cadastrado só como "Mollon". Só é exigida
 *    quando é tudo que o cliente digitou ("jardim" sozinho lista os jardins).
 *
 * Ordem do resultado: primeiro quem bate mais certinho com o que foi digitado (menos
 * palavras sobrando no nome), então "JD Mollon" mostra "Mollon" antes de "Jardim
 * Fernando Mollon".
 */

// Abreviação (já sem acento/pontuação) → palavra completa. Só abreviações que não
// confundem com nome de bairro de verdade; letra solta ("v", "s") fica de fora.
const ABBREVIATIONS: Record<string, string> = {
  jd: 'jardim',
  jdm: 'jardim',
  jrd: 'jardim',
  jard: 'jardim',
  pq: 'parque',
  pl: 'parque', // o cliente do Rei do Suco escreve "PL" pra Parque
  pqe: 'parque',
  prq: 'parque',
  vl: 'vila',
  res: 'residencial',
  resid: 'residencial',
  resd: 'residencial',
  cj: 'conjunto',
  cjto: 'conjunto',
  conj: 'conjunto',
  ch: 'chacara',
  chac: 'chacara',
  lot: 'loteamento',
  lote: 'loteamento',
  sta: 'santa',
  sto: 'santo',
  nsa: 'nossa',
  sra: 'senhora',
  dr: 'doutor',
  prof: 'professor',
  pres: 'presidente',
  cel: 'coronel',
  gov: 'governador',
  eng: 'engenheiro',
};

// Palavras que dizem o tipo do bairro, não o nome — opcionais na busca.
const TYPE_WORDS = new Set([
  'jardim',
  'parque',
  'vila',
  'residencial',
  'conjunto',
  'chacara',
  'chacaras',
  'loteamento',
  'bairro',
  'cidade',
  'recanto',
  'condominio',
  'nucleo',
  'distrito',
]);

// Palavras de ligação que o cliente pode ou não digitar ("Parque do Lago" / "parque lago").
const STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w);
}

/**
 * Filtra e ordena os bairros pelo que o cliente digitou. `getName` devolve o texto em que
 * buscar (o nome do bairro, sem a cidade, por exemplo).
 */
export function searchZones<T>(items: T[], query: string, getName: (item: T) => string): T[] {
  const queryWords = tokenize(query).filter((w) => !STOP_WORDS.has(w));
  if (queryWords.length === 0) return items;

  const nameWords = queryWords.filter((w) => !TYPE_WORDS.has(w));
  // Só digitou tipo ("jardim", "jd") — aí o tipo é o que ele procura.
  const required = nameWords.length > 0 ? nameWords : queryWords;
  const optional = nameWords.length > 0 ? queryWords.filter((w) => TYPE_WORDS.has(w)) : [];

  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const words = tokenize(getName(item)).filter((w) => !STOP_WORDS.has(w));
    const used = new Set<number>();

    // Cada palavra obrigatória precisa casar com uma palavra do nome (começo da palavra
    // vale mais; meio da palavra ainda vale, como era antes).
    let prefixHits = 0;
    for (const q of required) {
      let hit = words.findIndex((w, i) => !used.has(i) && w.startsWith(q));
      if (hit >= 0) prefixHits++;
      else hit = words.findIndex((w, i) => !used.has(i) && w.includes(q));
      if (hit < 0) return;
      used.add(hit);
    }
    let optionalHits = 0;
    for (const q of optional) {
      const hit = words.findIndex((w, i) => !used.has(i) && w.startsWith(q));
      if (hit >= 0) {
        used.add(hit);
        optionalHits++;
      }
    }

    // Menor é melhor: palavras do nome que sobraram sem casar pesam mais que tipo digitado
    // que não está no nome ("JD Mollon" → "Mollon" sobra 0, "Jardim Fernando Mollon" sobra 1).
    const leftover = words.length - used.size;
    const score = leftover * 10 + (optional.length - optionalHits) - prefixHits * 0.1;
    scored.push({ item, score, index });
  });

  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item);
}
