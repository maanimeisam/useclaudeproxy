import { Logger } from '@nestjs/common';
import fs from 'node:fs';
import { YamlService } from '../yaml/yaml.service.js';
import { args } from '../../config/args.js';

export type Token<T = unknown> = {
  key: string;
  upstreamData: T;
};

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

  setOpenAiApiKey(apiKey: string): void {
    const config = this.yamlService.read();
    if (!config['openai-compatibility']) {
      this.logger.warn('empty config!');
      return;
    }

    const api = config['openai-compatibility'][0];
    api['api-key-entries'] = [{ 'api-key': apiKey }];
    api['headers']['Authorization'] = `Bearer ${apiKey}`;

    this.yamlService.write(config);
  }

  setGeminiApiKey(apiKey: string): void {
    const config = this.yamlService.read();
    if (!config['gemini-api-key']) {
      this.logger.warn('empty config!');
      return;
    }

    const api = config['gemini-api-key'][0];
    api['api-key'] = apiKey;
    api['headers']['Authorization'] = `Bearer ${apiKey}`;

    this.yamlService.write(config);
  }

  setCodexApiKey(apiKey: string): void {
    const config = this.yamlService.read();
    if (!config['codex-api-key']) {
      this.logger.warn('empty config!');
      return;
    }

    const api = config['codex-api-key'][0];
    api['api-key'] = apiKey;
    api['headers']['Authorization'] = `Bearer ${apiKey}`;

    this.yamlService.write(config);
  }

  protected async setAsOpenAiCompatible(): Promise<void> {
    const token = await this.getValidToken();

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
    api['headers'] = this.buildUpstremHeaders();

    this.setOpenAiApiKey(token.key);

    this.yamlService.write(config);
  }

  protected async setAsGeminiCompatible(): Promise<void> {
    const token = await this.getValidToken();

    const config = this.yamlService.read();
    config['host'] = args.host;
    config['port'] = args.port;
    config['api-keys'] = [args.cliKey];
    config['gemini-api-key'] = [{ 'api-key': token.key }];

    const api = config['gemini-api-key'][0];
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
    const token = await this.getValidToken();

    const config = this.yamlService.read();
    config['host'] = args.host;
    config['port'] = args.port;
    config['api-keys'] = [args.cliKey];
    config['codex-api-key'] = [{ 'api-key': token.key }];

    const api = config['codex-api-key'][0];
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
