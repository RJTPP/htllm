export class ProviderError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class StorageError extends Error {
  constructor(
    public readonly store: string,
    public readonly operation: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class FitError extends Error {
  constructor(
    public readonly modelId: string,
    message: string,
  ) {
    super(message);
    this.name = 'FitError';
  }
}
