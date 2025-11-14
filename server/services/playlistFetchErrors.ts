/**
 * Custom error types for playlist fetch operations
 * Enables proper HTTP status code mapping in routes
 */

export class PlaylistValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistValidationError';
  }
}

export class PlaylistFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistFetchError';
  }
}
