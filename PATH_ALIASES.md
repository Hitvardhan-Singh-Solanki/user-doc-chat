# Path Aliases Configuration

This document outlines the path aliases configured for the project to eliminate complex relative imports like `../../../`.

## Configuration Files

- **TypeScript**: `tsconfig.json` - Path aliases for compilation
- **Vitest**: `vitest.config.ts` - Uses `vite-tsconfig-paths` to automatically pick up aliases

## Available Aliases

### Domain Aliases
- `@domains/*` → `domains/*`
- `@auth/*` → `domains/auth/*`
- `@chat/*` → `domains/chat/*`
- `@files/*` → `domains/files/*`
- `@health/*` → `domains/health/*`
- `@vector/*` → `domains/vector/*`

### Infrastructure Aliases
- `@infrastructure/*` → `infrastructure/*`
- `@cache/*` → `infrastructure/cache/*`
- `@database/*` → `infrastructure/database/*`
- `@external/*` → `infrastructure/external-services/*`
- `@ai/*` → `infrastructure/external-services/ai/*`
- `@grpc/*` → `infrastructure/external-services/grpc/*`
- `@search/*` → `infrastructure/external-services/search/*`
- `@monitoring/*` → `infrastructure/monitoring/*`
- `@queue/*` → `infrastructure/queue/*`
- `@storage/*` → `infrastructure/storage/*`

### Shared Aliases
- `@shared/*` → `shared/*`
- `@interfaces/*` → `shared/interfaces/*`
- `@middleware/*` → `shared/middleware/*`
- `@types/*` → `shared/types/*`
- `@utils/*` → `shared/utils/*`
- `@validators/*` → `shared/validators/*`

### Test Aliases
- `@tests/*` → `tests/*`
- `@fixtures/*` → `tests/fixtures/*`
- `@mocks/*` → `tests/mocks/*`

### Existing Config Aliases
- `@config/*` → `config/*`
- `@secrets` → `config/secrets.config`
- `@config` → `config/app.config`

## Usage Examples

### Before (Complex Relative Imports)
```typescript
import { AuthService } from '../../../domains/auth/services/auth.service';
import { IDBStore } from '../../../shared/interfaces/db-store.interface';
import { getRateLimiterService } from '../../../infrastructure/cache/rate-limiter.service';
```

### After (Clean Alias Imports)
```typescript
import { AuthService } from '@auth/services/auth.service';
import { IDBStore } from '@interfaces/db-store.interface';
import { getRateLimiterService } from '@cache/rate-limiter.service';
```

## Benefits

1. **Cleaner Code**: No more `../../../` navigation
2. **Better Maintainability**: Imports remain stable when files are moved
3. **Improved Readability**: Clear indication of module location
4. **IDE Support**: Better autocomplete and navigation
5. **Consistent Structure**: Standardized import patterns across the codebase

## Migration Status

✅ **40 files updated** with new import aliases
✅ **All tests passing** (211 tests)
✅ **TypeScript compilation successful**
✅ **No breaking changes**

The migration is complete and all functionality remains intact.
