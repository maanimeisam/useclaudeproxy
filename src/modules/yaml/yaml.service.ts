import { Injectable } from '@nestjs/common';
import fs from 'node:fs';
import YAML from 'yaml';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class YamlService {
  private cache: Record<string, any> | undefined;
  public readonly configPath: string;

  constructor(private configService: ConfigService) {
    this.configPath = this.configService.get<string>('YAML_CONFIG_PATH')!;
  }

  read(filePath: string = this.configPath): Record<string, any> {
    if (!this.cache) {
      this.cache = (YAML.parse(fs.readFileSync(filePath, 'utf8')) ??
        {}) as Record<string, any>;
    }
    return this.cache;
  }

  write(config: Record<string, any>, filePath: string = this.configPath): void {
    fs.writeFileSync(filePath, YAML.stringify(config), 'utf8');
    this.cache = config;
  }

  setProxyUrl(proxyUrl: string): void {
    const url = proxyUrl.trim();
    const PROXY_RE = /^(socks5|http|https):\/\//i;

    if (url !== '' && !/^(direct|none)$/i.test(url) && !PROXY_RE.test(url)) {
      throw new Error(
        `Invalid proxy-url: ${url} (use http/https/socks5://..., "direct", "none", or "")`,
      );
    }

    const config = this.read();
    config['proxy-url'] = url;
    this.write(config);
  }
}
