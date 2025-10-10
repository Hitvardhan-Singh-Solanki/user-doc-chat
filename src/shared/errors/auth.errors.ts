/**
 * Custom error types for Authentication
 */

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

export class UserNotFoundError extends AuthenticationError {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}

export class InvalidPasswordHashError extends AuthenticationError {
  constructor() {
    super('Invalid password hash');
    this.name = 'InvalidPasswordHashError';
  }
}
