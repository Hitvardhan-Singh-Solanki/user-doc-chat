# Testing Guide

Comprehensive testing strategies and guidelines for the User Doc Chat application.

## 🧪 Testing Strategy

### Test Pyramid
- **Unit Tests**: Fast, isolated tests for individual components
- **Integration Tests**: Tests for component interactions
- **End-to-End Tests**: Full application workflow tests
- **Performance Tests**: Load and stress testing

### Test Categories
- **Functional Tests**: Feature and functionality validation
- **Security Tests**: Security vulnerability testing
- **Performance Tests**: Load, stress, and scalability testing
- **Infrastructure Tests**: Infrastructure validation

## 🚀 Running Tests

### All Tests
```bash
# Run all tests
npm run test:all

# Run with coverage
npm run coverage
```

### Specific Test Types
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Performance tests
npm run test:performance

# Infrastructure tests
npm run test:infrastructure
```

### Test Scripts
```bash
# Development testing
./scripts/dev.sh test

# Infrastructure testing
./scripts/infra.sh test
```

## 📊 Test Coverage

### Coverage Requirements
- **Minimum**: 80% overall coverage
- **Critical Paths**: 95% coverage
- **New Code**: 90% coverage
- **Infrastructure**: 85% coverage

### Coverage Reports
- **HTML**: Interactive coverage reports
- **LCOV**: Coverage data for CI/CD
- **JSON**: Machine-readable coverage data
- **SonarQube**: Quality gate integration

## 🔧 Test Configuration

### Vitest Configuration
- **Unit Tests**: `vitest.config.ts`
- **Integration Tests**: `vitest.integration.config.ts`
- **Performance Tests**: `vitest.performance.config.ts`
- **Infrastructure Tests**: `infrastructure/tests/`

### Test Environment
- **Node.js**: Version 18+
- **Database**: PostgreSQL with test data
- **Cache**: Redis for testing
- **Storage**: MinIO for file testing

## 🛡️ Security Testing

### Security Test Categories
- **Input Validation**: Malicious input testing
- **Authentication**: JWT and session testing
- **Authorization**: RBAC testing
- **File Upload**: Malicious file testing
- **API Security**: Endpoint security testing

### Security Test Tools
- **ESLint Security**: Static security analysis
- **CodeQL**: GitHub security analysis
- **Trivy**: Vulnerability scanning
- **Snyk**: Dependency vulnerability scanning

## ⚡ Performance Testing

### Performance Metrics
- **Response Time**: API response times
- **Throughput**: Requests per second
- **Memory Usage**: Memory consumption
- **CPU Usage**: CPU utilization
- **Database Performance**: Query performance

### Load Testing
- **Concurrent Users**: Multiple user simulation
- **Data Volume**: Large dataset testing
- **File Upload**: Large file testing
- **Search Performance**: Vector search testing

## 🏗️ Infrastructure Testing

### Infrastructure Validation
- **Pulumi Tests**: Infrastructure as code testing
- **Kubernetes Tests**: K8s resource validation
- **AWS Tests**: Cloud resource testing
- **Monitoring Tests**: Observability testing

### Infrastructure Test Commands
```bash
# Run infrastructure tests
./scripts/infra.sh test

# Preview infrastructure
./scripts/infra.sh preview

# Validate deployment
./scripts/infra.sh validate
```

## 📋 Testing Best Practices

### Test Design
- **Arrange-Act-Assert**: Clear test structure
- **Single Responsibility**: One test per scenario
- **Descriptive Names**: Clear test descriptions
- **Independent Tests**: No test dependencies

### Test Data
- **Test Fixtures**: Reusable test data
- **Mock Data**: Controlled test scenarios
- **Edge Cases**: Boundary condition testing
- **Error Scenarios**: Failure case testing

### Test Maintenance
- **Regular Updates**: Keep tests current
- **Refactoring**: Improve test quality
- **Documentation**: Test documentation
- **Review**: Code review for tests

## 🚨 Test Failures

### Debugging Tests
- **Log Analysis**: Test execution logs
- **Debug Mode**: Verbose test output
- **Isolation**: Run individual tests
- **Environment**: Check test environment

### Common Issues
- **Timing Issues**: Async test problems
- **Environment**: Missing test dependencies
- **Data**: Test data inconsistencies
- **Configuration**: Test configuration issues

## 📚 Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Performance Testing](https://k6.io/docs/)