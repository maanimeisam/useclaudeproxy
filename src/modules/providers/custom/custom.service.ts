import { Injectable } from '@nestjs/common';
import Debug from 'debug';
import fs from 'node:fs';
import path from 'node:path';
import { args } from '../../../config/args.js';
import { BaseProvider } from '../base-provider.abstract.js';
import { ConfigService } from '@nestjs/config';
import { Got } from 'got';
import { CommonService } from '../../common/common.service.js';
import { YamlService } from '../../yaml/yaml.service.js';
import { HttpService } from '../../http/http.service.js';

const log = Debug('useclaudeproxy:custom');
const errorLog = Debug('useclaudeproxy:custom:error');

type Token = {
  key: string;
};

@Injectable()
export class CustomService extends BaseProvider {
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
    api['disable-cooling'] = true;

    api['headers'] = {};

    const token = await this.getValidToken();
    this.setApiKey(token.key);

    this.yamlService.write(config);
  }

  async getValidToken(): Promise<Token> {
    if (fs.existsSync(this.tokenPath)) {
      const token = this.readStoredToken<Token>();
      if (token) return token;
    }

    const token: Token = { key: args.api };
    this.saveTokens(token);
    return token;
  }

  override saveTokens(token: Token): void {
    super.saveTokens(token);
    this.setApiKey(token.key);
  }

  async startTokenWatcher(signal?: AbortSignal): Promise<void> {
    const WATCH_INTERVAL_MS =
      this.configService.get<number>('WATCH_INTERVAL_MS')!;
    const token = await this.getValidToken();

    log(
      'Watching custom provider at %s every %dms',
      this.baseUrl,
      WATCH_INTERVAL_MS,
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
        log('Custom provider reachable');
      } catch (err) {
        errorLog('Custom provider unavailable: %o', err);
      }
      await this.commonService.sleep(WATCH_INTERVAL_MS, signal);
    }
  }
}
