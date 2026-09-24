import { Injectable, Logger } from '@nestjs/common';
import { Got } from 'got';
import { FORM_HEADERS } from '../../../config/configuration.js';
import { HttpService } from '../../http/http.service.js';
import {
  DeviceCodeResponse,
  TokenResponse,
  TokenErrorResponse,
} from './cline.interface.js';
import { CommonService } from '../../common/common.service.js';
import { DeviceCodeExpiredError, OAuthHttpError, parseBody } from './shared.js';
import { AccessDeniedError, AccountInfo } from '../../../types.global.js';

@Injectable()
export class ClineOAUTH {
  private readonly http: Got;
  private readonly logger = new Logger(ClineOAUTH.name);
  private readonly OAUTH = {
    deviceCodeUrl: 'https://api.workos.com/user_management/authorize/device',
    authenticateUrl: 'https://api.workos.com/user_management/authenticate',
    clientId: 'client_01K3A541FN8TA3EPPHTD2325AR',
    grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    verifyUrl: 'https://api.cline.bot/api/v1/users/me/remote-config',
  };
  private pollIntervalMs = 7000;

  constructor(
    private readonly httpService: HttpService,
    private commonService: CommonService,
  ) {
    this.http = this.httpService.createHttpClient();
  }

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    this.logger.log('Requesting device code');
    const response = await this.http.post(this.OAUTH.deviceCodeUrl, {
      headers: FORM_HEADERS,
      body: `client_id=${this.OAUTH.clientId}`,
    });
    const deviceCode = this.parseOrThrow<DeviceCodeResponse>(
      response,
      'Failed to get device code',
    );
    this.pollIntervalMs = (deviceCode.interval || 7) * 1000;
    return deviceCode;
  }

  async pollForToken(deviceCode: string): Promise<TokenResponse> {
    this.logger.log('Polling for token');
    while (true) {
      await this.commonService.sleep(this.pollIntervalMs);
      const response = await this.http.post(this.OAUTH.authenticateUrl, {
        headers: FORM_HEADERS,
        body: `grant_type=${encodeURIComponent(this.OAUTH.grantType)}&device_code=${deviceCode}&client_id=${this.OAUTH.clientId}`,
      });

      if (response.statusCode === 200) {
        const data = parseBody<TokenResponse>(response);
        data.access_token = `workos:${data.access_token}`;
        return data;
      }

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
    const response = await this.http.post(this.OAUTH.authenticateUrl, {
      headers: FORM_HEADERS,
      body: `grant_type=refresh_token&client_id=${this.OAUTH.clientId}&refresh_token=${refreshToken}`,
    });
    const data = this.parseOrThrow<TokenResponse>(
      response,
      'Failed to refresh token',
    );
    data.access_token = `workos:${data.access_token}`;
    return data;
  }

  async fetchAccountInfo(accessToken: string): Promise<AccountInfo> {
    this.logger.log('Verifying access token');
    const response = await this.http.get(this.OAUTH.verifyUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: '*/*',
        'User-Agent': 'Bun/1.3.13',
      },
    });
    const parsed = this.parseOrThrow<{ data: unknown; success: boolean }>(
      response,
      'Failed to verify access token',
    );
    if (!parsed.success) {
      throw new OAuthHttpError(
        'Access token invalid (remote-config success=false)',
        response.statusCode,
        parsed,
      );
    }
    return parsed as AccountInfo;
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
