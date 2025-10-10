# Branch Protection Configuration

This document outlines the recommended branch protection rules for the `main` branch to ensure code quality and prevent broken builds.

## Required Status Checks

The following status checks must pass before merging to `main`:

### 1. CI Pipeline (`ci-status`)
- **Purpose**: Ensures all critical checks pass
- **Includes**: Tests, Security, Build
- **Required**: ✅ Must pass

### 2. Test Pipeline (`test`)
- **Purpose**: Validates code functionality
- **Includes**: 
  - Linting
  - Type checking
  - Unit tests
  - Integration tests
- **Required**: ✅ Must pass

### 3. Security Gate (`security`)
- **Purpose**: Ensures security standards
- **Includes**:
  - NPM vulnerability scan
  - Hardcoded secrets detection
  - Code security analysis
- **Required**: ✅ Must pass

### 4. Build Pipeline (`build`)
- **Purpose**: Ensures Docker builds work
- **Includes**:
  - Docker image builds
  - Docker Compose validation
  - Container startup tests
- **Required**: ✅ Must pass

## GitHub Branch Protection Settings

To configure these rules in GitHub:

1. Go to **Settings** → **Branches** in your repository
2. Add a rule for the `main` branch
3. Configure the following settings:

### ✅ Required Settings:
- **Require a pull request before merging**: ✅ Enabled
- **Require approvals**: ✅ Enabled (1 or more)
- **Dismiss stale PR approvals when new commits are pushed**: ✅ Enabled
- **Require status checks to pass before merging**: ✅ Enabled
- **Require branches to be up to date before merging**: ✅ Enabled

### ✅ Required Status Checks:
- `ci-status` (CI Pipeline)
- `test` (Test Pipeline) 
- `security` (Security Gate)
- `build` (Build Pipeline)

### ✅ Additional Settings:
- **Require conversation resolution before merging**: ✅ Enabled
- **Require linear history**: ✅ Enabled (optional)
- **Include administrators**: ✅ Enabled (optional)

## Workflow Triggers

The CI pipeline runs on:
- **Pull Requests** to `main` or `develop` branches
- **Pushes** to `main` or `develop` branches

## Failure Handling

If any check fails:
1. **PR is automatically blocked** from merging
2. **Detailed error messages** are provided in the PR comments
3. **Fix the issues** and push new commits
4. **Checks re-run automatically** on new commits
5. **PR can be merged** once all checks pass

## Local Development

To run the same checks locally:

```bash
# Run tests
npm test

# Run linting
npm run lint

# Run type checking
npm run type-check

# Run security scan
./security-scan.sh

# Test Docker build
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up -d
```

## Benefits

This setup ensures:
- ✅ **No broken builds** reach the main branch
- ✅ **Security vulnerabilities** are caught early
- ✅ **Code quality** is maintained
- ✅ **Docker builds** work consistently
- ✅ **Automated testing** prevents regressions
- ✅ **Team confidence** in the main branch stability
