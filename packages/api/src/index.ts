/**
 * @finances/api — re-exporta l'AppRouter perquè apps/web pugui inferir tipus
 * sense accedir directament al codi del backend.
 *
 * Boundary net: web importa `@finances/api` per tipus, NO per runtime.
 * El runtime del client tRPC viu a apps/web/src/trpc/client.ts.
 */

import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { HealthSchema } from '@finances/contracts';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

/**
 * Mirror del router d'apps/api. Mantingut sincronitzat manualment
 * fins que tRPC ofereixi typegen automàtic cross-package.
 */
const healthRouter = router({
  get: publicProcedure
    .output(HealthSchema)
    .query(() => ({
      status: 'ok' as const,
      version: '0.1.0',
      uptime: 0,
      timestamp: new Date().toISOString(),
    })),
});

export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;