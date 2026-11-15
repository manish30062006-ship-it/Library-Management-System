const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const configured = process.env.LOG_LEVEL;
const minLevel: Level =
  configured && configured in LEVELS ? (configured as Level) : 'info';

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const entry = { level, time: new Date().toISOString(), message, ...meta };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
