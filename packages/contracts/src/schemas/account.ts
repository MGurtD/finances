import { z } from 'zod';

export const AccountTypeSchema = z.enum([
  'checking',
  'savings',
  'credit_card',
  'cash',
  'investment',
]);

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  type: AccountTypeSchema,
  currency: z.literal('EUR').default('EUR'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
  icon: z.string().max(30).default('wallet'),
  initialBalance: z.number().int(), // in cents
  sortOrder: z.number().int().default(0),
  archived: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateAccountInput = AccountSchema.pick({
  name: true,
  type: true,
  color: true,
  icon: true,
  initialBalance: true,
}).extend({
  currency: z.literal('EUR').optional(),
});

export const UpdateAccountInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).optional(),
  type: AccountTypeSchema.optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(30).optional(),
  initialBalance: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export const ReorderInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export type Account = z.infer<typeof AccountSchema>;
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountInput>;
export type ReorderInput = z.infer<typeof ReorderInput>;