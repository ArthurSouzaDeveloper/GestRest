import { z } from 'zod';
import { PaymentMethod, Role, Station } from '@prisma/client';

// Applies to every password being SET (create/update/reset) — not to the login payload,
// which just needs to accept whatever was set under this rule at the time. 72 is bcrypt's
// own input cap (longer input is silently truncated, so allowing more gives a false sense
// of extra strength). Letter + number is a floor, not full complexity — this is an internal
// staff POS, not a public consumer app, so we don't force symbols and frustrate cashiers.
const strongPassword = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(72, 'A senha pode ter no máximo 72 caracteres')
  .regex(/[a-zA-Z]/, 'A senha precisa ter pelo menos uma letra')
  .regex(/[0-9]/, 'A senha precisa ter pelo menos um número');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

export const createRestaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: strongPassword,
  tablesCount: z.number().int().positive().max(100).optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: strongPassword,
  role: z.nativeEnum(Role),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  password: strongPassword.optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2),
  station: z.nativeEnum(Station),
  sortOrder: z.number().int().optional(),
});

// `.strict()` on update schemas rejects unknown keys (e.g. a caller trying to smuggle
// `restaurantId` to hijack a record into another tenant) instead of silently stripping
// them — a rejection shows up as a validation_error log line, a silent strip would not.
export const categoryUpdateSchema = z
  .object({
    name: z.string().min(2).optional(),
    station: z.nativeEnum(Station).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  categoryId: z.string().uuid(),
  avgPrepMin: z.number().int().positive().optional(),
  imageUrl: z.string().optional(),
  available: z.boolean().optional(),
});

export const productUpdateSchema = z
  .object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    price: z.number().nonnegative().optional(),
    categoryId: z.string().uuid().optional(),
    avgPrepMin: z.number().int().positive().optional(),
    imageUrl: z.string().optional(),
    available: z.boolean().optional(),
  })
  .strict();

export const additionalSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  categoryId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});

export const additionalUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    categoryId: z.string().uuid().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const deliveryZoneSchema = z.object({
  name: z.string().min(2),
  fee: z.number().nonnegative(),
  active: z.boolean().optional(),
});

export const deliveryZoneUpdateSchema = z
  .object({
    name: z.string().min(2).optional(),
    fee: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const deliveryDistanceBandSchema = z.object({
  maxDistanceKm: z.number().positive().max(999),
  fee: z.number().nonnegative(),
  active: z.boolean().optional(),
});

export const deliveryDistanceBandUpdateSchema = z
  .object({
    maxDistanceKm: z.number().positive().max(999).optional(),
    fee: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
  })
  .strict();

// A checagem "precisa ter origem pra ativar DISTANCE_BANDS" não dá pra fazer aqui: o PATCH
// que só liga o modo normalmente não reenvia lat/lng (já estão salvos), então só o service
// (que consulta o banco) sabe se a origem já existe — ver deliveryPricingSettingsService.update.
export const deliveryPricingSettingsSchema = z
  .object({
    mode: z.enum(['ZONE', 'DISTANCE_BANDS']),
    originAddress: z.string().min(2).max(200).optional(),
    originLat: z.number().min(-90).max(90).optional(),
    originLng: z.number().min(-180).max(180).optional(),
  })
  .strict();

export const tableSchema = z.object({
  number: z.number().int().positive(),
  seats: z.number().int().positive().optional(),
});

export const openOrderSchema = z.object({
  tableId: z.string().uuid(),
  customerName: z.string().optional(),
  peopleCount: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const addItemsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        notes: z.string().optional(),
        additionalIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .min(1),
});

export const updateOrderSchema = z.object({
  discount: z.number().nonnegative().optional(),
  serviceRate: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  version: z.number().int().optional(),
});

export const updateItemSchema = z.object({
  quantity: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const paymentSchema = z.object({
  payments: z
    .array(
      z.object({
        method: z.nativeEnum(PaymentMethod),
        amount: z.number().positive(),
        cashReceived: z.number().positive().optional(),
      }),
    )
    .min(1),
});

// Site público de pedidos (delivery/retirada) — pagamento é sempre cobrado na
// entrega/retirada (sem gateway), por isso não inclui MEAL_VOUCHER (só faz sentido
// presencial num sistema à parte) e nunca aceita 'PAID'/valor de pagamento.
export const publicOrderSchema = z
  .object({
    orderType: z.enum(['DELIVERY', 'PICKUP']),
    customerName: z.string().min(2).max(80),
    customerPhone: z.string().min(8).max(20),
    deliveryZoneId: z.string().uuid().optional(),
    // Modo por distância: coordenadas do endereço escolhido no autocomplete (ver
    // AddressAutocomplete) — o back nunca confia num valor de frete vindo do cliente,
    // sempre recalcula a distância/faixa de novo a partir daqui em openPublic().
    deliveryLat: z.number().min(-90).max(90).optional(),
    deliveryLng: z.number().min(-180).max(180).optional(),
    deliveryStreet: z.string().min(2).max(200).optional(),
    deliveryNumber: z.string().min(1).max(20).optional(),
    deliveryComplement: z.string().max(200).optional(),
    declaredPaymentMethod: z.enum(['PIX', 'CASH', 'CREDIT', 'DEBIT']),
    changeFor: z.number().positive().optional(),
    notes: z.string().max(300).optional(),
    // Honeypot: campo invisível pro cliente real; bot que preenche todo input do form cai
    // aqui. Nome propositalmente sem relação com nenhum campo comum (nome/email/telefone/
    // endereço/site) pra não colidir com autofill do navegador e barrar cliente de verdade.
    gr_hp: z.string().max(0).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().positive().max(20),
          notes: z.string().max(200).optional(),
          additionalIds: z.array(z.string().uuid()).optional(),
        }),
      )
      .min(1)
      .max(40),
  })
  .strict()
  .refine(
    (d) =>
      d.orderType !== 'DELIVERY' ||
      (d.deliveryZoneId && d.deliveryStreet && d.deliveryNumber) ||
      (d.deliveryLat !== undefined && d.deliveryLng !== undefined && d.deliveryStreet && d.deliveryNumber),
    {
      message: 'Endereço, número e bairro (ou localização) são obrigatórios para entrega',
      path: ['deliveryZoneId'],
    },
  );
