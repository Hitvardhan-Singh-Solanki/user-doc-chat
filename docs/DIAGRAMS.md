# 📊 System Diagrams & User Flows

This document contains comprehensive Mermaid diagrams showing the important user flows, system architecture, and data flows of the AI Legal Document Q&A App.

## 🔄 Important User Flows

### Complete User Journey

```mermaid
flowchart TD
    A[User Visits App] --> B{Authenticated?}
    B -->|No| C[Login/Signup]
    B -->|Yes| D[Dashboard]
    
    C --> E[Enter Credentials]
    E --> F[Auth Service]
    F --> G{Valid?}
    G -->|No| H[Show Error]
    G -->|Yes| I[Generate JWT Token]
    I --> J[Store in Local Storage]
    J --> D
    
    D --> K[Upload Document]
    K --> L[File Validation]
    L --> M{Valid File?}
    M -->|No| N[Show Upload Error]
    M -->|Yes| O[Upload to MinIO]
    O --> P[Store Metadata in PostgreSQL]
    P --> Q[Queue Processing Job]
    Q --> R[Background Worker]
    
    R --> S[Download & Sanitize File]
    S --> T[Chunk Document]
    T --> U[Generate Embeddings]
    U --> V[Store in Pinecone]
    V --> W[Update File Status]
    W --> X[Notify User via SSE]
    
    X --> Y[Document Ready]
    Y --> Z[Start Chat Session]
    Z --> AA[Ask Questions]
    AA --> BB[Vector Search]
    BB --> CC[Retrieve Context]
    CC --> DD[Generate AI Response]
    DD --> EE[Stream Response]
    EE --> FF[Continue Conversation]
    
    H --> E
    N --> K
    FF --> AA
    
    style A fill:#e1f5fe
    style D fill:#f3e5f5
    style Y fill:#e8f5e8
    style FF fill:#fff3e0
```

### Enhanced File Upload & Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Express as Express API
    participant Auth as Auth Middleware
    participant MinIO as MinIO Storage
    participant PostgreSQL as PostgreSQL DB
    participant BullMQ as BullMQ Queue
    participant Worker as File Worker
    participant Sanitizer as Sanitization Service
    participant LLM as LLM Service
    participant Pinecone as Pinecone Vector DB
    participant Redis as Redis Cache
    participant SSE as SSE Emitter

    User->>Frontend: Select & Upload File
    Frontend->>Express: POST /upload (multipart/form-data)
    Express->>Auth: Validate JWT Token
    Auth-->>Express: User ID & Permissions
    
    Express->>Express: Validate File Type & Size
    alt File Valid
        Express->>MinIO: Upload Raw File
        MinIO-->>Express: File Uploaded Successfully
        Express->>PostgreSQL: Insert File Metadata
        PostgreSQL-->>Express: File Record Created
        Express->>BullMQ: Enqueue Processing Job
        BullMQ-->>Express: Job Queued
        Express-->>Frontend: 201 Created
        Frontend-->>User: Upload Success Message
    else File Invalid
        Express-->>Frontend: 400 Bad Request
        Frontend-->>User: Upload Error Message
    end
    
    Frontend->>Express: GET /file/status/:fileId (SSE)
    Express->>SSE: Register Client for Updates
    
    BullMQ->>Worker: Process File Job
    Worker->>Worker: Update Progress (10%)
    Worker->>MinIO: Download File
    Worker->>Sanitizer: Sanitize Content
    Sanitizer-->>Worker: Cleaned Text
    Worker->>Worker: Update Progress (40%)
    Worker->>Worker: Chunk Document
    Worker->>Worker: Update Progress (60%)
    
    loop For Each Chunk
        Worker->>LLM: Generate Embedding
        LLM-->>Worker: Vector Embedding
        Worker->>Pinecone: Store Vector
        Pinecone-->>Worker: Vector Stored
    end
    
    Worker->>Worker: Update Progress (90%)
    Worker->>PostgreSQL: Update File Status
    Worker->>BullMQ: Job Completed
    BullMQ->>Redis: Publish Completion Event
    Redis->>SSE: Notify Completion
    SSE-->>Frontend: Processing Complete
    Frontend-->>User: Document Ready for Chat
```

### Real-time Chat & Question Answering Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant WebSocket as WebSocket Server
    participant Auth as Auth Middleware
    participant Chat as Chat Service
    participant LLM as LLM Service
    participant Vector as Vector Service
    participant Pinecone as Pinecone DB
    participant Redis as Redis Cache
    participant Enrichment as Enrichment Service
    participant External as External APIs

    User->>Frontend: Ask Question
    Frontend->>WebSocket: Send Question (WebSocket)
    WebSocket->>Auth: Validate JWT Token
    Auth-->>WebSocket: User Authenticated
    
    WebSocket->>Chat: Process Question
    Chat->>Chat: Store Question in History
    Chat->>LLM: Generate Query Embedding
    LLM-->>Chat: Query Vector
    
    Chat->>Vector: Search Similar Vectors
    Vector->>Pinecone: Query Vector Database
    Pinecone-->>Vector: Similar Chunks
    Vector-->>Chat: Relevant Context
    
    alt Context Found
        Chat->>Chat: Format Context & History
        Chat->>LLM: Generate Answer with Context
        LLM-->>Chat: Stream Response
        Chat-->>WebSocket: Stream Answer Chunks
        WebSocket-->>Frontend: Real-time Answer
        Frontend-->>User: Display Answer
    else No Context Found
        Chat->>Enrichment: Trigger Enrichment
        Enrichment->>External: Search External Sources
        External-->>Enrichment: External Data
        Enrichment-->>Chat: Enriched Context
        Chat->>LLM: Generate Enriched Answer
        LLM-->>Chat: Enhanced Response
        Chat-->>WebSocket: Stream Enhanced Answer
        WebSocket-->>Frontend: Enhanced Answer
        Frontend-->>User: Display Enhanced Answer
    end
    
    Chat->>Redis: Store Chat History
    Chat->>Chat: Update Conversation Context
```

### Security & Authentication Flow

```mermaid
flowchart TD
    A[User Request] --> B{Has JWT Token?}
    B -->|No| C[Redirect to Login]
    B -->|Yes| D[Validate Token]
    
    D --> E{Token Valid?}
    E -->|No| F[Token Expired/Invalid]
    E -->|Yes| G[Extract User Info]
    
    F --> H[Return 401 Unauthorized]
    C --> I[Login Form]
    I --> J[Submit Credentials]
    J --> K[Auth Service]
    
    K --> L{Valid Credentials?}
    L -->|No| M[Invalid Login Error]
    L -->|Yes| N[Generate JWT Token]
    N --> O[Store Token Securely]
    O --> P[Redirect to Dashboard]
    
    G --> Q[Check User Permissions]
    Q --> R{Authorized?}
    R -->|No| S[403 Forbidden]
    R -->|Yes| T[Process Request]
    
    M --> I
    S --> U[Access Denied Message]
    H --> V[Login Required Message]
    
    style A fill:#e3f2fd
    style T fill:#e8f5e8
    style S fill:#ffebee
    style H fill:#ffebee
```

## 🏗️ System Architecture & Data Flow

### Comprehensive System Architecture

```mermaid
flowchart TB
    subgraph "Client Layer"
        UI[React Frontend]
        WS[WebSocket Client]
        SSE[SSE Client]
    end
    
    subgraph "API Gateway"
        LB[Load Balancer]
        API[Express API Server]
        MW[Middleware Layer]
    end
    
    subgraph "Authentication"
        JWT[JWT Validation]
        RBAC[Role-Based Access Control]
        SESS[Session Management]
    end
    
    subgraph "Core Services"
        subgraph "File Processing"
            FUP[File Upload Service]
            FPROC[File Processing Worker]
            SAN[Sanitization Service]
        end
        
        subgraph "AI Services"
            LLM[LLM Service]
            EMB[Embedding Service]
            PROMPT[Prompt Service]
        end
        
        subgraph "Chat Services"
            CHAT[Chat Service]
            ENRICH[Enrichment Service]
            HIST[Chat History Service]
        end
        
        subgraph "Search Services"
            VEC[Vector Search Service]
            SIM[Similarity Search]
            RANK[Relevance Ranking]
        end
    end
    
    subgraph "Data Layer"
        subgraph "Primary Storage"
            PG[(PostgreSQL)]
            REDIS[(Redis Cache)]
        end
        
        subgraph "File Storage"
            MINIO[MinIO/S3 Storage]
            CDN[Content Delivery Network]
        end
        
        subgraph "Vector Storage"
            PINECONE[(Pinecone Vector DB)]
            VECTORS[Vector Embeddings]
        end
    end
    
    subgraph "External Services"
        HF[Hugging Face API]
        SEARCH[Search APIs]
        WEB[Web Scraping]
    end
    
    subgraph "Queue System"
        BULLMQ[BullMQ Queue]
        WORKER[Background Workers]
        EVENTS[Event System]
    end
    
    subgraph "Monitoring"
        LOGS[Structured Logging]
        METRICS[Prometheus Metrics]
        ALERTS[Alert System]
    end
    
    UI --> LB
    WS --> LB
    SSE --> LB
    LB --> API
    API --> MW
    MW --> JWT
    JWT --> RBAC
    RBAC --> SESS
    
    API --> FUP
    API --> CHAT
    FUP --> BULLMQ
    BULLMQ --> FPROC
    FPROC --> SAN
    FPROC --> MINIO
    FPROC --> EMB
    EMB --> PINECONE
    
    CHAT --> LLM
    CHAT --> VEC
    VEC --> PINECONE
    VEC --> SIM
    SIM --> RANK
    
    CHAT --> ENRICH
    ENRICH --> SEARCH
    ENRICH --> WEB
    
    API --> PG
    API --> REDIS
    CHAT --> HIST
    HIST --> REDIS
    
    FPROC --> EVENTS
    EVENTS --> SSE
    
    API --> LOGS
    CHAT --> METRICS
    METRICS --> ALERTS
    
    style UI fill:#e1f5fe
    style API fill:#f3e5f5
    style PG fill:#e8f5e8
    style PINECONE fill:#fff3e0
    style MINIO fill:#fce4ec
```

### Domain-Driven Architecture

```mermaid
flowchart TB
    subgraph "Frontend Layer"
        REACT[React Application]
        COMPONENTS[UI Components]
        STATE[State Management]
    end
    
    subgraph "API Layer"
        EXPRESS[Express Server]
        ROUTES[Route Handlers]
        MIDDLEWARE[Middleware Stack]
    end
    
    subgraph "Domain Layer"
        subgraph "Auth Domain"
            AUTH_CTRL[Auth Controller]
            AUTH_SVC[Auth Service]
            AUTH_REPO[Auth Repository]
        end
        
        subgraph "Files Domain"
            FILE_CTRL[File Controller]
            FILE_SVC[File Upload Service]
            FILE_WORKER[File Processing Worker]
            SANITIZER[Sanitization Service]
        end
        
        subgraph "Chat Domain"
            CHAT_CTRL[Chat Controller]
            CHAT_SVC[Chat Service]
            LLM_SVC[LLM Service]
            PROMPT_SVC[Prompt Service]
        end
        
        subgraph "Vector Domain"
            VECTOR_SVC[Vector Service]
            EMBEDDING_SVC[Embedding Service]
            SEARCH_SVC[Search Service]
        end
    end
    
    subgraph "Infrastructure Layer"
        subgraph "Database"
            POSTGRES[(PostgreSQL)]
            REDIS_CACHE[(Redis)]
        end
        
        subgraph "Storage"
            MINIO_STORAGE[MinIO Storage]
            S3_COMPAT[S3 Compatible]
        end
        
        subgraph "External APIs"
            HUGGINGFACE[Hugging Face]
            PINECONE_API[Pinecone API]
            SEARCH_APIS[Search APIs]
        end
        
        subgraph "Queue System"
            BULLMQ_QUEUE[BullMQ Queue]
            WORKERS[Background Workers]
        end
    end
    
    REACT --> EXPRESS
    EXPRESS --> ROUTES
    ROUTES --> MIDDLEWARE
    
    MIDDLEWARE --> AUTH_CTRL
    MIDDLEWARE --> FILE_CTRL
    MIDDLEWARE --> CHAT_CTRL
    
    AUTH_CTRL --> AUTH_SVC
    AUTH_SVC --> AUTH_REPO
    AUTH_REPO --> POSTGRES
    
    FILE_CTRL --> FILE_SVC
    FILE_SVC --> BULLMQ_QUEUE
    BULLMQ_QUEUE --> FILE_WORKER
    FILE_WORKER --> SANITIZER
    FILE_WORKER --> MINIO_STORAGE
    FILE_WORKER --> EMBEDDING_SVC
    EMBEDDING_SVC --> PINECONE_API
    
    CHAT_CTRL --> CHAT_SVC
    CHAT_SVC --> LLM_SVC
    CHAT_SVC --> VECTOR_SVC
    VECTOR_SVC --> PINECONE_API
    LLM_SVC --> HUGGINGFACE
    CHAT_SVC --> REDIS_CACHE
    
    style REACT fill:#e1f5fe
    style EXPRESS fill:#f3e5f5
    style POSTGRES fill:#e8f5e8
    style PINECONE_API fill:#fff3e0
    style MINIO_STORAGE fill:#fce4ec
```

## 🔄 Data Flow Diagrams

### Document Processing Pipeline

```mermaid
flowchart LR
    A[Raw Document] --> B[File Upload]
    B --> C[Validation]
    C --> D[MinIO Storage]
    D --> E[Queue Job]
    E --> F[Background Worker]
    F --> G[Download File]
    G --> H[Sanitization]
    H --> I[Text Extraction]
    I --> J[Document Chunking]
    J --> K[Generate Embeddings]
    K --> L[Vector Storage]
    L --> M[Update Status]
    M --> N[Notify User]
    
    style A fill:#ffebee
    style N fill:#e8f5e8
    style L fill:#fff3e0
```

### Query Processing Pipeline

```mermaid
flowchart LR
    A[User Question] --> B[WebSocket Connection]
    B --> C[Authentication]
    C --> D[Generate Query Embedding]
    D --> E[Vector Search]
    E --> F[Retrieve Context]
    F --> G[Format Prompt]
    G --> H[LLM Generation]
    H --> I[Stream Response]
    I --> J[Update Chat History]
    J --> K[Return to User]
    
    style A fill:#e3f2fd
    style K fill:#e8f5e8
    style H fill:#fff3e0
```

## 🔒 Security Flow Diagrams

### Authentication & Authorization

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Auth
    participant DB
    participant Redis
    
    Client->>API: Login Request
    API->>Auth: Validate Credentials
    Auth->>DB: Check User
    DB-->>Auth: User Data
    Auth->>Auth: Verify Password
    Auth->>Auth: Generate JWT
    Auth-->>API: JWT Token
    API-->>Client: Authentication Success
    
    Client->>API: Protected Request
    API->>Auth: Validate JWT
    Auth->>Redis: Check Token Blacklist
    Redis-->>Auth: Token Status
    Auth-->>API: User Authorized
    API-->>Client: Protected Resource
```

### File Security Flow

```mermaid
flowchart TD
    A[File Upload] --> B[File Type Validation]
    B --> C[Size Check]
    C --> D[Virus Scan]
    D --> E[Content Sanitization]
    E --> F[Secure Storage]
    F --> G[Access Control]
    G --> H[User Authorization]
    H --> I[File Access]
    
    B -->|Invalid| J[Reject Upload]
    C -->|Too Large| J
    D -->|Infected| J
    
    style A fill:#e3f2fd
    style I fill:#e8f5e8
    style J fill:#ffebee
```

## 📊 Performance & Monitoring

### System Monitoring Flow

```mermaid
flowchart TB
    subgraph "Application Layer"
        APP[Express App]
        WS[WebSocket Server]
        WORKER[Background Workers]
    end
    
    subgraph "Monitoring Stack"
        LOGS[Structured Logging]
        METRICS[Prometheus Metrics]
        TRACES[Distributed Tracing]
        ALERTS[Alert Manager]
    end
    
    subgraph "Observability"
        GRAFANA[Grafana Dashboards]
        PROMETHEUS[Prometheus Server]
        ELK[ELK Stack]
    end
    
    APP --> LOGS
    WS --> METRICS
    WORKER --> TRACES
    
    LOGS --> ELK
    METRICS --> PROMETHEUS
    TRACES --> GRAFANA
    
    PROMETHEUS --> ALERTS
    ALERTS --> GRAFANA
    
    style APP fill:#e1f5fe
    style GRAFANA fill:#e8f5e8
    style ALERTS fill:#fff3e0
```

---

## 📚 Related Documentation

- [Architecture Guide](./ARCHITECTURE.md) - Detailed system architecture
- [API Documentation](./API.md) - Complete API reference
- [Features Guide](./FEATURES.md) - Feature capabilities and use cases
- [Setup Guide](./SETUP.md) - Installation and configuration
- [Security Analysis](./SECURITY_ANALYSIS.md) - Security considerations
