import { HealthSchema } from '@finances/contracts';
import { publicProcedure, router } from '../trpc/trpc.js';

const startTime = Date.now();

export const healthRouter = router({
  get: publicProcedure
    .output(HealthSchema)
    .query(() => {
      return {
        status: 'ok' as const,
        version: '0.1.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
      };
    }),
});