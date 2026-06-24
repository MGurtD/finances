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
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#E85D2C'),
  icon: z.string().max(30).default('wallet'),
  initialBalance: z.number().int(), // in cents
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
  currency: AccountTypeSchema.optional(),
});

export type Account = z.infer<typeof AccountSchema>;
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;