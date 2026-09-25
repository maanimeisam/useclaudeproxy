export class OAuthHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'OAuthHttpError';
  }
}

export class DeviceCodeExpiredError extends Error {
  constructor() {
    super('Device code expired before authorization completed');
    this.name = 'DeviceCodeExpiredError';
  }
}

export function parseBody<T>(response: { body: unknown }): T {
  return typeof response.body === 'string'
    ? JSON.parse(response.body)
    : (response.body as T);
}
