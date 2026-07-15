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
