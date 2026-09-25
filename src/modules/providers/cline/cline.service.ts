import { Injectable, Logger } from '@nestjs/common';
import path from 'node:path';
import open from 'open';
import { BaseProvider, Token } from '../base-provider.abstract.js';
import { ClineOAUTH } from './cline-oauth.service.js';
import { YamlService } from '../../yaml/yaml.service.js';
import { ConfigService } from '@nestjs/config';
import { TokenResponse } from './cline.interface.js';
import { CommonService } from '../../common/common.service.js';
import crypto from 'node:crypto';

@Injectable()
export class ClineService extends BaseProvider {
  readonly logger = new Logger(ClineService.name);
  public readonly name = 'cline';
  public readonly baseUrl = 'https://api.cline.bot/api/v1';
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

  private generateTaskId(): string {
    return `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  buildUpstremHeaders(): Record<string, string> {
    return {
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
      'X-Task-Id': this.generateTaskId(),
      'X-Title': 'Cline',
      Accept: '*/*',
      'Accept-Language': '*',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
    };
  }

  async initConfig(): Promise<void> {
    return this.setAsOpenAiCompatible();
  }

  async getValidToken(): Promise<Token> {
    const stored = this.readStoredToken<TokenResponse>();
    if (stored) {
      try {
        await this.client.fetchAccountInfo(stored.access_token);
        this.logger.log('Stored token valid');
        return { key: stored.access_token, upstreamData: stored };
      } catch (err) {
        this.logger.error(`Stored Access-Token invalid: ${err}`);
      }

      if (stored.refresh_token) {
        try {
          this.logger.log('Refreshing stored token');
          const refreshed = await this.client.refreshToken(
            stored.refresh_token,
          );
          this.saveTokensAsFile(refreshed);
          return { key: refreshed.access_token, upstreamData: refreshed };
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
    let current = (await this.getValidToken()).key;

    while (!signal?.aborted) {
      try {
        await this.client.fetchAccountInfo(current);
        this.logger.log('Token valid');
      } catch (err) {
        this.logger.error(`Token invalid, renewing: ${err}`);
        const refreshed = await this.getValidToken();
        current = refreshed.key;
        this.logger.log('Token RENEWED');
      }
      await this.commonService.sleep(WATCH_INTERVAL_MS, signal);
    }
  }

  private async runDeviceFlow(): Promise<Token> {
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

    const result = await this.client.pollForToken(deviceCode.device_code);
    const token = { key: result.access_token, upstreamData: result };
    this.logger.log('Authorization successful');
    this.saveTokensAsFile(result);
    return token;
  }

  override saveTokensAsFile(token: TokenResponse): void {
    super.saveTokensAsFile(token);
    this.setOpenAiApiKey(token.access_token);
  }
}
