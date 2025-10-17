import { verifyJwt } from '@utils/jwt';
import { logger } from '@config/logger.config';
import type {
  TokenValidationResult,
  TokenExtractionResult,
  AuthDecodedToken,
  AuthLegacyTokenData,
  AuthJwtPayload,
  AuthenticationError,
} from '@shared/types';

export class WebSocketAuthenticationService {
  private readonly log = logger.child({
    component: 'WebSocketAuthenticationService',
  });

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const decoded = verifyJwt(token);
      if (!decoded) {
        return {
          isValid: false,
          error: 'Invalid token',
        };
      }

      const userId = this.extractUserId(decoded);
      if (!userId) {
        return {
          isValid: false,
          error: 'Missing user ID in token',
        };
      }

      return {
        isValid: true,
        userId,
        tokenExp: decoded.exp,
      };
    } catch (error) {
      this.log.error({ error }, 'Token validation failed');
      return {
        isValid: false,
        error: 'Token validation failed',
      };
    }
  }

  extractToken(socket: {
    handshake: {
      headers: { authorization?: string };
      auth?: { token?: string };
    };
  }): TokenExtractionResult {
    const authHeader = socket.handshake.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      return {
        token: authHeader.substring(7),
        source: 'header',
      };
    }

    const token = socket.handshake.auth?.token;
    if (token) {
      this.log.warn(
        'Using deprecated auth object for WebSocket token. Please use Authorization header instead.',
      );
      return {
        token,
        source: 'auth',
      };
    }

    return {
      source: 'none',
    };
  }

  extractUserId(decoded: AuthDecodedToken): string | undefined {
    let userId = decoded.sub;

    if (!userId) {
      userId = this.handleLegacyToken(decoded as AuthLegacyTokenData);
    }

    return userId;
  }

  private handleLegacyToken(decoded: AuthLegacyTokenData): string | undefined {
    const legacyId = decoded.id ?? decoded.userId;

    if (legacyId) {
      this.log.warn(
        {
          legacyClaim: decoded.id ? 'id' : 'userId',
          tokenIssuedAt: decoded.iat,
          tokenExpiresAt: decoded.exp,
        },
        'Using legacy JWT claim for user identification. Please re-authenticate to receive RFC-7519 compliant token.',
      );
    }

    return legacyId;
  }

  authenticateSocket(
    socket: unknown,
    userId: string,
    decoded: AuthJwtPayload,
  ): void {
    const authenticatedSocket = socket as AuthenticatedSocket;
    authenticatedSocket.userId = String(userId);
    authenticatedSocket.decoded = decoded;
    authenticatedSocket.tokenExp = decoded.exp;

    this.log.info(
      {
        userId,
        ip: (socket as { handshake: { address: string } }).handshake.address,
      },
      'WebSocket authentication successful',
    );
  }

  createAuthenticationError(
    message: string,
    code: string = 'AUTH_ERROR',
  ): AuthenticationError {
    return {
      code,
      message,
      statusCode: 401,
    };
  }
}

interface AuthenticatedSocket {
  userId: string;
  decoded: AuthJwtPayload;
  tokenExp?: number;
}
