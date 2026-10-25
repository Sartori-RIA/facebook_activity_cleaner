export class AppError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class FacebookUiNotValidatedError extends AppError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class IllegalStateTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(`Cannot move an activity from ${from} to ${to}.`, 2);
  }
}

export class ConfirmationRequiredError extends AppError {
  readonly expectedPhrase: string;

  constructor(expectedPhrase: string) {
    super(`Deletion stays blocked until you pass --execute and --confirm "${expectedPhrase}".`, 2);
    this.expectedPhrase = expectedPhrase;
  }
}

export class ProtectionOverrideError extends AppError {
  constructor(activityId: string) {
    super(
      `Activity ${activityId} is explicitly protected. Manual approval cannot override that rule.`,
      2,
    );
  }
}

export class SetChangedError extends AppError {
  constructor() {
    super(
      'The eligible set changed before deletion started. Nothing was deleted. Run preview again and confirm the new set.',
      2,
    );
  }
}
