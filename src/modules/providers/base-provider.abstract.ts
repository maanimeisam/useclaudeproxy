import { Logger } from '@nestjs/common';
import fs from 'node:fs';
import { YamlService } from '../yaml/yaml.service.js';
import { args } from '../../config/args.js';

export type Token<T = unknown> = {
  key: string;
  upstreamData: T;
};

export const ALL_API_ACCESS = [
  'openai-compatibility',
  'gemini-api-key',
  'codex-api-key',
] as const;
export type ApiAccess = (typeof ALL_API_ACCESS)[number];

export abstract class BaseProvider {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly tokenPath: string;
  abstract readonly logger: Logger;

  constructor(protected yamlService: YamlService) {}

  abstract initConfig(): Promise<void>;
  abstract getValidToken(): Promise<Token>;
  abstract startTokenWatcher(signal?: AbortSignal): Promise<void>;
  abstract buildUpstremHeaders(): Record<string, string>;

  logConfigInfo() {
    const config = this.yamlService.read();

    const text = `
    #API-KEY: ${config['api-keys']}
    OpenAI-compatible: http://${config['host']}:${config['port']}/v1
    Anthropic-compatible: http://${config['host']}:${config['port']}
    Gemini-compatible: http://${config['host']}:${config['port']}

    Model >>> Alias:
        ${args.model} >>> claude-opus-5
        ${args.model} >>> ${args.model}

    [ClaudeCode]
    export ANTHROPIC_MODEL=claude-opus-5
    export ANTHROPIC_BASE_URL=http://${config['host']}:${config['port']}
    export ANTHROPIC_AUTH_TOKEN=${config['api-keys']}
    `;

    console.log(text);
  }

  readStoredToken<T>(): T | undefined {
    if (!fs.existsSync(this.tokenPath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(this.tokenPath, 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  clearStoredToken(): void {
    fs.rmSync(args.dataDir, {
      recursive: true,
      force: true,
    });

    this.logger.log('Cleared stored token');
  }

  saveTokensAsFile(token: Token['upstreamData']): void {
    fs.writeFileSync(this.tokenPath, JSON.stringify(token, null, 2), {
      mode: 0o600,
    });
  }

  removeAllExcept(value: ApiAccess) {
    const config = this.yamlService.read();
    ALL_API_ACCESS.forEach((key) => {
      if (key === value) return;
      delete config[key];
    });

    this.yamlService.write(config);
  }

  setOpenAiApiKey(apiKey: string): void {
    const apiAccess = 'openai-compatibility';
    const config = this.yamlService.read();
    if (!config[apiAccess]) {
      this.logger.warn('empty config!');
      return;
    }

    const api = config[apiAccess][0];
    api['api-key-entries'] = [{ 'api-key': apiKey }];
    api['headers']['Authorization'] = `Bearer ${apiKey}`;

    this.yamlService.write(config);
  }

  setGeminiApiKey(apiKey: string): void {
    const apiAccess = 'gemini-api-key';
    const config = this.yamlService.read();
    if (!config[apiAccess]) {
      this.logger.warn('empty config!');
      return;
    }

    const api = config[apiAccess][0];
    api['api-key'] = apiKey;
    api['headers']['Authorization'] = `Bearer ${apiKey}`;

    this.yamlService.write(config);
  }

  setCodexApiKey(apiKey: string): void {
    const apiAccess = 'codex-api-key';
    const config = this.yamlService.read();
    if (!config[apiAccess]) {
      this.logger.warn('empty config!');
      return;
    }

    const api = config[apiAccess][0];
    api['api-key'] = apiKey;
    api['headers']['Authorization'] = `Bearer ${apiKey}`;

    this.yamlService.write(config);
  }

  protected async setAsOpenAiCompatible(): Promise<void> {
    const apiAccess = 'openai-compatibility';
    this.removeAllExcept(apiAccess);

    const token = await this.getValidToken();

    const config = this.yamlService.read();
    config['host'] = args.host;
    config['port'] = args.port;
    config['api-keys'] = [args.cliKey];
    config[apiAccess] = [{ name: this.name }];

    const api = config[apiAccess][0];
    api['base-url'] = this.baseUrl;
    api['models'] = [
      { name: args.model, alias: 'claude-opus-5' },
      { name: args.model, alias: '' },
    ];
    api['disable-cooling'] = true;
    api['headers'] = this.buildUpstremHeaders();

    this.setOpenAiApiKey(token.key);

    this.yamlService.write(config);
  }

  protected async setAsGeminiCompatible(): Promise<void> {
    const apiAccess = 'gemini-api-key';
    this.removeAllExcept(apiAccess);

    const token = await this.getValidToken();

    const config = this.yamlService.read();
    config['host'] = args.host;
    config['port'] = args.port;
    config['api-keys'] = [args.cliKey];
    config[apiAccess] = [{ 'api-key': token.key }];

    const api = config[apiAccess][0];
    api['base-url'] = new URL(this.baseUrl).origin;
    api['models'] = [
      { name: args.model, alias: 'claude-opus-5' },
      { name: args.model, alias: '' },
    ];
    api['disable-cooling'] = true;
    api['headers'] = this.buildUpstremHeaders();

    this.setGeminiApiKey(token.key);

    this.yamlService.write(config);
  }

  protected async setAsCodexCompatible(): Promise<void> {
    const apiAccess = 'codex-api-key';
    this.removeAllExcept(apiAccess);

    const token = await this.getValidToken();

    const config = this.yamlService.read();
    config['host'] = args.host;
    config['port'] = args.port;
    config['api-keys'] = [args.cliKey];
    config[apiAccess] = [{ 'api-key': token.key }];

    const api = config[apiAccess][0];
    api['base-url'] = new URL(this.baseUrl).origin;
    api['models'] = [
      { name: args.model, alias: 'claude-opus-5' },
      { name: args.model, alias: '' },
    ];
    api['disable-cooling'] = true;
    api['headers'] = this.buildUpstremHeaders();

    this.setCodexApiKey(token.key);

    this.yamlService.write(config);
  }
}
