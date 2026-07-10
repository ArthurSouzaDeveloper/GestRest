import { z } from 'zod';
import { PaymentMethod, Role, Station } from '@prisma/client';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(Role),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2),
  station: z.nativeEnum(Station),
  sortOrder: z.number().int().optional(),
});

export const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  categoryId: z.string().uuid(),
  avgPrepMin: z.number().int().positive().optional(),
  imageUrl: z.string().optional(),
  available: z.boolean().optional(),
});

export const additionalSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  categoryId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});

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
