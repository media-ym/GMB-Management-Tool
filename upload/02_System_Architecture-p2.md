# 02_System_Architecture.md
## Part 2 – Backend Processing, Google Sync Engine & Background Services

**Project:** MyFNG Local AI Manager

**Version:** 1.0

**Status:** Production Architecture

---

# 21. Backend Processing Architecture

All long-running operations must execute asynchronously. The frontend should never wait for Google API synchronization, AI generation, or report creation.

```
                 User Action
                      │
                      ▼
          Next.js Server Action / API
                      │
          Validate Request & Permissions
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
 Immediate Response          Background Queue
                                      │
                         Worker Processes Job
                                      │
                          Update Database
                                      │
                       Notify Dashboard (Realtime)
```

---

# 22. Background Worker Responsibilities

Background workers are responsible for all expensive operations.

### Worker Types

## Google Sync Worker

Responsible for

- Profile Sync
- Reviews Sync
- Business Information
- Posts
- Photos
- Performance Metrics

---

## AI Worker

Responsible for

- AI Review Reply
- AI Posts
- AI Audit
- AI Suggestions
- AI Reports

---

## Report Worker

Responsible for

- Daily Reports
- Weekly Reports
- Monthly Reports
- Export PDF
- Export Excel

---

## Notification Worker

Responsible for

- Dashboard Alerts
- Email Notifications
- Review Alerts
- Sync Failures
- Ranking Alerts

---

## Cleanup Worker

Responsible for

- Delete Temp Files
- Remove Expired Sessions
- Archive Logs
- Cleanup Queue

---

# 23. Queue Design

Each queue is independent.

```
google-sync

review-sync

analytics-sync

post-sync

ai-processing

notifications

reports

image-processing

cleanup
```

Each queue retries failed jobs independently.

---

# 24. Google Synchronization Engine

Google remains the **source of truth**.

Synchronization must never overwrite newer local data without verification.

### Sync Flow

```
Google API

↓

Fetch Latest Data

↓

Validate Response

↓

Normalize Data

↓

Compare Existing Database

↓

Insert New Records

↓

Update Modified Records

↓

Archive Missing Records

↓

Write Audit Log

↓

Update Dashboard
```

---

# 25. Synchronization Frequency

## Reviews

Every 5 minutes

---

## Business Information

Every 30 minutes

---

## Performance Metrics

Daily

---

## Posts

Every 30 minutes

---

## Photos

Daily

---

## Business Attributes

Daily

---

## Categories

Daily

---

## Services

Daily

---

## Products

Daily

---

# 26. Manual Sync

Every screen provides a manual sync option.

Example

```
Dashboard

↓

Sync Reviews

↓

Queue Job

↓

Google API

↓

Database Update

↓

Realtime Refresh
```

---

# 27. Google API Token Management

OAuth tokens are never stored in browser.

Storage

```
Supabase Database

Encrypted

↓

Refresh Token

↓

Access Token

↓

Expiry

↓

Scopes
```

Tokens automatically refresh.

---

# 28. API Rate Limit Protection

Google APIs have request limits.

To avoid hitting limits:

- Queue requests
- Batch operations
- Retry failed requests
- Cache unchanged data
- Exponential backoff

Never execute bulk sync directly from UI.

---

# 29. Retry Strategy

Retry Policy

Attempt 1

↓

Wait 30 sec

↓

Attempt 2

↓

Wait 2 min

↓

Attempt 3

↓

Wait 10 min

↓

Mark Failed

↓

Notify Admin

---

# 30. Failure Recovery

Possible failures

- Google timeout
- OAuth expired
- Invalid payload
- Internet issue
- Rate limit
- Database lock

Recovery

```
Failure

↓

Log

↓

Retry Queue

↓

Still Failed

↓

Admin Notification

↓

Manual Retry
```

No data should be permanently lost.

---

# 31. Data Validation Layer

Every incoming Google response passes validation.

Validate

- Location ID
- Review ID
- Rating
- Dates
- URLs
- Coordinates
- Categories
- Business Status

Invalid data is rejected.

---

# 32. Data Consistency Rules

Each review has a unique Google Review ID.

Each location has one Google Location ID.

Duplicate insertion is never allowed.

Database uses UPSERT instead of INSERT whenever possible.

---

# 33. Event Driven Architecture

Every important action generates an event.

Example Events

```
review.created

review.updated

review.deleted

reply.posted

post.created

post.published

location.synced

analytics.updated

ranking.updated

notification.created
```

Events are processed independently.

---

# 34. Realtime Updates

Supabase Realtime is used.

When

- Review arrives
- AI Reply Generated
- Sync Complete
- Post Published
- Analytics Updated

Dashboard updates automatically.

No manual refresh required.

---

# 35. Scheduled Jobs (Cron)

Cron executes background operations.

### Every 5 Minutes

- Review Sync

---

### Every 30 Minutes

- Business Information Sync
- Post Status Sync

---

### Daily (2 AM)

- Analytics Sync
- Photos Sync
- Category Sync
- Services Sync

---

### Daily (3 AM)

- Generate Daily Report

---

### Weekly

- Weekly Summary

---

### Monthly

- Monthly Performance Report

---

# 36. Caching Strategy

Cache frequently accessed data.

Examples

Dashboard

↓

Analytics

↓

Location Summary

↓

Business Details

↓

Categories

↓

Settings

Cache Duration

Dashboard → 5 min

Analytics → 1 hour

Business Info → 30 min

Settings → Until Changed

---

# 37. Search Architecture

Global search supports

Locations

Reviews

Posts

Keywords

Categories

Search uses PostgreSQL Full Text Search.

Future enhancement

ElasticSearch / Meilisearch

---

# 38. File Processing Pipeline

```
Upload

↓

Virus Scan

↓

Optimize

↓

Compress

↓

Generate Thumbnail

↓

Store

↓

Save Metadata

↓

Return URL
```

Supported

PNG

JPEG

WEBP

PDF

Maximum upload size configurable.

---

# 39. Audit Logging

Every critical action is logged.

Examples

Login

Logout

Google Sync

Delete Post

Publish Post

Reply Review

Change Settings

AI Generation

Permission Change

Each log contains

- User
- Timestamp
- IP
- Action
- Entity
- Previous Value
- New Value

Audit logs are read-only.

---

# 40. Monitoring

Monitor

API Response Time

Google Errors

Database Errors

Queue Length

Worker Health

Memory Usage

Storage

AI Usage

Failed Jobs

Alert if thresholds exceed limits.

---

# 41. Health Checks

System health endpoint verifies

Database

Supabase

Google APIs

Redis Queue

Storage

AI Provider

Background Workers

Status values

Healthy

Warning

Critical

---

# 42. Backup Strategy

Database Backup

Daily

Storage Backup

Weekly

Configuration Backup

Daily

Secrets Backup

Secure Vault

Retention period configurable.

---

# 43. Disaster Recovery

Recovery priorities

1. Restore Database

2. Restore Storage

3. Restore OAuth Tokens

4. Restart Workers

5. Resume Sync

Recovery objective

Minimal downtime with no loss of business data.

---

# 44. Security Considerations

- Google OAuth credentials stored securely.
- Service role keys never exposed to frontend.
- All backend endpoints validate authenticated users.
- Row Level Security (RLS) enabled where applicable.
- Sensitive logs masked.
- Secrets managed through Supabase project secrets or secure environment variables.

---

# 45. Architecture Principles

The platform follows these principles:

- Backend-first processing
- Event-driven updates
- Google as source of truth
- Asynchronous execution
- Modular services
- Secure by default
- Scalable background processing
- Observable through logs and metrics
- Fault tolerant with retries
- Easy to extend with future integrations

---

# End of Part 2

Part 3 will cover:

- API Architecture
- AI Service Architecture (MiSA AI)
- Dashboard Rendering Strategy
- Security Model
- Permission Matrix
- Deployment Topology
- DevOps Pipeline
- CI/CD
- Environment Strategy
- Production Scaling
- Performance Optimization
- Future Extensibility