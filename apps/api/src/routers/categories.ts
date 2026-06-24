import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@finances/db';
import { categories } from '@finances/db';
import {
  CategorySchema,
  CategoryTreeNodeSchema,
  CreateCategoryInput,
  UpdateCategoryInput,
  type CategoryTreeNode,
} from '@finances/contracts';
import { router, protectedProcedure } from '../trpc/trpc.js';

const IdInput = z.object({ id: z.string().uuid() });
const IdsInput = z.object({ ids: z.array(z.string().uuid()).min(1) });

function buildTree(rows: CategoryTreeNode[], parentId: string | null = null): CategoryTreeNode[] {
  return rows
    .filter((r) => r.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({ ...r, children: buildTree(rows, r.id) }));
}

export const categoriesRouter = router({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .output(z.array(CategorySchema))
    .query(({ input }) => {
      const includeArchived = input?.includeArchived ?? false;
      const where = includeArchived ? undefined : eq(categories.archived, false);
      return db
        .select()
        .from(categories)
        .where(where)
        .orderBy(categories.sortOrder)
        .all();
    }),

  byId: protectedProcedure
    .input(IdInput)
    .output(CategorySchema)
    .query(({ input }) => {
      const row = db.select().from(categories).where(eq(categories.id, input.id)).get();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Categoria no trobada' });
      }
      return row;
    }),

  tree: protectedProcedure
    .input(z.object({ kind: z.enum(['income', 'expense']).optional() }).optional())
    .output(z.array(CategoryTreeNodeSchema))
    .query(({ input }) => {
      const all = db.select().from(categories).orderBy(categories.sortOrder).all();
      const filtered = input?.kind ? all.filter((c) => c.kind === input.kind) : all;
      const nodes: CategoryTreeNode[] = filtered.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        parentId: c.parentId,
        icon: c.icon,
        color: c.color,
        sortOrder: c.sortOrder,
        archived: c.archived,
        children: [],
      }));
      return buildTree(nodes);
    }),

  create: protectedProcedure
    .input(CreateCategoryInput)
    .output(CategorySchema)
    .mutation(({ input }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const maxRow = db
        .select({ s: categories.sortOrder })
        .from(categories)
        .orderBy(categories.sortOrder)
        .all()
        .at(-1);
      db.insert(categories)
        .values({
          id,
          name: input.name,
          kind: input.kind,
          parentId: input.parentId ?? null,
          icon: input.icon,
          color: input.color,
          sortOrder: (maxRow?.s ?? -1) + 1,
          archived: false,
          createdAt: now,
        })
        .run();
      const row = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!row) throw new Error('Failed to create category');
      return row;
    }),

  update: protectedProcedure
    .input(UpdateCategoryInput)
    .output(CategorySchema)
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      const existing = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Categoria no trobada' });
      }
      db.update(categories).set(patch).where(eq(categories.id, id)).run();
      const row = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!row) throw new Error('Failed to update category');
      return row;
    }),

  archive: protectedProcedure
    .input(IdInput)
    .output(CategorySchema)
    .mutation(({ input }) => {
      const existing = db.select().from(categories).where(eq(categories.id, input.id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Categoria no trobada' });
      }
      db.update(categories)
        .set({ archived: true })
        .where(eq(categories.id, input.id))
        .run();
      const row = db.select().from(categories).where(eq(categories.id, input.id)).get();
      if (!row) throw new Error('Failed to archive category');
      return row;
    }),

  reorder: protectedProcedure
    .input(IdsInput)
    .output(z.object({ count: z.number().int() }))
    .mutation(({ input }) => {
      const matched = db
        .select({ id: categories.id })
        .from(categories)
        .where(inArray(categories.id, input.ids))
        .all();
      if (matched.length !== input.ids.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Algun dels IDs no existeix',
        });
      }
      input.ids.forEach((id, idx) => {
        db.update(categories).set({ sortOrder: idx }).where(eq(categories.id, id)).run();
      });
      return { count: input.ids.length };
    }),
});