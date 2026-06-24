import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@finances/db';
import { categories } from '@finances/db';
import { CategorySchema, CreateCategoryInput } from '@finances/contracts';
import { router, protectedProcedure } from '../trpc/trpc.js';

export const categoriesRouter = router({
  list: protectedProcedure
    .output(z.array(CategorySchema))
    .query(() =>
      db
        .select()
        .from(categories)
        .where(eq(categories.archived, false))
        .all(),
    ),

  create: protectedProcedure
    .input(CreateCategoryInput)
    .output(CategorySchema)
    .mutation(({ input }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(categories)
        .values({
          id,
          name: input.name,
          kind: input.kind,
          parentId: input.parentId ?? null,
          icon: input.icon,
          color: input.color,
          archived: false,
          createdAt: now,
        })
        .run();
      const row = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!row) throw new Error('Failed to create category');
      return row;
    }),
});