# SonarQube Integration Guide

## Overview

This project is configured with SonarQube for static code analysis, test coverage reporting, and quality gate enforcement.

## Configuration Files

### 1. `sonar-project.properties`
Main SonarQube configuration file with:
- Project metadata
- Source code paths
- Coverage exclusions
- Quality thresholds
- Security settings

### 2. `.github/workflows/sonar-quality-gate.yml`
GitHub Actions workflow for:
- Automated SonarQube analysis on PRs
- Quality gate enforcement
- Coverage reporting

### 3. `vitest.config.ts`
Updated Vitest configuration with:
- Coverage reporting (LCOV, JSON, HTML)
- Coverage thresholds (80% minimum)
- Proper exclusions for test files

## Quality Gates

### Coverage Requirements
- **Minimum Coverage**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

### Code Quality Requirements
- **Complexity**: Maximum 8 per function
- **Maintainability Rating**: A
- **Reliability Rating**: A
- **Security Rating**: A

## Setup Instructions

### 1. Local Development

```bash
# Install sonar-scanner (if not already installed)
npm run sonar:setup

# Run tests with coverage
npm run coverage

# Run SonarQube analysis locally
npm run sonar:local
```

### 2. CI/CD Integration

The GitHub Actions workflow automatically:
- Runs tests with coverage
- Generates LCOV reports
- Performs SonarQube analysis
- Enforces quality gates

### 3. Required Secrets

Add these secrets to your GitHub repository:

```
SONAR_TOKEN=your_sonar_token
SONAR_HOST_URL=https://your-sonar-instance.com
SONAR_ORGANIZATION=your_organization
```

## Coverage Reports

### Generated Files
- `coverage/lcov.info` - LCOV format for SonarQube
- `coverage/index.html` - HTML coverage report
- `coverage/coverage-final.json` - JSON coverage data

### Coverage Exclusions
The following files are excluded from coverage:
- Test files (`*.test.ts`, `*.spec.ts`)
- Mock files (`src/mocks/**`)
- Fixture files (`src/fixtures/**`)
- Type definition files (`*.d.ts`)
- Build artifacts (`dist/**`)

## Quality Metrics

### Code Coverage
- **Lines**: Percentage of executable lines covered
- **Branches**: Percentage of conditional branches covered
- **Functions**: Percentage of functions called
- **Statements**: Percentage of statements executed

### Code Quality
- **Duplications**: Code duplication detection
- **Maintainability**: Code maintainability rating
- **Reliability**: Bug detection and rating
- **Security**: Security vulnerability detection

## Troubleshooting

### Common Issues

1. **Coverage not generated**
   ```bash
   # Ensure tests are running
   npm test
   
   # Check coverage configuration
   npm run coverage
   ```

2. **SonarQube analysis fails**
   ```bash
   # Check sonar-project.properties
   cat sonar-project.properties
   
   # Verify coverage files exist
   ls -la coverage/
   ```

3. **Quality gate failures**
   - Check coverage thresholds
   - Review complexity violations
   - Fix security vulnerabilities

### Debug Commands

```bash
# Run specific test types
npm run test:unit
npm run test:integration
npm run test:performance

# Generate coverage for specific test types
npm run coverage:unit
npm run coverage:integration
npm run coverage:performance

# Check linting issues
npm run lint

# Check type issues
npm run type-check
```

## Best Practices

### 1. Test Coverage
- Write tests for all new code
- Aim for 80%+ coverage
- Test edge cases and error conditions
- Use integration tests for complex flows

### 2. Code Quality
- Keep functions simple (complexity ≤ 8)
- Avoid code duplication
- Use meaningful variable names
- Follow TypeScript best practices

### 3. Security
- Regular dependency updates
- Input validation
- Secure coding practices
- Regular security scans

## Monitoring

### SonarQube Dashboard
- Access your SonarQube instance
- View project metrics
- Track quality trends
- Review issues

### GitHub Integration
- Quality gate status in PRs
- Coverage reports in comments
- Automated quality checks
- Blocking merge on failures

## Advanced Configuration

### Custom Quality Gates
Edit `sonar-project.properties` to customize:
- Coverage thresholds
- Complexity limits
- Security requirements
- Duplication rules

### Custom Rules
Configure SonarQube rules for:
- TypeScript-specific issues
- Security vulnerabilities
- Performance problems
- Maintainability concerns
