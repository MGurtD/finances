import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@finances/api';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
      transformer: superjson,
      fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }),
    }),
  ],
});