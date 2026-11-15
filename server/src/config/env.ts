import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  MONGO_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOAN_PERIOD_DAYS: z.coerce.number().int().positive().default(30),
  RENEWAL_DAYS: z.coerce.number().int().positive().default(7),
  MAX_RENEWALS: z.coerce.number().int().min(0).default(1),
  MAX_ACTIVE_LOANS: z.coerce.number().int().positive().default(5),
  MAX_ACTIVE_HOLDS: z.coerce.number().int().positive().default(3),
  FINE_PER_DAY_CENTS: z.coerce.number().int().positive().default(500),
  MAX_FINE_CENTS: z.coerce.number().int().positive().default(15000),
  MAX_OUTSTANDING_FINE_CENTS: z.coerce.number().int().nonnegative().default(10000),
  RESERVATION_HOLD_HOURS: z.coerce.number().int().positive().default(48),
  LOST_FEE_CENTS: z.coerce.number().int().positive().default(25000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
