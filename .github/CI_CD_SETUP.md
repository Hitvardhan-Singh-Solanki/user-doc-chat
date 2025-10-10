# CI/CD Pipeline Setup

This document explains the complete CI/CD pipeline setup for the user-doc-chat project.

## 🎯 Overview

The CI/CD pipeline ensures that:
- ✅ **No broken builds** reach the main branch
- ✅ **Security vulnerabilities** are caught early  
- ✅ **Code quality** is maintained
- ✅ **Docker builds** work consistently
- ✅ **Automated testing** prevents regressions

## 📋 Pipeline Components

### 1. CI Pipeline (`ci.yml`)
**Main pipeline that runs all checks in parallel**

- **Tests**: Linting, type checking, unit tests, integration tests
- **Security**: Vulnerability scanning, secret detection, code analysis
- **Build**: Docker image builds, container startup tests
- **Status**: Final status check

### 2. Test Pipeline (`test.yml`)
**Focused on testing and code quality**

- Node.js setup and dependency installation
- Linting and type checking
- Python environment setup
- gRPC sanitizer service startup
- Comprehensive test suite execution
- Coverage reporting

### 3. Security Pipeline (`security-gate.yml`)
**Security-focused checks**

- NPM vulnerability scanning
- Hardcoded secrets detection
- Code security analysis
- Security gate decision making
- PR commenting with security status

### 4. Build Pipeline (`build.yml`)
**Docker and container validation**

- Docker image builds for all services
- Docker Compose configuration validation
- Container startup testing
- Service health checks

## 🚀 How It Works

### Automatic Triggers
The pipelines run automatically on:
- **Pull Requests** to `main` or `develop` branches
- **Pushes** to `main` or `develop` branches
- **Manual triggers** (workflow_dispatch)

### Parallel Execution
All checks run in parallel for faster feedback:
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│    Tests    │  │  Security   │  │    Build    │
│             │  │             │  │             │
│ • Linting   │  │ • NPM Audit │  │ • Docker    │
│ • Type Check│  │ • Secrets   │  │ • Compose   │
│ • Unit Tests│  │ • Code Scan │  │ • Startup   │
└─────────────┘  └─────────────┘  └─────────────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                ┌─────────────┐
                │ CI Status   │
                │            │
                │ ✅/❌ Pass  │
                └─────────────┘
```

## 🛠️ Local Development

### Run CI Checks Locally
```bash
# Run the complete CI pipeline locally
./scripts/ci-local.sh

# Or run individual checks
npm run lint          # Linting
npm run type-check    # Type checking  
npm test             # Tests
./security-scan.sh   # Security scan
docker-compose -f docker-compose.dev.yml build  # Docker build
```

### Pre-commit Hooks
Add to your `.git/hooks/pre-commit`:
```bash
#!/bin/bash
echo "Running pre-commit checks..."
./scripts/ci-local.sh
```

## 🔒 Branch Protection

### Required Status Checks
Configure these in GitHub Settings → Branches → main:

1. **`ci-status`** - Overall CI pipeline status
2. **`test`** - Test pipeline results  
3. **`security`** - Security gate results
4. **`build`** - Build pipeline results

### Protection Rules
- ✅ Require pull request reviews
- ✅ Require status checks to pass
- ✅ Require branches to be up to date
- ✅ Require conversation resolution
- ✅ Include administrators

## 📊 Status Reporting

### PR Comments
The pipeline automatically comments on PRs with:
- ✅ **Success**: All checks passed, ready to merge
- ❌ **Failure**: Specific issues that need fixing
- 📊 **Details**: Breakdown of test results, security findings, build status

### GitHub Status Checks
Each job reports its status:
- 🟢 **Success**: Check passed
- 🔴 **Failure**: Check failed  
- 🟡 **Pending**: Check in progress

## 🚨 Failure Handling

### When Checks Fail
1. **PR is blocked** from merging
2. **Detailed error messages** provided
3. **Fix issues** and push new commits
4. **Checks re-run** automatically
5. **Merge when all pass**

### Common Issues & Solutions

#### Test Failures
```bash
# Run tests locally to debug
npm test

# Check specific test files
npm test -- --grep "specific test name"
```

#### Security Failures
```bash
# Run security scan locally
./security-scan.sh

# Check specific reports
cat reports/npm-audit.json
cat reports/hardcoded-secrets.txt
```

#### Build Failures
```bash
# Test Docker build locally
docker-compose -f docker-compose.dev.yml build

# Check container logs
docker-compose -f docker-compose.dev.yml logs
```

## 🔧 Customization

### Adding New Checks
1. **Update workflow files** in `.github/workflows/`
2. **Add new job** to `ci.yml`
3. **Update branch protection** rules
4. **Test locally** with `./scripts/ci-local.sh`

### Environment Variables
- **Secrets**: Use GitHub Secrets for sensitive data
- **Variables**: Use GitHub Variables for non-sensitive config
- **Test values**: Use fake/test values for CI environment

### Performance Optimization
- **Parallel jobs**: All checks run simultaneously
- **Caching**: Dependencies cached between runs
- **Conditional runs**: Skip checks when not needed
- **Artifact sharing**: Share build artifacts between jobs

## 📈 Monitoring

### Success Metrics
- **Build success rate**: % of builds that pass
- **Time to feedback**: How quickly developers get results
- **Failure rate**: % of PRs that fail checks
- **Fix time**: How quickly issues are resolved

### Continuous Improvement
- **Monitor failure patterns**: Common issues to address
- **Optimize check times**: Faster feedback loops
- **Update dependencies**: Keep tools current
- **Refine rules**: Adjust based on team needs

## 🎉 Benefits

This CI/CD setup provides:
- ✅ **Quality assurance** - No broken code reaches main
- ✅ **Security protection** - Vulnerabilities caught early
- ✅ **Developer confidence** - Know your code works
- ✅ **Faster feedback** - Issues caught immediately
- ✅ **Automated testing** - Comprehensive coverage
- ✅ **Team efficiency** - Less manual testing needed

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Testing Best Practices](https://nodejs.org/en/docs/guides/testing/)
- [Security Scanning Tools](https://owasp.org/www-project-top-ten/)
