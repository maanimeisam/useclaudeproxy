import { Logger } from '@nestjs/common';
import fs from 'node:fs';
import { YamlService } from '../yaml/yaml.service.js';
import { args } from '../../config/args.js';

export abstract class BaseProvider {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly tokenPath: string;
  abstract readonly logger: Logger;

  constructor(protected yamlService: YamlService) {}

  abstract initConfig(): Promise<void>;
  abstract getValidToken(): Promise<unknown>;
  abstract startTokenWatcher(signal?: AbortSignal): Promise<void>;

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

  saveTokens(token: unknown): void {
    fs.writeFileSync(this.tokenPath, JSON.stringify(token, null, 2), {
      mode: 0o600,
    });
  }

  setApiKey(apiKey: string): void {
    const config = this.yamlService.read();
    const api = config['openai-compatibility'][0];

    api['api-key-entries'] = [{ 'api-key': apiKey }];
    api['headers']['Authorization'] = `Bearer ${apiKey}`;

    this.yamlService.write(config);
  }
}
