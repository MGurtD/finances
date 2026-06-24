import { z } from 'zod';

export const LoginInput = z.object({
  password: z.string().min(1).max(200),
});

export const AuthStatusSchema = z.object({
  authenticated: z.boolean(),
});

export const SESSION_COOKIE = 'finances_session';

export type LoginInput = z.infer<typeof LoginInput>;
export type AuthStatus = z.infer<typeof AuthStatusSchema>;