# 14_Deployment_DevOps.md

## Production Deployment, DevOps & Infrastructure

**Project:** MyFNG Local AI Manager  
**Version:** 1.0  
**Status:** Production Ready

---

# 1. Objective

This document defines the production deployment architecture, CI/CD pipeline, infrastructure, monitoring, backup strategy, security controls, and operational procedures for MyFNG Local AI Manager.

The goal is to ensure reliable, secure, and scalable deployment with minimal downtime.

---

# 2. Production Architecture

```
                    Users
                      │
                      ▼
             Cloudflare CDN + WAF
                      │
                      ▼
          Next.js Frontend (Vercel)
                      │
                      ▼
      Server Actions / API Routes
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
 Supabase (DB/Auth/Storage)   Edge Functions
          │                       │
          └───────────┬───────────┘
                      ▼
             Redis (Upstash)
                      │
                      ▼
            Background Workers
                      │
          ┌───────────┴────────────┐
          ▼                        ▼
 Google Business Profile APIs   AI Providers
```

---

# 3. Infrastructure Components

Frontend

```
Next.js 15

React 19

TypeScript
```

Backend

```
Supabase

PostgreSQL

Edge Functions
```

Queue

```
Upstash Redis
```

AI

```
OpenAI

Gemini

Claude
```

Monitoring

```
Sentry

PostHog

OpenTelemetry
```

---

# 4. Environments

Development

```
localhost
```

Staging

```
staging.localai.myfng.in
```

Production

```
localai.myfng.in
```

Each environment uses separate:

- Supabase Project
- Google OAuth Credentials
- Environment Variables
- Storage
- Logs

---

# 5. Git Workflow

Main Branches

```
main

develop
```

Feature Branch

```
feature/<feature-name>
```

Bug Fix

```
bugfix/<issue>
```

Hotfix

```
hotfix/<critical-fix>
```

---

# 6. CI/CD Pipeline

Pipeline

```
Developer Push

↓

GitHub

↓

Install Dependencies

↓

Type Check

↓

ESLint

↓

Unit Tests

↓

Build

↓

Deploy to Staging

↓

QA Approval

↓

Production Deploy

↓

Health Check

↓

Deployment Notification
```

Deployment stops if any step fails.

---

# 7. Build Configuration

Node.js

```
Latest LTS
```

Package Manager

```
pnpm
```

Build

```
pnpm install

pnpm lint

pnpm test

pnpm build
```

---

# 8. Environment Variables

Frontend

```
NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Backend

```
SUPABASE_SERVICE_ROLE_KEY

GOOGLE_CLIENT_ID

GOOGLE_CLIENT_SECRET

OPENAI_API_KEY

GEMINI_API_KEY

SMTP_HOST

SMTP_USERNAME

SMTP_PASSWORD

REDIS_URL

CRON_SECRET
```

Never commit `.env` files to source control.

---

# 9. Secrets Management

Secrets stored in

- Supabase Project Secrets
- Deployment Platform Environment Variables

Rotation

- Every 90 days
- Immediately after suspected compromise

---

# 10. Deployment Strategy

Deployment Type

```
Rolling Deployment
```

Steps

1. Deploy frontend
2. Run database migrations
3. Deploy edge functions
4. Restart background workers
5. Verify health checks
6. Enable production traffic

---

# 11. Database Migrations

Rules

- Version controlled
- Reviewed
- Tested on staging
- Applied automatically during deployment

Rollback plan required for every migration.

---

# 12. Background Workers

Workers

- Google Sync
- AI Processing
- Notifications
- Report Generation
- Cleanup

Requirements

- Auto restart
- Health monitoring
- Retry failed jobs
- Queue visibility

---

# 13. Scheduled Jobs

Cron Jobs

```
Review Sync (Every 5 min)

Profile Sync (Every 30 min)

Dashboard Refresh (15 min)

Analytics Sync (Daily)

Report Generation (Daily)

Cleanup (Weekly)
```

---

# 14. Logging

Centralized logs

- Application Logs
- API Logs
- Google API Logs
- AI Logs
- Sync Logs
- Error Logs
- Audit Logs

Retention

```
90 Days
```

---

# 15. Monitoring

Track

- API Response Time
- Database Health
- Storage Usage
- Queue Length
- Worker Status
- Error Rate
- Google API Failures
- AI Provider Failures

---

# 16. Alerting

Notify administrators when

- API unavailable
- Database down
- Queue backlog high
- Google sync fails
- OAuth token expires
- AI provider unavailable
- Storage threshold exceeded

Notification channels

- Email
- Dashboard

Future

- Slack
- WhatsApp

---

# 17. Backup Strategy

Database

- Daily automated backup
- 30-day retention

Storage

- Weekly backup

Configuration

- Version controlled

Verify backups regularly.

---

# 18. Disaster Recovery

Recovery Process

1. Restore database
2. Restore storage
3. Restore environment secrets
4. Restart workers
5. Validate Google connectivity
6. Resume scheduled jobs

Recovery objectives

- Minimal downtime
- No data corruption

---

# 19. Security Hardening

Implement

- HTTPS only
- HSTS
- CSP headers
- Secure cookies
- JWT validation
- Rate limiting
- Input validation
- Output escaping
- Secret rotation
- Audit logging

---

# 20. Performance Targets

Frontend

```
Dashboard Load < 2 sec
```

API

```
Average < 500 ms
```

AI Generation

```
< 10 sec
```

Google Sync

```
Background Processing
```

---

# 21. Scalability

Initial Capacity

- 100 MyFNG locations
- 50 internal users
- 5 million reviews

Future Ready

- 1,000 locations
- 200 internal users
- 50 million reviews

Horizontal scaling supported.

---

# 22. Health Checks

Verify

- Database
- Storage
- Realtime
- Edge Functions
- Redis
- Google APIs
- AI Providers
- SMTP

Health states

```
Healthy

Warning

Critical
```

---

# 23. Production Readiness Checklist

Infrastructure

- DNS configured
- SSL active
- CDN enabled
- WAF enabled

Application

- Environment variables configured
- Database migrated
- Storage buckets created
- RLS policies enabled
- Edge functions deployed
- Cron jobs enabled

Integrations

- Google OAuth verified
- Google APIs enabled
- AI provider connected
- SMTP tested

Operations

- Monitoring enabled
- Alerts configured
- Backups verified
- Health checks passing

---

# 24. Maintenance

Weekly

- Review failed jobs
- Verify backups
- Review error logs

Monthly

- Rotate secrets
- Review API usage
- Archive logs
- Performance review

Quarterly

- Security audit
- Dependency updates
- Disaster recovery drill

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `15_Project_Roadmap.md`