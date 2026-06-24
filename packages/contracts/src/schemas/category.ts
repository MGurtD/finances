import { z } from 'zod';

export const CategoryKindSchema = z.enum(['income', 'expense']);

export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(30),
  kind: CategoryKindSchema,
  parentId: z.string().uuid().nullable(),
  icon: z.string().max(30).default('tag'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#8B7355'),
  archived: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export const CreateCategoryInput = CategorySchema.pick({
  name: true,
  kind: true,
  parentId: true,
  icon: true,
  color: true,
});

export type Category = z.infer<typeof CategorySchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;