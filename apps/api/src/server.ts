import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';

const JWT_SECRET = process.env['APP_JWT_SECRET'];

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
    },
  });

  await server.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  });

  await server.register(cookie);

  if (!JWT_SECRET) {
    server.log.warn(
      'APP_JWT_SECRET no configurat. Les sessions no es podran verificar. Defineix-lo a .env.',
    );
  }
  await server.register(jwt, {
    secret: JWT_SECRET ?? 'unsafe-dev-secret-change-me',
    cookie: { cookieName: 'finances_session', signed: false },
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}