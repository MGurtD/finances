import argon2 from 'argon2';

const ENV_HASH = process.env['APP_PASSWORD_HASH'];

export async function verifyPassword(plain: string): Promise<boolean> {
  if (!ENV_HASH) return false;
  try {
    return await argon2.verify(ENV_HASH, plain);
  } catch {
    return false;
  }
}

export function passwordHashConfigured(): boolean {
  return typeof ENV_HASH === 'string' && ENV_HASH.length > 0;
}