import { z } from 'zod';

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});

export type Health = z.infer<typeof HealthSchema>;