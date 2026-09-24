import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CliproxyapiService } from './modules/cliproxyapi/cliproxyapi.service.js';
import { ProviderService } from './modules/providers/provider.service.js';
import { args } from './config/args.js';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

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

    this.logger.log(`Enviroment: ${config.NODE_ENV}`);
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
        this.logger.error('Failed to run CLIProxyAPI:', err);
        process.exit(1);
      });

    const shutdown = new AbortController();

    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.on(sig, () => shutdown.abort());
    }

    await provider.startTokenWatcher(shutdown.signal);
  }
}
