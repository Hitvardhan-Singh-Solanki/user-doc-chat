# Critical Flow End-to-End Tests

This directory contains comprehensive end-to-end tests for the critical user flows in the AI Legal Document Q&A application. These tests ensure that the most important user journeys work correctly from start to finish.

## Test Files

### 1. `auth-flow.e2e.test.ts`
**Purpose**: Tests the complete user authentication journey
- User registration with validation
- User login with credential verification  
- JWT token generation and validation
- Protected route access
- Session management
- Security features (XSS, SQL injection protection)

### 2. `file-upload-flow.e2e.test.ts`
**Purpose**: Tests the complete file upload and initial processing pipeline
- Authentication requirement
- File validation (type, size, content)
- File storage in MinIO
- Database metadata storage
- Background job queuing
- User isolation
- Error handling

### 3. `chat-flow.e2e.test.ts`
**Purpose**: Tests the WebSocket-based chat and question-answering functionality
- WebSocket connection with JWT authentication
- Question processing and AI response generation
- Chat history management
- Context awareness
- Multi-user isolation
- Error handling

### 4. `file-processing-flow.e2e.test.ts`
**Purpose**: Tests the complete file processing pipeline
- File upload and queuing
- Background processing with gRPC
- Status tracking via REST and SSE
- Vector storage integration
- Error handling and recovery
- Concurrent processing

### 5. `complete-user-journey.e2e.test.ts`
**Purpose**: Tests the entire user workflow from registration to chat interaction
- User registration and login
- Document upload and processing
- WebSocket connection establishment
- Question asking and AI responses
- Chat history persistence
- Follow-up questions and context awareness
- Multi-user scenarios
- System recovery testing

### 6. `grpc-sanitizer.e2e.test.ts`
**Purpose**: Tests gRPC communication between Node.js and Python services
- Service health and connectivity
- Text and PDF file sanitization
- Error handling and edge cases
- Performance and concurrency testing

### 7. `sanitizer-client.e2e.test.ts`
**Purpose**: Tests the actual sanitizer client service integration
- Real service calls using the application's service layer
- Integration with PDF sanitization service
- File processing workflows
- Error handling and performance

## Running the Tests

### Prerequisites
- Python gRPC service must be running
- PostgreSQL and Redis services must be available
- All dependencies must be installed

### Commands

```bash
# Run all e2e tests
npm run test:e2e

# Run critical flow tests only
npm run test:e2e:critical

# Run with watch mode
npm run test:e2e:watch

# Run with coverage
npm run coverage:e2e
```

### Local Development

```bash
# Option 1: Automated script
./scripts/test-e2e-local.sh

# Option 2: Manual setup
# Terminal 1: Start Python service
cd python_service && python main_grpc_server.py

# Terminal 2: Run tests
npm run test:e2e
```

## Test Configuration

### Environment Variables
```bash
NODE_ENV=test
CI=true
SANITIZER_HOST=localhost:50051
SANITIZER_TIMEOUT=10000
SANITIZER_TLS_ENABLED=false
```

### Timeouts
- Test timeout: 60 seconds
- Hook timeout: 30 seconds
- Service startup: 30 seconds
- File processing: 60 seconds
- Chat response: 15 seconds

## Test Coverage

### Authentication Flow
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

### File Upload Flow
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

### Chat Flow
- ✅ WebSocket connection with valid/invalid JWT
- ✅ Question processing and streaming responses
- ✅ No context handling
- ✅ Chat history persistence
- ✅ Context-aware follow-up questions
- ✅ Concurrent chat sessions
- ✅ Multi-user isolation
- ✅ Network disconnection handling
- ✅ Malformed message handling

### File Processing Flow
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

### Complete User Journey
- ✅ Complete end-to-end user workflow
- ✅ Multi-user document isolation
- ✅ System recovery after interruption
- ✅ Context-aware conversations
- ✅ Chat history persistence
- ✅ Follow-up question handling
- ✅ Real document processing
- ✅ AI response quality validation

## Best Practices

### Writing E2E Tests
1. **Real User Scenarios**: Test actual user workflows
2. **Comprehensive Coverage**: Cover all critical paths
3. **Error Scenarios**: Test both success and failure cases
4. **Resource Management**: Proper cleanup and isolation
5. **Performance Validation**: Ensure reasonable response times

### Test Data Management
1. **Automatic Cleanup**: Clean up test data between tests
2. **Isolated Data**: Use unique identifiers for each test
3. **Real Services**: Use actual services, not mocks
4. **Resource Cleanup**: Properly close connections and clean up resources

## Troubleshooting

### Common Issues
1. **Service Not Starting**: Check Python dependencies and port availability
2. **Connection Timeouts**: Verify service is running and accessible
3. **Test Failures**: Check service logs and error messages
4. **Database Issues**: Verify PostgreSQL connection and permissions

### Debug Commands
```bash
# Check if gRPC service is running
netstat -an | grep 50051

# View Python service logs
docker logs <container-name>

# Run single test file
npm run test:e2e -- auth-flow.e2e.test.ts

# Run with verbose output
npm run test:e2e -- --reporter=verbose
```

## CI/CD Integration

The e2e tests are integrated into the GitHub Actions pipeline:

1. **Service Setup**: Python gRPC service is started automatically
2. **Test Execution**: Both unit and e2e tests are run
3. **Coverage**: Test coverage is collected and uploaded
4. **Artifacts**: Test results and logs are uploaded

## Performance

### Test Execution Times
- Authentication Flow: ~30 seconds
- File Upload Flow: ~45 seconds
- Chat Flow: ~60 seconds
- File Processing Flow: ~90 seconds
- Complete User Journey: ~120 seconds

### Optimization
- Parallel test execution where possible
- Service reuse across tests
- Efficient cleanup between tests
- Appropriate timeouts for each operation

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

## Contributing

When adding new e2e tests:

1. **Follow Naming**: Use `.e2e.test.ts` suffix
2. **Add Documentation**: Update this README with new test descriptions
3. **Test Locally**: Verify tests work in local environment
4. **Update CI**: Ensure CI pipeline runs new tests
5. **Performance**: Keep test execution time reasonable
6. **Cleanup**: Ensure proper resource cleanup
7. **Isolation**: Ensure tests don't interfere with each other