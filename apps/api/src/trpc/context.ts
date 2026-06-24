import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { SESSION_COOKIE } from '@finances/contracts';

export interface SessionUser {
  authenticated: true;
  issuedAt: number;
}

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  let user: SessionUser | null = null;
  const token = req.cookies[SESSION_COOKIE];

  if (token) {
    try {
      await req.jwtVerify<{ iat: number }>();
      user = { authenticated: true, issuedAt: Date.now() };
    } catch {
      user = null;
    }
  }

  return { req, res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;