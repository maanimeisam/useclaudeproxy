import { Injectable, Logger } from '@nestjs/common';
import path from 'node:path';
import open from 'open';
import { BaseProvider, Token } from '../base-provider.abstract.js';
import { TokenResponse } from './hermes.interface.js';
import { HermesOAUTH } from './hermes-oauth.service.js';
import { ConfigService } from '@nestjs/config';
import { CommonService } from '../../common/common.service.js';
import { YamlService } from '../../yaml/yaml.service.js';

@Injectable()
export class HermesService extends BaseProvider {
  readonly logger = new Logger(HermesService.name);
  readonly name = 'hermes';
  readonly baseUrl = 'https://inference-api.nousresearch.com/v1';
  readonly tokenPath: string;

  constructor(
    private client: HermesOAUTH,
    protected yamlService: YamlService,
    private configService: ConfigService,
    private commonService: CommonService,
  ) {
    super(yamlService);

    this.tokenPath = path.join(
      configService.get('DATA_DIR')!,
      'hermes-tokens.json',
    );
  }

  buildUpstremHeaders(): Record<string, string> {
    return {
      'User-Agent': 'OpenAI/Python 2.24.0',
      'X-Stainless-Arch': 'x64',
      'X-Stainless-Async': 'false',
      'X-Stainless-Lang': 'python',
      'X-Stainless-Os': 'Linux',
      'X-Stainless-Package-Version': '2.24.0',
      'X-Stainless-Read-Timeout': '30.0',
      'X-Stainless-Retry-Count': '0',
      'X-Stainless-Runtime': 'CPython',
      'X-Stainless-Runtime-Version': '3.11.15',
    };
  }

  async initConfig(): Promise<void> {
    return this.setAsOpenAiCompatible();
  }

  async getValidToken(): Promise<Token<TokenResponse>> {
    const stored = this.readStoredToken<TokenResponse>();
    if (stored) {
      try {
        await this.client.fetchAccountInfo(stored.access_token);
        this.logger.log('Stored token valid');
        return { key: stored.access_token, upstreamData: stored };
      } catch (err) {
        this.logger.error(`Stored Access-Token invalid:`, err);
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
          this.logger.error('Stored Refresh-Token invalid:', err);
        }
      }
    }
    return this.runDeviceFlow();
  }

  async startTokenWatcher(signal?: AbortSignal): Promise<void> {
    const WATCH_INTERVAL_MS =
      this.configService.get<number>('WATCH_INTERVAL_MS')!;

    this.logger.log('Watching token every(ms):', WATCH_INTERVAL_MS);
    let current = (await this.getValidToken()).key;
    while (!signal?.aborted) {
      try {
        const _account = await this.client.fetchAccountInfo(current);
        // log("Account Information:", account);
        this.logger.log('Token valid');
      } catch (err) {
        this.logger.error('Token invalid, renewing:', err);
        const refreshed = await this.getValidToken();
        current = refreshed.key;
        this.logger.log(
          `Token RENEWED (expires_in=${refreshed.upstreamData.expires_in})`,
        );
      }
      await this.commonService.sleep(WATCH_INTERVAL_MS, signal);
    }
  }

  private async runDeviceFlow(): Promise<Token<TokenResponse>> {
    const deviceCode = await this.client.requestDeviceCode();
    this.logger.log('Device code received: user_code>>>', deviceCode.user_code);

    const verificationUrl =
      deviceCode.verification_uri_complete ?? deviceCode.verification_uri;

    await open(verificationUrl).catch((err) =>
      this.logger.log('Failed to open browser:', err),
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
