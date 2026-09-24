import { Injectable } from '@nestjs/common';
import Debug from 'debug';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { args } from '../../config/args.js';
import { BaseProvider } from '../providers/base-provider.abstract.js';
import {
  VERSION,
  RELEASE_BASE,
  TOOLS_DIR,
  BINARY_PATH,
} from './cliproxyapi.constants.js';
import { ProviderService } from '../providers/provider.service.js';
import { YamlService } from '../yaml/yaml.service.js';
import { HttpService } from '../http/http.service.js';

const log = Debug('app:install');

@Injectable()
export class CliproxyapiService {
  private readonly CONFIG_PATH: string;

  constructor(
    private providerService: ProviderService,
    private yamlService: YamlService,
    private httpService: HttpService,
  ) {
    this.CONFIG_PATH = this.yamlService.configPath;
  }

  private pickAsset(): string {
    const p = os.platform();
    const a = os.arch();
    let platform: string;
    let ext: 'tar.gz' | 'zip';
    switch (p) {
      case 'win32':
        platform = 'windows';
        ext = 'zip';
        break;
      case 'darwin':
        platform = 'darwin';
        ext = 'tar.gz';
        break;
      case 'freebsd':
        platform = 'freebsd';
        ext = 'tar.gz';
        break;
      case 'linux':
        platform = 'linux';
        ext = 'tar.gz';
        break;
      default:
        throw new Error(`Unsupported platform: ${p}`);
    }
    let arch: string;
    switch (a) {
      case 'x64':
        arch = 'amd64';
        break;
      case 'arm64':
        arch = 'aarch64';
        break;
      default:
        throw new Error(`Unsupported architecture: ${a}`);
    }
    return `CLIProxyAPI_${VERSION}_${platform}_${arch}.${ext}`;
  }

  private async download(url: string, dest: string): Promise<void> {
    const client = this.httpService.createHttpClient();
    const stream = client.stream(url, {
      headers: {
        Accept: 'application/octet-stream',
      },
    });

    stream.on('downloadProgress', ({ transferred, total, percent }) => {
      const t = (transferred / 1e6).toFixed(1);
      const totalStr = total ? `/${(total / 1e6).toFixed(1)}` : '';
      const pct = total ? ` (${(percent * 100).toFixed(0)}%)` : '';
      process.stderr.write(`\r⬇️  ${t}MB${totalStr}${pct}`);
    });
    try {
      await pipeline(stream, fs.createWriteStream(dest));
    } finally {
      process.stderr.write('\n');
    }
  }

  private extract(archivePath: string, destDir: string): void {
    const flag = archivePath.endsWith('.zip') ? '-xf' : '-xzf';
    cp.execFileSync('tar', [flag, archivePath, '-C', destDir], {
      stdio: 'inherit',
    });
  }

  public async ensureCliProxy(): Promise<void> {
    const asset = this.pickAsset();
    const url = `${RELEASE_BASE}/${asset}`;
    const archivePath = path.join(TOOLS_DIR, asset);
    const provider: BaseProvider = this.providerService.getProvider(
      args.activeProvider,
    );

    if (args.renew) {
      provider.clearStoredToken();
      this.renewFromArchive(archivePath);
      return;
    }

    if (
      fs.existsSync(TOOLS_DIR) &&
      fs.readdirSync(TOOLS_DIR).length > 0 &&
      !args.force
    ) {
      log('CLIProxyAPI already present at %s, skipping download', TOOLS_DIR);
      return;
    }

    if (args.force) {
      console.warn(
        `⚠️  --force set: re-downloading archive and overwriting extracted files in ${TOOLS_DIR}`,
      );
    }

    fs.mkdirSync(TOOLS_DIR, { recursive: true });

    if (!fs.existsSync(archivePath)) {
      console.error(`⬇️  Downloading from ${url}`);
      log('Downloading %s', url);
      await this.download(url, archivePath);
    } else {
      log('Archive already present, skipping download: %s', archivePath);
    }
    this.extract(archivePath, TOOLS_DIR);
    log('Installed CLIProxyAPI to %s', TOOLS_DIR);
    this.createConfig();
  }

  private renewFromArchive(archivePath: string): void {
    if (!fs.existsSync(archivePath)) {
      console.error(
        '❌ No archive at ' +
          archivePath +
          ' to renew from — run once without --renew to fetch it.',
      );
      process.exit(1);
    }

    const keep = new Set([path.basename(archivePath)]);
    for (const name of fs.readdirSync(TOOLS_DIR)) {
      if (keep.has(name)) continue;
      fs.rmSync(path.join(TOOLS_DIR, name), { recursive: true, force: true });
    }
    this.extract(archivePath, TOOLS_DIR);
    log('Renewed CLIProxyAPI from %s', archivePath);
    this.createConfig();
  }

  public createConfig(): void {
    const example = path.join(TOOLS_DIR, 'config.example.yaml');
    if (!fs.existsSync(example)) {
      console.error(`❌ Missing template: ${example}`);
      process.exit(1);
    }
    if (fs.existsSync(this.CONFIG_PATH)) return;
    fs.copyFileSync(example, this.CONFIG_PATH);
    log('Seeded %s from %s', this.CONFIG_PATH, example);
  }

  public async runCliProxy(proxyArgs: string[] = []): Promise<number> {
    this.yamlService.setProxyUrl(args.proxy);

    const argv = [BINARY_PATH, '-config', this.CONFIG_PATH, ...proxyArgs];
    log('Spawning: %s', argv.join(' '));
    const child = cp.spawn(argv[0], argv.slice(1), { stdio: 'inherit' });

    const forward = (sig: NodeJS.Signals) => () => child.kill(sig);
    process.on('SIGINT', forward('SIGINT'));
    process.on('SIGTERM', forward('SIGTERM'));
    process.on('exit', () => child.kill());

    return new Promise((resolve) =>
      child.on('exit', (code) => resolve(code ?? 0)),
    );
  }
}
