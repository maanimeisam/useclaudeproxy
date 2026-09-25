import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { args } from '../../../config/args.js';
import { BaseProvider, Token } from '../base-provider.abstract.js';
import { ConfigService } from '@nestjs/config';
import { Got } from 'got';
import { CommonService } from '../../common/common.service.js';
import { YamlService } from '../../yaml/yaml.service.js';
import { HttpService } from '../../http/http.service.js';

@Injectable()
export class CustomService extends BaseProvider {
  readonly logger = new Logger(CustomService.name);
  readonly name = 'custom';
  readonly baseUrl = args.url;
  public readonly tokenPath: string;
  private readonly httpClient: Got;

  constructor(
    protected yamlService: YamlService,
    private configService: ConfigService,
    private commonService: CommonService,
    private httpService: HttpService,
  ) {
    super(yamlService);

    this.httpClient = this.httpService.createHttpClient();
    this.tokenPath = path.join(
      configService.get('DATA_DIR')!,
      'custom-tokens.json',
    );
  }

  buildUpstremHeaders(): Record<string, string> {
    return {};
  }

  async initConfig(): Promise<void> {
    return this.setAsOpenAiCompatible();
  }

  async getValidToken(): Promise<Token> {
    if (fs.existsSync(this.tokenPath)) {
      const token = this.readStoredToken<Token>();
      if (token) return token;
    }

    const token: Token = { key: args.api, upstreamData: { key: args.api } };
    this.saveTokensAsFile(token);
    return token;
  }

  override saveTokensAsFile(token: Token): void {
    super.saveTokensAsFile(token.upstreamData);
    this.setOpenAiApiKey(token.key);
  }

  async startTokenWatcher(signal?: AbortSignal): Promise<void> {
    const WATCH_INTERVAL_MS =
      this.configService.get<number>('WATCH_INTERVAL_MS')!;
    const token = await this.getValidToken();

    this.logger.log(
      `Watching custom provider at ${this.baseUrl} every ${WATCH_INTERVAL_MS}ms`,
    );
    while (!signal?.aborted) {
      try {
        const res = await this.httpClient.post(
          `${this.baseUrl}/chat/completions`,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token.key}`,
              'User-Agent': 'curl/8.5.0',
            },
            json: {
              model: args.model,
              messages: [{ role: 'user', content: 'ping' }],
              stream: false,
              max_tokens: 10,
            },
            throwHttpErrors: false,
            retry: { limit: 0 },
            timeout: { request: 30_000 },
            https: { rejectUnauthorized: false },
          },
        );
        if (res.statusCode !== 200) {
          throw new Error(`StatusCode: ${res.statusCode}`);
        }
        this.logger.log('Custom provider reachable');
      } catch (err) {
        this.logger.error(`Custom provider unavailable: ${err}`);
      }
      await this.commonService.sleep(WATCH_INTERVAL_MS, signal);
    }
  }
}
