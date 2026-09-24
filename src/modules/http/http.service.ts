import { Injectable, Logger } from '@nestjs/common';
import got, { type ExtendOptions, type Got } from 'got';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { args } from '../../config/args.js';

@Injectable()
export class HttpService {
  private readonly logger = new Logger(HttpService.name);

  public createHttpClient(): Got {
    this.logger.log(`Proxy=${args.proxy}`);

    const options: ExtendOptions = {
      https: { rejectUnauthorized: false },
      headers: { 'Content-Type': 'application/json' },
      retry: { limit: 0 },
      throwHttpErrors: false,
      timeout: { request: undefined },
      ...(args.proxy ? { agent: this.buildProxyAgents() } : {}),
    };

    return got.extend(options);
  }

  private buildProxyAgents() {
    const agentOptions = { keepAlive: true, keepAliveMsecs: 30_000 };

    return {
      http: new HttpProxyAgent(args.proxy, agentOptions),
      https: new HttpsProxyAgent(args.proxy, agentOptions),
    };
  }
}
