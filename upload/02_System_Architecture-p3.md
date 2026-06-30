# 02_System_Architecture.md
## Part 3A – API Architecture, AI Engine, Security & Permissions

**Project:** MyFNG Local AI Manager  
**Version:** 1.0

---

# 46. API Architecture

## Overview

The frontend must never communicate directly with Google Business Profile APIs.

All requests flow through the backend.

```
Browser

↓

Next.js Server Actions / API Routes

↓

Authentication Middleware

↓

Business Logic Layer

↓

Supabase Database

↓

Google Business Profile APIs

↓

Response

↓

Frontend
```

---

# 47. API Layers

The backend is divided into independent layers.

```
Presentation Layer

↓

Authentication Layer

↓

Authorization Layer

↓

Validation Layer

↓

Business Logic Layer

↓

Service Layer

↓

Google Integration Layer

↓

Database Layer
```

Each layer has only one responsibility.

---

# 48. Service Architecture

Independent services:

```
AuthService

LocationService

GoogleService

ReviewService

ReplyService

AnalyticsService

SEOService

KeywordService

PostService

MediaService

NotificationService

AIService

AuditService

ReportService

SettingsService
```

Services must not directly depend on each other.

---

# 49. API Naming Convention

```
GET

POST

PUT

PATCH

DELETE
```

Example

```
GET /api/locations

GET /api/reviews

POST /api/reviews/{id}/reply

POST /api/posts

PUT /api/location/{id}

DELETE /api/post/{id}
```

---

# 50. API Response Format

Every API returns a standard format.

```json
{
  "success": true,
  "message": "Operation completed",
  "data": {},
  "errors": null,
  "timestamp": "ISO_DATE"
}
```

---

# 51. Authentication Flow

```
User Login

↓

Supabase Auth

↓

JWT

↓

Middleware

↓

Permission Check

↓

API

↓

Response
```

Sessions are refreshed automatically.

---

# 52. Authorization Model

Permissions are role-based.

Roles:

```
Super Admin

Marketing Manager

Branch Manager

Customer Support

Viewer
```

Permissions are checked before every request.

---

# 53. Role Matrix

### Super Admin

✔ Full access

---

### Marketing Manager

✔ Reviews

✔ Posts

✔ Analytics

✔ AI

✖ User Management

---

### Branch Manager

✔ Assigned Locations

✔ Reviews

✔ Posts

✖ Global Settings

---

### Customer Support

✔ Reviews

✔ AI Reply

✖ Posts

✖ Analytics

---

### Viewer

✔ Dashboard

✔ Reports

✖ Edit Operations

---

# 54. AI Architecture (MiSA AI)

MiSA AI is a backend service layer responsible for intelligent automation.

Capabilities:

- AI Review Reply
- AI Google Post
- AI Performance Summary
- AI Local SEO Suggestions
- AI Business Description
- AI Category Suggestions
- AI FAQ Drafts
- AI Monthly Reports

---

# 55. AI Request Flow

```
User Action

↓

Validation

↓

Prompt Builder

↓

Model Selection

↓

OpenAI / Gemini / Claude

↓

Response Validation

↓

Safety Filter

↓

Save History

↓

Return Response
```

---

# 56. Prompt Management

Prompts are version controlled.

Each prompt includes:

- Purpose
- Variables
- Expected Output
- Language
- Tone
- Max Length

No prompt is hardcoded inside UI components.

---

# 57. AI Safety Rules

Before displaying AI output:

- Validate response
- Remove unsupported claims
- Strip unsafe HTML
- Limit length
- Escape scripts
- Store original response

---

# 58. AI Usage Logging

Every request records:

- User
- Prompt Type
- Model
- Tokens
- Cost (optional)
- Duration
- Status
- Timestamp

Used for auditing and optimization.

---

# 59. Google API Security

Credentials are never exposed.

Store:

- Client ID
- Client Secret
- Refresh Token

Inside secure backend only.

Access tokens are refreshed automatically.

---

# 60. Secrets Management

Sensitive values:

- Google Client Secret
- OpenAI Key
- Gemini Key
- Supabase Service Role
- SMTP Credentials

Stored as encrypted environment variables.

Never commit secrets to Git.

---

# 61. Input Validation

Validate every request:

- Required fields
- String length
- Email format
- URLs
- Google IDs
- Image size
- MIME type

Reject invalid payloads immediately.

---

# 62. Rate Limiting

Protect backend APIs.

Examples:

- Login
- AI Generation
- Google Sync
- File Upload

Excessive requests return HTTP 429.

---

# 63. CSRF & XSS Protection

Use:

- CSRF tokens where applicable
- Escaped HTML output
- Secure cookies
- Content Security Policy (CSP)
- SameSite cookies

---

# 64. File Upload Security

Every uploaded file:

- MIME validation
- Size validation
- Virus scan (future)
- Filename sanitization
- Metadata extraction

Unsupported files are rejected.

---

# 65. Audit & Compliance

Every critical action is logged.

Examples:

- Login
- Logout
- Review Reply
- Google Sync
- Settings Update
- AI Generation
- Role Change

Audit logs cannot be edited.

---

# 66. Error Handling Strategy

Errors are categorized:

- Validation Error
- Authentication Error
- Authorization Error
- Google API Error
- AI Provider Error
- Database Error
- Network Error
- Internal Server Error

Each category returns a consistent response.

---

# 67. Observability

Track:

- API latency
- Failed requests
- Queue backlog
- Google sync status
- AI processing time
- Storage usage
- Worker health

Expose internal dashboards for administrators.

---

# End of Part 3A

Part 3B will cover:

- Production Deployment
- Docker Architecture
- CI/CD Pipeline
- Environment Strategy
- Monitoring & Alerting
- Backup & Disaster Recovery
- Scaling Strategy
- Production Readiness Checklist
- Future Architecture Extensions