import { HealthSchema } from '@finances/contracts';
import { publicProcedure, router } from '../trpc/trpc.js';

export const healthRouter = router({
  get: publicProcedure
    .output(HealthSchema)
    .query(() => {
      return {
        status: 'ok' as const,
        version: '0.1.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    }),
});