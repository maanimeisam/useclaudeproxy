import { Injectable, Logger } from '@nestjs/common';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { args } from '../../../config/args.js';
import { BaseProvider } from '../base-provider.abstract.js';
import { ConfigService } from '@nestjs/config';
import { Got } from 'got';
import { CommonService } from '../../common/common.service.js';
import { YamlService } from '../../yaml/yaml.service.js';
import { HttpService } from '../../http/http.service.js';

type Token = {
  key: string;
};

function generateRequestId(): string {
  return `msg_${crypto.randomUUID().replace(/-/g, '')}`;
}

function generateSessionId(): string {
  return `ses_${crypto.randomUUID().replace(/-/g, '')}`;
}

function toOpencodeSession(id: string | undefined | null): string | null {
  const stripped = String(id ?? '')
    .replace(/^ses_/, '')
    .replace(/-/g, '');
  return stripped ? `ses_${stripped}` : null;
}

function buildOpenCodeHeaders(sessionId?: string): Record<string, string> {
  const currentSession = toOpencodeSession(sessionId) ?? generateSessionId();
  return {
    'Content-Type': 'application/json',
    'User-Agent':
      'opencode/1.18.23 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14',
    'x-opencode-client': 'cli',
    'x-opencode-session': currentSession,
    'x-opencode-request': generateRequestId(),
    'x-opencode-project': 'global',
    accept: '*/*',
    'accept-encoding': 'gzip, deflate, br',
  };
}

@Injectable()
export class OpencodeService extends BaseProvider {
  readonly name = 'opencode';
  readonly baseUrl = 'https://opencode.ai/zen/v1';
  readonly logger = new Logger(OpencodeService.name);
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
      'opencode-tokens.json',
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

    api['headers'] = buildOpenCodeHeaders();

    const token = await this.getValidToken();
    this.setApiKey(token.key);

    this.yamlService.write(config);
  }

  async getValidToken(): Promise<Token> {
    if (fs.existsSync(this.tokenPath)) {
      const token = this.readStoredToken<Token>();
      if (token) return token;
    }

    const token: Token = {
      key: 'public',
    };
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

    this.logger.log(
      `Watching OpenCode provider at ${this.baseUrl} every ${WATCH_INTERVAL_MS}ms`,
    );
    while (!signal?.aborted) {
      try {
        const res = await this.httpClient.post(
          `${this.baseUrl}/chat/completions`,
          {
            headers: {
              ...buildOpenCodeHeaders(),
              Authorization: `Bearer ${token.key}`,
            },
            json: {
              model: args.model,
              messages: [{ role: 'user', content: 'ping' }],
              stream: false,
              max_tokens: 5,
              temperature: 0.5,
              reasoning_effort: 'low',
              stream_options: { include_usage: true },
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
        this.logger.log('OpenCode provider reachable');
      } catch (err) {
        this.logger.error(`OpenCode provider unavailable: ${err}`);
      }
      await this.commonService.sleep(WATCH_INTERVAL_MS, signal);
    }
  }
}
