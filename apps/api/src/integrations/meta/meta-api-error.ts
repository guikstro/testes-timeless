/**
 * Meta's Graph API error shape: `{ error: { message, type, code,
 * error_subcode, fbtrace_id } }`. Code 190 = expired/invalid token; codes
 * 4/17/32/613 (and HTTP 429) = rate limiting — see
 * https://developers.facebook.com/docs/graph-api/guides/error-handling.
 */
export class MetaApiError extends Error {
  constructor(
    public readonly code: number | undefined,
    public readonly subcode: number | undefined,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }

  get isTokenExpired(): boolean {
    return this.code === 190;
  }

  get isRateLimited(): boolean {
    return this.httpStatus === 429 || [4, 17, 32, 613].includes(this.code ?? -1);
  }
}
