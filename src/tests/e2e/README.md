# End-to-End Tests

This directory contains end-to-end (e2e) tests that verify the complete integration between different services in the application.

## Overview

The e2e tests are designed to test real service interactions, particularly focusing on:

- **gRPC Communication**: Tests the communication between Node.js and Python services
- **Service Integration**: Verifies that different parts of the system work together correctly
- **Real Service Calls**: Uses actual services rather than mocks where appropriate

## Test Structure

### `grpc-sanitizer.e2e.test.ts`
Tests the gRPC communication between Node.js and Python sanitizer service:
- Service health and connectivity
- Text file sanitization
- PDF file sanitization (when supported)
- Error handling and edge cases
- Performance and concurrency

### `sanitizer-client.e2e.test.ts`
Tests the actual sanitizer client service integration:
- Real service calls using the application's service layer
- Integration with PDF sanitization service
- File processing workflows
- Error handling and performance

## Running E2E Tests

### Prerequisites

1. **Python Service**: The Python gRPC service must be running
2. **Dependencies**: All Node.js and Python dependencies must be installed
3. **Environment**: Proper environment variables must be set

### Local Development

```bash
# Start the Python gRPC service (in a separate terminal)
cd python_service
python main_grpc_server.py

# Run e2e tests (in another terminal)
npm run test:e2e

# Run e2e tests in watch mode
npm run test:e2e:watch
```

### CI/CD Pipeline

The e2e tests are automatically run in the GitHub Actions pipeline:

1. **Service Setup**: Python gRPC service is started automatically
2. **Test Execution**: Both unit and e2e tests are run
3. **Coverage**: Test coverage is collected and uploaded

## Test Configuration

### Environment Variables

The e2e tests use the following environment variables:

```bash
# gRPC Configuration
SANITIZER_HOST=localhost:50051
SANITIZER_TIMEOUT=10000
SANITIZER_TLS_ENABLED=false

# Test Environment
NODE_ENV=test
CI=true  # Set automatically in CI environment
```

### Test Timeouts

- **Test Timeout**: 60 seconds per test
- **Hook Timeout**: 30 seconds for setup/teardown
- **Service Startup**: 30 seconds maximum

## Test Categories

### 1. Service Health Tests
- Verify gRPC service connectivity
- Test connection error handling
- Validate service availability

### 2. File Sanitization Tests
- Text file processing
- PDF file processing (when supported)
- Unicode and special character handling
- Large file handling

### 3. Error Handling Tests
- Unsupported file types
- Oversized files
- Service unavailability
- Malformed requests

### 4. Performance Tests
- Concurrent request handling
- Response time validation
- Load testing scenarios

### 5. Integration Tests
- End-to-end file processing workflows
- Service layer integration
- Real application scenarios

## Debugging E2E Tests

### Common Issues

1. **Service Not Starting**: Check Python dependencies and port availability
2. **Connection Timeouts**: Verify service is running and accessible
3. **Test Failures**: Check service logs and error messages

### Debug Commands

```bash
# Check if gRPC service is running
netstat -an | grep 50051

# View Python service logs
docker logs <container-name>

# Run single test file
npm run test:e2e -- grpc-sanitizer.e2e.test.ts

# Run with verbose output
npm run test:e2e -- --reporter=verbose
```

### Logs and Output

- **Service Logs**: Python service logs are captured and displayed
- **Test Output**: Detailed test results and timing information
- **Error Details**: Full error messages and stack traces

## Best Practices

### Writing E2E Tests

1. **Real Services**: Use actual services, not mocks
2. **Cleanup**: Always clean up resources in `afterAll` hooks
3. **Timeouts**: Set appropriate timeouts for service operations
4. **Error Handling**: Test both success and failure scenarios
5. **Isolation**: Ensure tests don't interfere with each other

### Test Data

1. **Minimal Data**: Use minimal test data to reduce test time
2. **Realistic Scenarios**: Test realistic use cases
3. **Edge Cases**: Include boundary conditions and error cases
4. **Cleanup**: Remove any test data after tests complete

## Continuous Integration

The e2e tests are integrated into the CI/CD pipeline:

1. **Automatic Execution**: Runs on every PR and push to main/develop
2. **Service Management**: Automatically starts required services
3. **Parallel Execution**: Runs alongside unit tests for efficiency
4. **Failure Handling**: Fails the build if e2e tests fail
5. **Artifacts**: Collects and uploads test coverage and logs

## Monitoring and Maintenance

### Regular Tasks

1. **Update Dependencies**: Keep test dependencies up to date
2. **Review Test Coverage**: Ensure comprehensive coverage
3. **Performance Monitoring**: Track test execution times
4. **Service Compatibility**: Verify compatibility with service updates

### Metrics

- **Test Execution Time**: Monitor and optimize test performance
- **Success Rate**: Track test reliability and stability
- **Coverage**: Maintain high test coverage for critical paths
- **Flakiness**: Identify and fix flaky tests

## Troubleshooting

### Common Problems

1. **Port Conflicts**: Ensure port 50051 is available
2. **Python Dependencies**: Verify all Python packages are installed
3. **Environment Variables**: Check that all required env vars are set
4. **Service Startup**: Verify Python service starts correctly

### Solutions

1. **Kill Existing Processes**: `lsof -ti:50051 | xargs kill -9`
2. **Reinstall Dependencies**: `pip install -r python_service/requirements.txt`
3. **Check Environment**: Verify `.env` files and environment setup
4. **Service Logs**: Check Python service output for errors

## Contributing

When adding new e2e tests:

1. **Follow Naming**: Use `.e2e.test.ts` suffix
2. **Add Documentation**: Update this README with new test descriptions
3. **Test Locally**: Verify tests work in local environment
4. **Update CI**: Ensure CI pipeline runs new tests
5. **Performance**: Keep test execution time reasonable
