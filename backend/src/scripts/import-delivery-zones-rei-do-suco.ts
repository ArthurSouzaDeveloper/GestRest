/**
 * Importa/atualiza os bairros de entrega (taxa por bairro) de "O Rei do Suco"
 * pra um restaurante já cadastrado na plataforma — transcrito das listas que
 * o cliente mandou (Americana e Santa Bárbara d'Oeste).
 *
 * O nome de cada bairro leva a cidade entre parênteses porque várias ruas se
 * repetem nas duas cidades com taxas diferentes (ex.: "Centro" é R$10 em SBO
 * e R$9 em Americana) — sem isso o nome colidiria (DeliveryZone é único por
 * restaurante+nome) e ficaria ambíguo pro cliente escolher no site.
 *
 * Idempotente: roda de novo com segurança — cria o que não existe, e
 * atualiza a taxa de quem já existe caso o cliente mande uma lista nova.
 *
 * Uso:
 *   node dist/scripts/import-delivery-zones-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// BAIRROS (transcritos e conferidos das listas do cliente)
// ─────────────────────────────────────────────────────────────

const AMERICANA: [string, number][] = [
  ['Alabama, Residencial', 10.0],
  ['Alvorada, Jardim', 10.0],
  ['Amélia, Jardim', 6.0],
  ['Amorim, Vila', 6.0],
  ['Bairro da Lagoa', 12.0],
  ['Balsa, Jardim', 12.0],
  ['Bela Vista, Jardim', 10.0],
  ['Belvedere, Vila', 12.0],
  ['Bertini, Vila', 14.0],
  ['Bertoni, Jardim', 15.0],
  ['Biasi, Vila', 10.0],
  ['Boa Vista, Residencial', 10.0],
  ['Boer, Jardim', 14.0],
  ['Bosque da Saúde', 10.0],
  ['Bosque dos Ipês', 10.0],
  ['Brasília, Jardim', 6.0],
  ['Brieds', 9.0],
  ['Campo Belo, Jardim', 14.0],
  ['Campo Limpo', 10.0],
  ['Campo Verde', 10.0],
  ['Carioba', 10.0],
  ['Cariobinha', 10.0],
  ['Chatarina Zanaga', 7.0],
  ['Cechino', 6.0],
  ['Centro', 9.0],
  ['Chácara Letônia', 14.0],
  ['Chácara Rodrigues', 9.0],
  ['Cidade Jardim I', 6.0],
  ['Conserva', 8.0],
  ['Cordenonsi, Vila', 9.0],
  ['Dainese, Vila', 6.0],
  ['Dom Pedro II, Parque', 15.0],
  ['Dona Judith, Jardim', 6.0],
  ['Esplanada, Jardim', 10.0],
  ['Frezzarin, Vila', 7.0],
  ['Galo, Vila', 10.0],
  ['Girassol, Jardim', 6.0],
  ['Glória, Jardim', 6.0],
  ['Gramado, Parque', 7.0],
  ['Guanabara, Jardim', 10.0],
  ['Helena, Jardim', 10.0],
  ['Jacyra I, Residencial', 6.0],
  ['Iate Clube de Americana', 15.0],
  ['Iate Clube de Campinas', 18.0],
  ['Imperador, Jardim', 18.0],
  ['Ipiranga, Jardim', 4.0],
  ['Israel, Vila', 6.0],
  ['Jacyra, Jardim', 6.0],
  ['Jaguari, Residencial', 10.0],
  ['Jardim America II', 14.0],
  ['Jardim América', 10.0],
  ['Jardim da Mata', 14.0],
  ['Jardim das Flores', 9.0],
  ['Jones, Vila', 7.0],
  ['Liberdade, Parque', 7.0],
  ['Lírios, Jardim', 7.0],
  ['Lizandra, Jardim', 10.0],
  ['Louricilda, Vila', 6.0],
  ['Luciane, Jardim', 6.0],
  ['Machadinho I', 10.0],
  ['Mangueira, Parque', 13.0],
  ['Márcia Cristina, Jardim', 6.0],
  ['Margarida, Vila', 10.0],
  ['Mariana, Vila', 10.0],
  ['Mário Covas, Jardim', 9.0],
  ['Massucheto, Vila', 8.0],
  ['Mathiensen, Vila', 7.0],
  ['Medon, Vila', 7.0],
  ['Mirandola, Jardim', 10.0],
  ['Miriam, Jardim', 6.0],
  ['Molon', 5.0],
  ['Morada do Sol', 8.0],
  ['Nações, Parque', 7.0],
  ['Nardini, Residencial', 6.0],
  ['Nielsen Ville, Jardim', 6.0],
  ['Nossa Senhora de Fátima', 10.0],
  ['Nossa Senhora do Carmo', 10.0],
  ['Nova Americana', 10.0],
  ['Nova Carioba, Parque', 10.0],
  ['Novo Horizonte, Jardim', 10.0],
  ['Novo Mundo, Parque', 6.0],
  ['Omar, Vila', 6.0],
  ['Orquídeas, Jardim', 9.0],
  ['Pacaembu, Jardim', 10.0],
  ['Paulista, Jardim', 6.0],
  ['Paulistano, Jardim', 10.0],
  ['Pavan, Vila', 8.0],
  ['Paz, Jardim', 8.0],
  ['Praia Azul', 15.0],
  ['Praia dos Namorados', 15.0],
  ['Primavera, Jardim', 6.0],
  ['Progresso, Jardim', 10.0],
  ['Redher, Vila', 8.0],
  ['Remanso Azul', 15.0],
  ['Santa Catarina, Vila', 9.0],
  ['Santa Cruz', 10.0],
  ['Santa Inês, Vila', 6.0],
  ['Santa Maria, Vila', 9.0],
  ['Santana, Vila', 10.0],
  ['Santo Antonio', 6.0],
  ['São Benedito', 15.0],
  ['São Domingos, Jardim', 8.0],
  ['São Jerônimo, Parque', 8.0],
  ['São José', 6.0],
  ['São Luiz', 10.0],
  ['São Manoel', 10.0],
  ['São Paulo, Jardim', 6.0],
  ['São Pedro, Vila', 6.0],
  ['São Roque, Jardim', 6.0],
  ['São Sebastião', 15.0],
  ['São Vito, Jardim', 10.0],
  ['Terramérica, Jardim', 6.0],
  ['Thelja, Jardim', 10.0],
  ['Trípoli, Jardim', 10.0],
  ['Universitário, Parque', 6.0],
  ['Vale das Nogueiras, Residencial', 15.0],
  ['Werner Plaas', 10.0],
];

const SANTA_BARBARA: [string, number][] = [
  ['31 de Março-Cohab', 10.0],
  ['Acampamento Presboteriano', 10.0],
  ['Adelia, Jardim', 6.0],
  ['Alfa, Jardim', 14.0],
  ['Alphacenter, Jardim', 8.0],
  ['Alves, Vila', 11.0],
  ['Amélia, Jardim', 6.0],
  ['América, Jardim', 12.0],
  ['Angelo Giubina', 10.0],
  ['Aparecida, Vila', 12.0],
  ['Augusto Cavalheiro, Jardim', 12.0],
  ['Barão, Jardim', 13.0],
  ['Batagin, Jardim', 13.0],
  ['Belo Horizonte II, Jardim', 10.0],
  ['Betica, Vila', 14.0],
  ['Boa Esperança, Jardim', 12.0],
  ['Boa Vista, Jardim', 12.0],
  ['Boldrin, Vila', 12.0],
  ['Borges, Vila', 12.0],
  ['Bosque das Árvores, Residencial', 12.0],
  ['Brasil, Vila', 12.0],
  ['Brasília, Jardim', 6.0],
  ['Breda, Vila', 10.0],
  ['Cândido Bertini II, Jardim', 7.0],
  ['Cândido Bertini, Jardim', 6.0],
  ['Cedros, Jardim', 6.0],
  ['Centro', 10.0],
  ['Cidade Nova', 6.0],
  ['Conceição, Jardim', 10.0],
  ['Dainese, Vila', 6.0],
  ['Distrito Industrial I e II', 8.0],
  ['Diva, Vila', 9.0],
  ['Dona Margarida, Residencial', 15.0],
  ['Dona Regina, Jardim', 6.0],
  ['Dulce, Jardim', 13.0],
  ['Eldorado, Parque', 10.0],
  ['Esmeralda, Jardim', 6.0],
  ['Europa I, Jardim', 7.0],
  ['Fernando Mollon, Jardim', 6.0],
  ['Frerrarezi, Vila', 6.0],
  ['Firenze, Jardim', 15.0],
  ['Flamboyant, Jardim', 14.0],
  ['Frezzarin, Parque', 8.0],
  ['Furlan, Residencial', 14.0],
  ['Garrido, Vila', 12.0],
  ['Geriva, Jardim', 5.0],
  ['Godoy, Vila', 11.0],
  ['Grego, Vila', 14.0],
  ['Icaraí, Jardim', 14.0],
  ['Industrial Bandeirantes, Parque', 10.0],
  ['Industrial, Jardim', 8.0],
  ['Inocoop', 9.0],
  ['Itamaraty, Jardim', 12.0],
  ['Jacira III, Parque', 6.0],
  ['Jacyra, Parque Residencial', 6.0],
  ['Jardim das Flores', 9.0],
  ['Lagoa Seca', 6.0],
  ['Laranjeiras, Jardim', 10.0],
  ['Laudissi, Jardim', 12.0],
  ['Linópolis, Vila', 13.0],
  ['Manacás, Jardim', 8.0],
  ['Mac Knight, Vila', 12.0],
  ['Maria, Vila', 12.0],
  ['Mariana, Jardim', 8.0],
  ['Mollon', 5.0],
  ['Monte Líbano, Jardim', 6.0],
  ['Nova Conquista, Jardim', 8.0],
  ['Olaria, Parque', 12.0],
  ['Oliveira, Vila', 12.0],
  ['Orquídeas, Jardim', 10.0],
  ['Palmeiras, Jardim', 7.0],
  ['Panambi, Jardim', 13.0],
  ['Pântano, Jardim', 5.0],
  ['Paraíso, Jardim', 10.0],
  ['Parque do Lago', 10.0],
  ['Parque Rochele II, Residencial', 14.0],
  ['Paulista, Jardim', 10.0],
  ['Pérola, Jardim', 6.0],
  ['Pires, Vila', 12.0],
  ['Planalto do Sol, Loteamento', 8.0],
  ['Parque Planalto', 8.0],
  ['Primavera, Jardim', 12.0],
  ['Reserva Centenária', 10.0],
  ['Romano', 14.0],
  ['Rochelle, Parque', 14.0],
  ['Rosemary, Jardim', 10.0],
  ['San Marino, Jardim', 10.0],
  ['Sans, Jardim', 10.0],
  ['Santa Alice, Jardim', 10.0],
  ['Santa Cecília, Jardim', 10.0],
  ['Santa Cruz, Vila', 12.0],
  ['Santa Fé, Jardim', 7.0],
  ['Santa Inês, Parque', 8.0],
  ['Santa Luzia, Jardim', 13.0],
  ['Santa Rita de Cássia, Jardim', 8.0],
  ['Santa Rosa I, Parque', 6.0],
  ['Santa Rosa II, Parque', 8.0],
  ['Santa Terezinha, Vila', 12.0],
  ['Santana, Vila', 10.0],
  ['Santo Antonio, Jardim', 8.0],
  ['São Camilo, Jardim', 6.0],
  ['São Fernando, Jardim', 6.0],
  ['São Francisco, Jardim', 8.0],
  ['São Joaquim, Residencial', 12.0],
  ['São José, Vila', 10.0],
  ['São Luiz, Jardim', 10.0],
  ['Sartori, Jardim', 9.0],
  ['Siqueira Campos, Vila', 12.0],
  ['Souza Queiroz, Vila', 8.0],
  ['Terras de Santa Bárbara', 8.0],
  ['Terrazui, SM', 10.0],
  ['Trabalhadores', 10.0],
  ['Turmalinas, Jardim', 6.0],
  ['Vila Rica, Jardim', 12.0],
  ['Vista Alegre, Jardim', 10.0],
  ['Zabani, Parque', 7.0],
];

// ─────────────────────────────────────────────────────────────

async function ensureZone(restaurantId: string, name: string, fee: number) {
  const existing = await prisma.deliveryZone.findFirst({ where: { restaurantId, name } });
  if (!existing) {
    await prisma.deliveryZone.create({ data: { restaurantId, name, fee, active: true } });
    return 'created' as const;
  }
  if (Number(existing.fee) !== fee || !existing.active) {
    await prisma.deliveryZone.update({ where: { id: existing.id }, data: { fee, active: true } });
    return 'updated' as const;
  }
  return 'unchanged' as const;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/import-delivery-zones-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`❌ Nenhum restaurante encontrado com o slug "${slug}". Crie-o em /super primeiro.`);
    process.exit(1);
  }
  const rid = restaurant.id;
  console.log(`📍 Importando bairros de entrega de "${restaurant.name}" (${slug})...`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [name, fee] of AMERICANA) {
    const result = await ensureZone(rid, `${name} (Americana)`, fee);
    if (result === 'created') created++;
    else if (result === 'updated') updated++;
    else unchanged++;
  }
  for (const [name, fee] of SANTA_BARBARA) {
    const result = await ensureZone(rid, `${name} (Santa Bárbara d'Oeste)`, fee);
    if (result === 'created') created++;
    else if (result === 'updated') updated++;
    else unchanged++;
  }

  console.log(`✅ Bairros: ${created} criados, ${updated} atualizados, ${unchanged} sem mudança.`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
