export type ErrorCode = 'server' | 'auth' | 'rate_limit' | 'too_large' | 'safety' | 'invalid_response' | 'timeout' | 'network' | 'not_connected'

export class ServiceError extends Error {
  constructor(
    public readonly status: 400 | 401 | 413 | 422 | 429 | 502 | 503 | 504,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}
