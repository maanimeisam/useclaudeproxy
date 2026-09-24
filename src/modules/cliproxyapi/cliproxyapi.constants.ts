import path from 'node:path';
import { args } from '../../config/args.js';

export const VERSION = '7.3.17';
export const RELEASE_BASE = `https://github.com/router-for-me/CLIProxyAPI/releases/download/v${VERSION}`;
export const TOOLS_DIR = args.toolsDir;
export const BINARY_PATH = path.join(args.toolsDir, 'cli-proxy-api');
