export interface AuthenticationResult {
  success: boolean;
  userId?: string;
  error?: string;
  tokenExp?: number;
}

export interface TokenValidationResult {
  isValid: boolean;
  userId?: string;
  error?: string;
  tokenExp?: number;
}

export interface AuthenticationService {
  validateToken(token: string): Promise<TokenValidationResult>;
  extractUserId(decoded: AuthDecodedToken): string | undefined;
  authenticateSocket(
    socket: unknown,
    userId: string,
    decoded: AuthJwtPayload,
  ): void;
}

export interface AuthDecodedToken {
  sub?: string;
  id?: string;
  userId?: string;
  iat?: number;
  exp?: number;
}

export interface AuthJwtPayload {
  sub: string;
  email: string;
  role?: string;
  id?: string;
  userId?: string;
  exp?: number;
}

export interface AuthenticationError {
  code: string;
  message: string;
  statusCode: number;
}

export interface TokenExtractionResult {
  token?: string;
  source: 'header' | 'auth' | 'none';
}

export interface LegacyTokenHandler {
  handleLegacyToken(decoded: AuthLegacyTokenData): string | undefined;
}

export interface AuthLegacyTokenData {
  id?: string;
  userId?: string;
  iat?: number;
  exp?: number;
}
