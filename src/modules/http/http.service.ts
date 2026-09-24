import { Injectable } from '@nestjs/common';
import Debug from 'debug';
import got, { type ExtendOptions, type Got } from 'got';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { args } from '../../config/args.js';

const log = Debug('app:proxy:upstream-client');

@Injectable()
export class HttpService {
  public createHttpClient(): Got {
    log('Proxy=%s', args.proxy);

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
