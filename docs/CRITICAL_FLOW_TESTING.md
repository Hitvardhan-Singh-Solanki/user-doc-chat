# Critical Flow Testing

## Overview

This document describes the comprehensive end-to-end testing strategy for the critical user flows in the AI Legal Document Q&A application. These tests ensure that the most important user journeys work correctly from start to finish.

## Critical Flows Tested

### 1. Authentication Flow (`auth-flow.e2e.test.ts`)

**Purpose**: Tests the complete user authentication journey including registration, login, and JWT validation.

**Critical Path**:
1. User registration with validation
2. User login with credential verification
3. JWT token generation and validation
4. Protected route access
5. Session management
6. Security features (XSS, SQL injection protection)

**Test Coverage**:
- ✅ User registration with valid/invalid data
- ✅ Duplicate email handling
- ✅ Password strength validation
- ✅ Email format validation
- ✅ Login with valid/invalid credentials
- ✅ JWT token validation
- ✅ Protected route access
- ✅ Token expiration handling
- ✅ Concurrent authentication requests
- ✅ Security vulnerability testing

### 2. File Upload Flow (`file-upload-flow.e2e.test.ts`)

**Purpose**: Tests the complete file upload and initial processing pipeline.

**Critical Path**:
1. Authentication requirement
2. File validation (type, size, content)
3. File storage in MinIO
4. Database metadata storage
5. Background job queuing
6. User isolation
7. Error handling

**Test Coverage**:
- ✅ Authentication requirement
- ✅ File type validation (PDF, TXT, MD)
- ✅ File size limits
- ✅ Empty file handling
- ✅ File name sanitization
- ✅ Database record creation
- ✅ Multiple file uploads
- ✅ User isolation
- ✅ Concurrent uploads
- ✅ Error handling and recovery

### 3. Chat Flow (`chat-flow.e2e.test.ts`)

**Purpose**: Tests the WebSocket-based chat and question-answering functionality.

**Critical Path**:
1. WebSocket connection with JWT authentication
2. Question processing and AI response generation
3. Chat history management
4. Context awareness
5. Multi-user isolation
6. Error handling

**Test Coverage**:
- ✅ WebSocket connection with valid/invalid JWT
- ✅ Question processing and streaming responses
- ✅ No context handling
- ✅ Chat history persistence
- ✅ Context-aware follow-up questions
- ✅ Concurrent chat sessions
- ✅ Multi-user isolation
- ✅ Network disconnection handling
- ✅ Malformed message handling

### 4. File Processing Flow (`file-processing-flow.e2e.test.ts`)

**Purpose**: Tests the complete file processing pipeline including background processing and status tracking.

**Critical Path**:
1. File upload and queuing
2. Background processing with gRPC
3. Status tracking via REST and SSE
4. Vector storage integration
5. Error handling and recovery
6. Concurrent processing

**Test Coverage**:
- ✅ File upload and initial processing
- ✅ Different file type processing
- ✅ Large file handling
- ✅ Status tracking (REST and SSE)
- ✅ Concurrent status requests
- ✅ Access control for file status
- ✅ Background processing pipeline
- ✅ Processing error handling
- ✅ Concurrent file processing
- ✅ Vector storage integration
- ✅ System stability under load

### 5. Complete User Journey (`complete-user-journey.e2e.test.ts`)

**Purpose**: Tests the entire user workflow from registration to document upload to chat interaction.

**Critical Path**:
1. User registration and login
2. Document upload and processing
3. WebSocket connection establishment
4. Question asking and AI responses
5. Chat history persistence
6. Follow-up questions and context awareness
7. Multi-user scenarios
8. System recovery testing

**Test Coverage**:
- ✅ Complete end-to-end user workflow
- ✅ Multi-user document isolation
- ✅ System recovery after interruption
- ✅ Context-aware conversations
- ✅ Chat history persistence
- ✅ Follow-up question handling
- ✅ Real document processing
- ✅ AI response quality validation

## Test Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Critical Flow Test Architecture              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Unit Tests    │    │   E2E Tests      │                │
│  │                 │    │                 │                │
│  │ • Service Tests │    │ • Auth Flow     │                │
│  │ • Mock Services │    │ • File Upload   │                │
│  │ • Fast Execution│    │ • Chat Flow     │                │
│  └─────────────────┘    │ • Processing    │                │
│           │              │ • User Journey  │                │
│           └───────────┬──┴─────────────────┘                │
│                       │                                    │
│  ┌─────────────────────────────────────────────────────────┤
│  │              GitHub Actions Pipeline                    │
│  │                                                         │
│  │  1. Start Services (PostgreSQL, Redis, Python gRPC)    │
│  │  2. Run Unit Tests                                      │
│  │  3. Run E2E Tests                                       │
│  │  4. Run Critical Flow Tests                             │
│  │  5. Collect Coverage                                    │
│  │  6. Upload Artifacts                                    │
│  └─────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────────┤
│  │                Test Data Management                     │
│  │                                                         │
│  │  • Automatic cleanup between tests                     │
│  │  • Isolated test data per test suite                   │
│  │  • Real service integration                            │
│  │  • Proper resource management                          │
│  └─────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────┘
```

## Running Critical Flow Tests

### Local Development

#### Option 1: Automated Script
```bash
# Run all critical flow tests with automatic service setup
./scripts/test-e2e-local.sh
```

#### Option 2: Manual Setup
```bash
# Terminal 1: Start Python gRPC service
cd python_service
python main_grpc_server.py

# Terminal 2: Run critical flow tests
npm run test:e2e:critical
```

#### Option 3: Docker Compose
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Run critical flow tests
npm run test:e2e:critical
```

### CI/CD Pipeline

The critical flow tests run automatically in GitHub Actions:

1. **Service Setup**: PostgreSQL, Redis, and Python gRPC services are started
2. **Test Execution**: All critical flow tests are run sequentially
3. **Coverage Collection**: Test coverage is collected and uploaded
4. **Artifact Upload**: Test results and logs are uploaded

## Test Configuration

### Environment Variables

```bash
# Test Environment
NODE_ENV=test
CI=true

# Database Configuration
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/testdb
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=test-secret-jwt-key-for-development-only

# gRPC Configuration
SANITIZER_HOST=127.0.0.1:50051
SANITIZER_TIMEOUT=10000
SANITIZER_TLS_ENABLED=false

# External Services (Mocked)
HUGGINGFACE_HUB_TOKEN=some-fake-token-for-testing-only
PINECONE_API_KEY=some-fake-key-for-testing-only
```

### Test Timeouts

- **Test Timeout**: 60 seconds per test
- **Hook Timeout**: 30 seconds for setup/teardown
- **Service Startup**: 30 seconds maximum
- **File Processing**: 60 seconds maximum
- **Chat Response**: 15 seconds maximum

## Test Data Management

### Automatic Cleanup

Each test suite includes comprehensive cleanup:

```typescript
beforeEach(async () => {
  // Clean up test data before each test
  await cleanupTestData();
});

afterAll(async () => {
  // Final cleanup after all tests
  await cleanupTestData();
});
```

### Isolated Test Data

- Each test uses unique email addresses
- Test data is automatically cleaned up
- No interference between test runs
- Proper resource management

## Monitoring and Debugging

### Test Output

The critical flow tests provide detailed output:

```
🔄 Step 1: User Registration
🔄 Step 2: User Login
🔄 Step 3: Document Upload
🔄 Step 4: Monitor File Processing
📊 Processing status: uploaded
📊 Processing status: processing
📊 Processing status: processed
🔄 Step 5: Establish WebSocket Connection
🔄 Step 6: Ask Questions About the Document
❓ Asking: What is this document about?
✅ Answer: This document is about artificial intelligence and machine learning...
🔄 Step 7: Verify Chat History Persistence
🔄 Step 8: Test Follow-up Questions
✅ Complete user journey test passed!
```

### Debugging Failed Tests

1. **Check Service Logs**: Python gRPC service logs are captured
2. **Verify Service Health**: Health endpoints are tested
3. **Database State**: Test data cleanup and isolation
4. **Network Connectivity**: Service communication verification

## Performance Considerations

### Test Execution Time

- **Authentication Flow**: ~30 seconds
- **File Upload Flow**: ~45 seconds
- **Chat Flow**: ~60 seconds
- **File Processing Flow**: ~90 seconds
- **Complete User Journey**: ~120 seconds

### Optimization Strategies

1. **Parallel Test Execution**: Independent tests run in parallel
2. **Service Reuse**: Services are started once per test suite
3. **Efficient Cleanup**: Minimal cleanup between tests
4. **Timeout Management**: Appropriate timeouts for each operation

## Best Practices

### Writing Critical Flow Tests

1. **Real User Scenarios**: Test actual user workflows
2. **Comprehensive Coverage**: Cover all critical paths
3. **Error Scenarios**: Test both success and failure cases
4. **Resource Management**: Proper cleanup and isolation
5. **Performance Validation**: Ensure reasonable response times

### Test Maintenance

1. **Regular Updates**: Keep tests current with application changes
2. **Dependency Management**: Update test dependencies regularly
3. **Performance Monitoring**: Track test execution times
4. **Coverage Analysis**: Ensure comprehensive test coverage

## Troubleshooting

### Common Issues

1. **Service Startup Failures**: Check Python dependencies and port availability
2. **Test Timeouts**: Verify service health and network connectivity
3. **Database Issues**: Check PostgreSQL connection and permissions
4. **Redis Issues**: Verify Redis connection and memory availability

### Solutions

1. **Service Health Checks**: Implement comprehensive health monitoring
2. **Retry Logic**: Add retry mechanisms for flaky operations
3. **Better Error Messages**: Provide detailed error information
4. **Resource Monitoring**: Monitor system resources during tests

## Future Enhancements

### Planned Improvements

1. **Load Testing**: Add performance and load testing scenarios
2. **Security Testing**: Enhanced security vulnerability testing
3. **Mobile Testing**: Add mobile-specific test scenarios
4. **Accessibility Testing**: Include accessibility compliance testing

### Monitoring Integration

1. **Metrics Collection**: Add performance metrics during tests
2. **Alerting**: Set up alerts for test failures
3. **Trend Analysis**: Track test performance over time
4. **Coverage Reporting**: Enhanced coverage reporting and analysis

## Conclusion

The critical flow testing strategy ensures that the most important user journeys in the AI Legal Document Q&A application work correctly from start to finish. These tests provide confidence in the system's reliability and help catch issues early in the development process.

The comprehensive test suite covers:
- ✅ Complete user authentication workflows
- ✅ File upload and processing pipelines
- ✅ Real-time chat and question-answering
- ✅ Background processing and status tracking
- ✅ End-to-end user journeys
- ✅ Multi-user scenarios and isolation
- ✅ Error handling and recovery
- ✅ System stability and performance

This testing approach ensures that users can successfully complete their intended workflows and that the system remains stable and reliable under various conditions.
