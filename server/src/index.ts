import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { connectMongo, disconnectMongo } from './lib/mongo';
import { startScheduler } from './jobs/scheduler';
import { logger } from './lib/logger';

async function waitFor(
  name: string,
  check: () => Promise<unknown>,
  attempts = 20,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await check();
      logger.info(`${name} ready`);
      return;
    } catch (err) {
      logger.warn(`${name} not ready (${attempt}/${attempts})`, {
        error: (err as Error).message,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error(`${name} unavailable after ${attempts} attempts`);
}

async function main(): Promise<void> {
  await waitFor('MySQL', () => prisma.$queryRaw`SELECT 1`);
  await connectMongo();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('API listening', { port: env.PORT, env: env.NODE_ENV });
  });

  const stopScheduler = startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });
    stopScheduler();
    server.close();
    await Promise.allSettled([prisma.$disconnect(), disconnectMongo()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: Error) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
