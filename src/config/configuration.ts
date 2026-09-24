import fs from 'node:fs';
import { z } from 'zod';
import { args } from './args.js';
import path from 'node:path';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  DATA_DIR: z.coerce.string().default('data'),
  DEBUG: z.coerce.string().optional(),
  WATCH_INTERVAL_MS: z.coerce.number().default(7000),
  YAML_CONFIG_PATH: z.coerce
    .string()
    .default(path.join(args.toolsDir, 'config.yaml')),
});

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATA_DIR: args.dataDir,
  DEBUG: process.env.DEBUG,
});
if (!parsedEnv.success) {
  console.error('❌ Invalid arguments:');
  console.error(z.prettifyError(parsedEnv.error));
  process.exit(1);
}

const config = Object.freeze(parsedEnv.data);
// type Config = typeof config;
fs.mkdirSync(config.DATA_DIR, { recursive: true });

export default () => config;

export const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
};
