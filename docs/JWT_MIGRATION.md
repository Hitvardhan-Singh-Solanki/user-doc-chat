# JWT Token Standardization Migration

## Overview

This document describes the migration from custom JWT claim names to RFC-7519 compliant JWT tokens. The system has been updated to use the standard `sub` (subject) claim for user identification instead of custom claims like `userId` and `id`.

## Changes Made

### 1. JWT Token Structure

**Before:**
```json
{
  "userId": "user-123",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**After:**
```json
{
  "sub": "user-123",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### 2. Updated Components

#### JWT Types (`src/shared/types/index.ts`)
- Updated `JwtPayload` interface to use `sub` as the primary claim
- Added legacy claims (`id`, `userId`) as optional for migration support

#### Authentication Controller (`src/domains/auth/controllers/auth.controller.ts`)
- Updated token issuance to use `sub` claim instead of `userId`
- Both signup and login endpoints now emit RFC-7519 compliant tokens

#### WebSocket Service (`src/domains/chat/services/websocket.service.ts`)
- Updated authentication middleware to prioritize `sub` claim
- Added fallback logic for legacy tokens with warning logging
- Enhanced error messages to reference "subject claim"

#### File Controller (`src/domains/files/controllers/file.controller.ts`)
- Updated `extractUserId` method to use RFC-7519 compliant logic
- Added fallback support for legacy tokens with warning logging

### 3. Migration Strategy

The system implements a **backward-compatible migration** approach:

1. **New tokens** are issued with the `sub` claim
2. **Legacy tokens** are still accepted but trigger warning logs
3. **Fallback logic** checks for `sub` first, then falls back to `userId` or `id`
4. **Warning logs** are generated when legacy claims are used

### 4. Logging

When legacy tokens are encountered, the system logs warnings with the following information:
- Which legacy claim was used (`userId` or `id`)
- Token issued time (`iat`)
- Token expiration time (`exp`)
- Clear message requesting re-authentication

Example log entry:
```json
{
  "level": "warn",
  "legacyClaim": "userId",
  "tokenIssuedAt": 1234567890,
  "tokenExpiresAt": 1234567890,
  "msg": "Using legacy JWT claim for user identification. Please re-authenticate to receive RFC-7519 compliant token."
}
```

## Migration Timeline

### Phase 1: Implementation (Current)
- ✅ Updated token issuance to use `sub` claim
- ✅ Updated authentication middleware with fallback support
- ✅ Added comprehensive logging for legacy token usage
- ✅ Updated tests to cover new behavior

### Phase 2: Monitoring (Recommended)
- Monitor logs for legacy token usage
- Track the percentage of requests using legacy tokens
- Identify clients that need to be updated

### Phase 3: Legacy Support Removal (Future)
- After sufficient time has passed and legacy token usage is minimal
- Remove fallback logic and legacy claim support
- Update error messages to only reference `sub` claim

## Client Impact

### Immediate Impact
- **No breaking changes** - existing clients continue to work
- New tokens issued will use `sub` claim
- Legacy tokens are still accepted with warnings

### Recommended Actions for Clients
1. **Update client code** to read user ID from `sub` claim instead of `userId`/`id`
2. **Re-authenticate** to receive new RFC-7519 compliant tokens
3. **Monitor logs** for any legacy token usage warnings

### Example Client Code Update

**Before:**
```javascript
const userId = decodedToken.userId || decodedToken.id;
```

**After:**
```javascript
const userId = decodedToken.sub;
```

## Testing

The migration includes comprehensive test coverage:

- ✅ Tests for RFC-7519 compliant token handling
- ✅ Tests for legacy token fallback behavior
- ✅ Tests for proper warning log generation
- ✅ Tests for error handling when no user identifier is present

## Security Considerations

- **No security impact** - the change is purely structural
- **Same cryptographic strength** - tokens use the same signing algorithm (HS256)
- **Audit trail** - all legacy token usage is logged for monitoring
- **Gradual migration** - allows for controlled rollout without service disruption

## Rollback Plan

If issues arise, the system can be rolled back by:

1. Reverting the auth controller to issue `userId` claims
2. Reverting authentication middleware to prioritize `userId`/`id`
3. The fallback logic ensures both old and new tokens work during rollback

## Monitoring and Metrics

Key metrics to monitor during migration:

- **Legacy token usage rate** - should decrease over time
- **Authentication failure rate** - should remain stable
- **Warning log volume** - indicates migration progress
- **Client re-authentication rate** - shows client adoption

## Support

For questions or issues related to this migration:

1. Check application logs for JWT-related warnings
2. Verify client code is reading from the correct claim
3. Ensure clients are re-authenticating to receive new tokens
4. Monitor the migration progress through logging metrics
