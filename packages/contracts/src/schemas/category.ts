import { z } from 'zod';

export const CategoryKindSchema = z.enum(['income', 'expense']);

export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(30),
  kind: CategoryKindSchema,
  parentId: z.string().uuid().nullable(),
  icon: z.string().max(30).default('tag'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#8B7355'),
  sortOrder: z.number().int().default(0),
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

export const UpdateCategoryInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(30).optional(),
  kind: CategoryKindSchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(30).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  archived: z.boolean().optional(),
});

export const CategoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = z.lazy(() =>
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    kind: CategoryKindSchema,
    parentId: z.string().uuid().nullable(),
    icon: z.string(),
    color: z.string(),
    sortOrder: z.number().int(),
    archived: z.boolean(),
    children: z.array(CategoryTreeNodeSchema),
  }),
);

export interface CategoryTreeNode {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  parentId: string | null;
  icon: string;
  color: string;
  sortOrder: number;
  archived: boolean;
  children: CategoryTreeNode[];
}

export type Category = z.infer<typeof CategorySchema>;
export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;