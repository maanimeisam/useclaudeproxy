import { Got } from 'got';
import { FORM_HEADERS } from '../../../config/configuration.js';
import { AccountInfo, AccessDeniedError } from '../../../types.global.js';
import {
  DeviceCodeResponse,
  TokenResponse,
  TokenErrorResponse,
} from './hermes.interface.js';
import { OAuthHttpError, DeviceCodeExpiredError, parseBody } from './shared.js';
import { HttpService } from '../../http/http.service.js';
import { CommonService } from '../../common/common.service.js';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class HermesOAUTH {
  private readonly httpClient: Got;
  private readonly logger = new Logger(HermesOAUTH.name);
  private readonly OAUTH = {
    baseUrl: 'https://portal.nousresearch.com/api/oauth',
    clientId: 'hermes-cli',
    scope: 'inference:invoke',
    grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    refreshTokenHeader: 'X-Nous-Refresh-Token',
  };
  private pollIntervalMs = 7000;

  constructor(
    private readonly httpService: HttpService,
    private commonService: CommonService,
  ) {
    this.httpClient = this.httpService.createHttpClient();
  }

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    this.logger.log('Requesting device code');
    const response = await this.httpClient.post(
      `${this.OAUTH.baseUrl}/device/code`,
      {
        headers: FORM_HEADERS,
        body: `client_id=${this.OAUTH.clientId}&scope=${encodeURIComponent(this.OAUTH.scope)}`,
      },
    );
    return this.parseOrThrow<DeviceCodeResponse>(
      response,
      'Failed to get device code',
    );
  }

  async pollForToken(deviceCode: string): Promise<TokenResponse> {
    this.logger.log('Polling for token');
    while (true) {
      await this.commonService.sleep(this.pollIntervalMs);
      const response = await this.httpClient.post(
        `${this.OAUTH.baseUrl}/token`,
        {
          headers: FORM_HEADERS,
          body: `grant_type=${this.OAUTH.grantType}&client_id=${this.OAUTH.clientId}&device_code=${deviceCode}`,
        },
      );
      if (response.statusCode === 200)
        return parseBody<TokenResponse>(response);
      if (response.statusCode === 400) {
        this.handlePollingError(parseBody<TokenErrorResponse>(response));
        continue;
      }
      throw new OAuthHttpError(
        `Unexpected status during polling: ${response.statusCode}`,
        response.statusCode,
        response.body,
      );
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    this.logger.log('Refreshing access token');
    const response = await this.httpClient.post(`${this.OAUTH.baseUrl}/token`, {
      headers: {
        ...FORM_HEADERS,
        [this.OAUTH.refreshTokenHeader]: refreshToken,
      },
      body: `grant_type=refresh_token&client_id=${this.OAUTH.clientId}`,
    });
    return this.parseOrThrow<TokenResponse>(
      response,
      'Failed to refresh token',
    );
  }

  async fetchAccountInfo(accessToken: string): Promise<AccountInfo> {
    this.logger.log('Fetching account information');
    const response = await this.httpClient.get(
      `${this.OAUTH.baseUrl}/account`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );
    return this.parseOrThrow<AccountInfo>(
      response,
      'Failed to fetch account info',
    );
  }

  private handlePollingError(error: TokenErrorResponse): void {
    switch (error.error) {
      case 'authorization_pending':
      case 'slow_down':
        return;
      case 'expired_token':
        throw new DeviceCodeExpiredError();
      case 'access_denied':
        throw new AccessDeniedError();
      default:
        throw new OAuthHttpError(
          `Unexpected polling error: ${error.error}`,
          400,
          error,
        );
    }
  }

  private parseOrThrow<T>(
    response: { statusCode: number; body: unknown },
    failureMessage: string,
  ): T {
    if (response.statusCode !== 200) {
      throw new OAuthHttpError(
        failureMessage,
        response.statusCode,
        response.body,
      );
    }
    return parseBody<T>(response);
  }
}
