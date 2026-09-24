import { Injectable, Logger } from '@nestjs/common';
import path from 'node:path';
import open from 'open';
import { args } from '../../../config/args.js';
import { BaseProvider } from '../base-provider.abstract.js';
import { ClineOAUTH } from './cline-oauth.service.js';
import { YamlService } from '../../yaml/yaml.service.js';
import { ConfigService } from '@nestjs/config';
import { TokenResponse } from './cline.interface.js';
import { generateTaskId } from './shared.js';
import { CommonService } from '../../common/common.service.js';

@Injectable()
export class ClineService extends BaseProvider {
  public readonly name = 'cline';
  public readonly baseUrl = 'https://api.cline.bot/api/v1';
  readonly logger = new Logger(ClineService.name);
  public readonly tokenPath: string;

  constructor(
    private client: ClineOAUTH,
    protected yamlService: YamlService,
    private configService: ConfigService,
    private commonService: CommonService,
  ) {
    super(yamlService);

    this.tokenPath = path.join(
      configService.get('DATA_DIR')!,
      'cline-tokens.json',
    );
  }

  async initConfig(): Promise<void> {
    const config = this.yamlService.read();

    config['host'] = args.host;
    config['port'] = args.port;
    config['api-keys'] = [args.cliKey];
    config['openai-compatibility'] = [{ name: this.name }];

    const api = config['openai-compatibility'][0];
    api['base-url'] = this.baseUrl;
    api['models'] = [
      { name: args.model, alias: 'claude-opus-5' },
      { name: args.model, alias: '' },
    ];

    api['headers'] = {
      'Content-Type': 'application/json',
      'Http-Referer': 'https://cline.bot',
      'User-Agent':
        'Cline/3.0.65 ai-sdk/openai-compatible/3.0.37 ai-sdk/provider-utils/5.0.30 runtime/bun/1.3.13',
      'X-Client-Type': 'cline-cli',
      'X-Client-Version': '3.0.65',
      'X-Core-Version': '0.0.86',
      'X-Is-Multiroot': 'false',
      'X-Platform': 'cli',
      'X-Platform-Version': '3.0.65',
      'X-Task-Id': generateTaskId(),
      'X-Title': 'Cline',
      Accept: '*/*',
      'Accept-Language': '*',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
    };

    api['disable-cooling'] = true;

    const token = await this.getValidToken();
    this.setApiKey(token.access_token);

    this.yamlService.write(config);
  }

  async getValidToken(): Promise<TokenResponse> {
    const stored = this.readStoredToken<TokenResponse>();
    if (stored) {
      try {
        await this.client.fetchAccountInfo(stored.access_token);
        this.logger.log('Stored token valid');
        return stored;
      } catch (err) {
        this.logger.error(`Stored Access-Token invalid: ${err}`);
      }
      if (stored.refresh_token) {
        try {
          this.logger.log('Refreshing stored token');
          const refreshed = await this.client.refreshToken(
            stored.refresh_token,
          );
          this.saveTokens(refreshed);
          return refreshed;
        } catch (err) {
          this.logger.error(`Stored Refresh-Token invalid: ${err}`);
        }
      }
    }
    return this.runDeviceFlow();
  }

  async startTokenWatcher(signal?: AbortSignal): Promise<void> {
    const WATCH_INTERVAL_MS =
      this.configService.get<number>('WATCH_INTERVAL_MS')!;

    this.logger.log(`Watching token every ${WATCH_INTERVAL_MS}ms`);
    let current = (await this.getValidToken()).access_token;

    while (!signal?.aborted) {
      try {
        await this.client.fetchAccountInfo(current);
        this.logger.log('Token valid');
      } catch (err) {
        this.logger.error(`Token invalid, renewing: ${err}`);
        const refreshed = await this.getValidToken();
        current = refreshed.access_token;
        this.logger.log('Token RENEWED');
      }
      await this.commonService.sleep(WATCH_INTERVAL_MS, signal);
    }
  }

  private async runDeviceFlow(): Promise<TokenResponse> {
    const deviceCode = await this.client.requestDeviceCode();
    this.logger.log(`Device code received: user_code=${deviceCode.user_code}`);

    const verificationUrl =
      deviceCode.verification_uri_complete ?? deviceCode.verification_uri;

    await open(verificationUrl).catch((err) =>
      this.logger.log(`Failed to open browser: ${err}`),
    );

    console.log(
      `Opened ${verificationUrl}. If it didn't open, enter code ${deviceCode.user_code} there.`,
    );

    const token = await this.client.pollForToken(deviceCode.device_code);
    this.logger.log('Authorization successful');
    this.saveTokens(token);
    return token;
  }

  override saveTokens(token: TokenResponse): void {
    super.saveTokens(token);
    this.setApiKey(token.access_token);
  }
}
