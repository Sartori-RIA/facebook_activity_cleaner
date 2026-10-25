import { AppError } from '../domain/errors.js';

export class UiError extends AppError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
