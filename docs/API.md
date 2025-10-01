# 📚 API Documentation

## Base URL

```
Production: https://your-domain.com/api
Development: http://localhost:3000/api
```

## Authentication

All API endpoints (except signup/login) require a valid JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

## Authentication Endpoints

### `POST /auth/signup`

Create a new user account.

**Request:**
```typescript
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (201):**
```typescript
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `409 Conflict`: Email already in use
- `400 Bad Request`: Invalid email format or weak password
- `422 Unprocessable Entity`: Validation errors

---

### `POST /auth/login`

Login with existing credentials.

**Request:**
```typescript
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (200):**
```typescript
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid credentials
- `400 Bad Request`: Missing email or password
- `422 Unprocessable Entity`: Validation errors

---

## Document Management

### `POST /upload`

Upload a new document for processing.

**Request (multipart/form-data):**
```typescript
{
  "file": File,           // Required: PDF, DOCX, or TXT file
  "metadata": {           // Optional: Additional metadata
    "title": "Contract 2024",
    "description": "Legal contract document",
    "tags": ["legal", "contract"]
  }
}
```

**Response (202 Accepted):**
```typescript
{
  "fileId": "file-123",
  "status": "processing",
  "message": "File uploaded successfully and queued for processing"
}
```

**Error Responses:**
- `413 Payload Too Large`: File exceeds size limit (10MB)
- `415 Unsupported Media Type`: Invalid file format
- `400 Bad Request`: Missing file or invalid metadata
- `401 Unauthorized`: Invalid or missing authentication token

**Supported File Types:**
- PDF (`.pdf`)
- Microsoft Word (`.docx`)
- Plain Text (`.txt`)

---

### `GET /file/status/:fileId`

Get real-time file processing status via Server-Sent Events (SSE).

**Headers:**
```http
Accept: text/event-stream
Cache-Control: no-cache
```

**SSE Events:**

**Progress Update:**
```typescript
{
  "type": "progress",
  "data": {
    "fileId": "file-123",
    "progress": 45,
    "stage": "embedding",
    "message": "Processing document chunks..."
  }
}
```

**Completion:**
```typescript
{
  "type": "completed",
  "data": {
    "fileId": "file-123",
    "status": "completed",
    "vectors": 150,
    "chunks": 25,
    "processingTime": 12000
  }
}
```

**Error:**
```typescript
{
  "type": "error",
  "data": {
    "fileId": "file-123",
    "error": "Failed to process document",
    "details": "Invalid file format"
  }
}
```

---

### `GET /files`

List all user's uploaded files.

**Response (200):**
```typescript
{
  "files": [
    {
      "id": "file-123",
      "name": "contract.pdf",
      "size": 1024000,
      "status": "completed",
      "uploadedAt": "2024-01-01T00:00:00.000Z",
      "processedAt": "2024-01-01T00:01:00.000Z",
      "vectors": 150,
      "chunks": 25
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### `DELETE /files/:fileId`

Delete a file and all associated data.

**Response (200):**
```typescript
{
  "message": "File deleted successfully",
  "fileId": "file-123"
}
```

**Error Responses:**
- `404 Not Found`: File not found
- `403 Forbidden`: User doesn't own the file

---

## Query Endpoints

### `POST /query`

Query documents with natural language questions.

**Request:**
```typescript
{
  "question": "What are the payment terms?",
  "fileId": "file-123",    // Optional: Query specific file
  "topK": 5,               // Optional: Number of relevant chunks (default: 3)
  "includeSources": true   // Optional: Include source references (default: true)
}
```

**Response (200):**
```typescript
{
  "answer": "According to section 4.2 of the contract, payment terms are net 30 days from invoice date...",
  "confidence": 0.92,
  "sources": [
    {
      "text": "Payment terms: Net 30 days from invoice date...",
      "fileId": "file-123",
      "chunkId": "chunk-456",
      "score": 0.95,
      "page": 4
    }
  ],
  "processingTime": 1200,
  "tokensUsed": 150
}
```

**Error Responses:**
- `400 Bad Request`: Invalid question or parameters
- `404 Not Found`: File not found (when fileId specified)
- `401 Unauthorized`: Invalid authentication

---

## WebSocket Chat

### Connection

Connect to the chat WebSocket endpoint:

```typescript
const ws = new WebSocket('ws://localhost:3000/chat?token=eyJhbG...');
```

### Message Types

#### Send Question
```typescript
{
  "type": "question",
  "data": {
    "text": "What are the key terms in this contract?",
    "fileId": "file-123"  // Optional: Query specific file
  }
}
```

#### Receive Answer Stream
```typescript
{
  "type": "answer_chunk",
  "data": {
    "token": "Based on the document, the key terms include...",
    "done": false
  }
}

{
  "type": "answer_complete",
  "data": {
    "message": "Answer generation completed"
  }
}
```

#### Error Response
```typescript
{
  "type": "error",
  "data": {
    "message": "Failed to process question",
    "error": "Invalid file ID"
  }
}
```

### WebSocket Events

| Event | Description |
|-------|-------------|
| `question` | Send a question to the AI |
| `answer_chunk` | Receive streaming answer tokens |
| `answer_complete` | Answer generation finished |
| `error` | Error occurred during processing |

---

## Health Check

### `GET /health`

Check API health status.

**Response (200):**
```typescript
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "vectorStore": "healthy",
    "storage": "healthy"
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid request format |
| `401` | Unauthorized - Invalid or missing authentication |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource not found |
| `409` | Conflict - Resource already exists |
| `413` | Payload Too Large - File size exceeds limit |
| `415` | Unsupported Media Type - Invalid file format |
| `422` | Unprocessable Entity - Validation errors |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Server error |

## Rate Limiting

- **Authentication endpoints**: 5 requests per minute per IP
- **File upload**: 10 requests per hour per user
- **Query endpoints**: 100 requests per hour per user
- **WebSocket connections**: 5 concurrent connections per user

## Response Format

All API responses follow a consistent format:

**Success Response:**
```typescript
{
  "data": { /* response data */ },
  "message": "Success message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Error Response:**
```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": { /* specific error details */ }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { UserDocChatAPI } from '@user-doc-chat/sdk';

const api = new UserDocChatAPI({
  baseURL: 'https://api.your-domain.com',
  token: 'your-jwt-token'
});

// Upload a file
const file = new File(['content'], 'document.pdf');
const uploadResult = await api.uploadFile(file);

// Query documents
const result = await api.query({
  question: "What are the payment terms?",
  fileId: uploadResult.fileId
});

console.log(result.answer);
```

### Python

```python
from user_doc_chat import UserDocChatAPI

api = UserDocChatAPI(
    base_url="https://api.your-domain.com",
    token="your-jwt-token"
)

# Upload a file
with open("document.pdf", "rb") as f:
    upload_result = api.upload_file(f)

# Query documents
result = api.query(
    question="What are the payment terms?",
    file_id=upload_result.file_id
)

print(result.answer)
```

## Webhooks

### File Processing Complete

**Endpoint:** `POST /webhooks/file-processing`

**Payload:**
```typescript
{
  "event": "file.processing.completed",
  "data": {
    "fileId": "file-123",
    "userId": "user-456",
    "status": "completed",
    "vectors": 150,
    "chunks": 25,
    "processingTime": 12000
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Query Analytics

**Endpoint:** `POST /webhooks/query-analytics`

**Payload:**
```typescript
{
  "event": "query.analytics",
  "data": {
    "userId": "user-456",
    "fileId": "file-123",
    "question": "What are the payment terms?",
    "confidence": 0.92,
    "processingTime": 1200,
    "tokensUsed": 150
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```
