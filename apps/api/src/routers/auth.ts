import { TRPCError } from '@trpc/server';
import {
  AuthStatusSchema,
  LoginInput,
  SESSION_COOKIE,
  type AuthStatus,
} from '@finances/contracts';
import { router, publicProcedure } from '../trpc/trpc.js';
import { passwordHashConfigured, verifyPassword } from '../lib/password.js';
import { checkRate, resetRate } from '../lib/rateLimit.js';

const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 7;
const RATE_KEY = 'login';

function clientIp(ctx: { req: { ip?: string; socket?: { remoteAddress?: string } } }): string {
  return ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? 'unknown';
}

export const authRouter = router({
  status: publicProcedure
    .output(AuthStatusSchema)
    .query(({ ctx }): AuthStatus => ({ authenticated: ctx.user !== null })),

  login: publicProcedure
    .input(LoginInput)
    .output(AuthStatusSchema)
    .mutation(async ({ input, ctx }): Promise<AuthStatus> => {
      if (!passwordHashConfigured()) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'APP_PASSWORD_HASH no configurat',
        });
      }

      const ip = clientIp(ctx);
      const rate = checkRate(`${RATE_KEY}:${ip}`);
      if (!rate.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Massa intents. Torna-ho a provar en ${Math.ceil(rate.retryAfterMs / 1000)}s.`,
        });
      }

      const ok = await verifyPassword(input.password);
      if (!ok) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Contrasenya incorrecta',
        });
      }

      resetRate(`${RATE_KEY}:${ip}`);

      const token = await ctx.res.jwtSign({}, { expiresIn: `${COOKIE_MAX_AGE_S}s` });
      ctx.res.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env['NODE_ENV'] === 'production',
        path: '/',
        maxAge: COOKIE_MAX_AGE_S,
      });

      return { authenticated: true };
    }),

  logout: publicProcedure
    .output(AuthStatusSchema)
    .mutation(({ ctx }): AuthStatus => {
      ctx.res.clearCookie(SESSION_COOKIE, { path: '/' });
      return { authenticated: false };
    }),
});