import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Debug from 'debug';
import { CliproxyapiService } from './modules/cliproxyapi/cliproxyapi.service.js';
import { ProviderService } from './modules/providers/provider.service.js';
import { args } from './config/args.js';

const log = Debug('useclaudeproxy:AppService');
const errorLog = Debug('useclaudeproxy:AppService:error');

@Injectable()
export class AppService {
  constructor(
    private configService: ConfigService,
    private cliproxyapiService: CliproxyapiService,
    private providerService: ProviderService,
  ) {}

  public async run(): Promise<void> {
    const config = {
      NODE_ENV: this.configService.get<string>('NODE_ENV'),
      DEBUG: this.configService.get<string>('DEBUG'),
    };

    log('Enviroment: %s', config.NODE_ENV);
    if (config.NODE_ENV === 'development' && config.DEBUG)
      Debug.enable(config.DEBUG);

    const provider = this.providerService.getProvider(args.activeProvider);

    await this.cliproxyapiService.ensureCliProxy();

    if (args.renew) {
      process.exit(0);
    }

    await provider.initConfig();

    provider.logConfigInfo();

    this.cliproxyapiService
      .runCliProxy()
      .then((code) => process.exit(code))
      .catch((err) => {
        errorLog('Failed to run CLIProxyAPI: %o', err);
        process.exit(1);
      });

    const shutdown = new AbortController();

    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.on(sig, () => shutdown.abort());
    }

    await provider.startTokenWatcher(shutdown.signal);
  }
}
