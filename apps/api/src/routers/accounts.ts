import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@finances/db';
import { accounts } from '@finances/db';
import { AccountSchema, CreateAccountInput } from '@finances/contracts';
import { router, publicProcedure } from '../trpc/trpc.js';

export const accountsRouter = router({
  list: publicProcedure
    .output(z.array(AccountSchema))
    .query(() => db.select().from(accounts).all()),

  create: publicProcedure
    .input(CreateAccountInput)
    .output(AccountSchema)
    .mutation(({ input }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id,
          name: input.name,
          type: input.type,
          currency: input.currency ?? 'EUR',
          color: input.color,
          icon: input.icon,
          initialBalance: input.initialBalance,
          archived: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!row) throw new Error('Failed to create account');
      return row;
    }),
});