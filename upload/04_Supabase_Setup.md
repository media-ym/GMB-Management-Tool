# 04_Supabase_Setup.md
## Complete Supabase Project Configuration

**Project:** MyFNG Local AI Manager  
**Version:** 1.0  
**Status:** Production Ready

---

# 1. Objective

Configure Supabase as the central backend for MyFNG Local AI Manager.

Supabase will provide:

- Authentication
- PostgreSQL Database
- Storage
- Edge Functions
- Realtime
- Row Level Security
- Cron Jobs
- Database Functions
- API Layer

---

# 2. Supabase Project

Project Name

```
myfng-local-ai
```

Region

```
Mumbai (Preferred)

or

Singapore
```

Database Version

```
Latest PostgreSQL Stable
```

Pricing

```
Production Plan
```

---

# 3. Project Structure

```
Supabase

├── Authentication

├── Database

├── Storage

├── Edge Functions

├── SQL Editor

├── Cron Jobs

├── Realtime

├── Logs

├── API

├── Secrets
```

---

# 4. Authentication Setup

Authentication Provider

```
Email Password

Google OAuth (Internal Login)

Magic Link (Optional)
```

Disable

```
Anonymous Login

Phone OTP

GitHub Login

Apple Login
```

---

# 5. User Registration

Registration

Disabled

Users can only be created by

```
Super Admin
```

---

# 6. Session Configuration

JWT Expiry

```
8 Hours
```

Refresh Token

```
Enabled
```

Remember Login

```
30 Days
```

---

# 7. Password Policy

Minimum

```
12 Characters
```

Require

- Uppercase
- Lowercase
- Number
- Special Character

---

# 8. MFA

Version 1

Disabled

Future

TOTP

Authenticator App

---

# 9. Email Templates

Customize

```
Welcome

Reset Password

Invitation

Email Verification

Account Locked
```

Branding

```
MyFNG Logo

Primary Color

Support Email
```

---

# 10. Database Schemas

Use

```
public

storage

auth
```

Future

```
analytics

archive
```

---

# 11. Storage Buckets

Public

```
business-photos

profile-images

post-images
```

Private

```
reports

exports

documents

ai-cache

backups
```

Maximum Upload

```
20 MB
```

Allowed Types

```
jpg

jpeg

png

webp

pdf
```

---

# 12. Storage Rules

Images

Public Read

Authenticated Upload

Reports

Private

Authenticated Download

Exports

Private

---

# 13. Realtime

Enable

```
reviews

notifications

dashboard_cache

google_posts

analytics_daily
```

Disable

```
audit_logs

api_logs

error_logs
```

---

# 14. Edge Functions

Create

```
sync-google-reviews

sync-google-profile

sync-business-hours

sync-analytics

publish-google-post

reply-review

generate-ai-review

generate-ai-post

generate-report

refresh-dashboard

cleanup

send-notification
```

---

# 15. Secrets

Store

```
GOOGLE_CLIENT_ID

GOOGLE_CLIENT_SECRET

GOOGLE_REDIRECT_URI

OPENAI_API_KEY

GEMINI_API_KEY

SMTP_HOST

SMTP_PORT

SMTP_USERNAME

SMTP_PASSWORD

SUPABASE_SERVICE_ROLE_KEY

CRON_SECRET
```

Never expose secrets to frontend.

---

# 16. Row Level Security

Enable RLS on all application tables.

Policies

Users

- Read own profile
- Update own profile

Roles

- Super Admin only

Locations

- Read for authenticated users
- Write based on role

Reviews

- Read all
- Reply based on permission

Posts

- Marketing roles only

Analytics

- Read only

Settings

- Super Admin only

---

# 17. Database Backups

Automatic Backup

Daily

Retention

30 Days

Manual Backup

Before every production deployment

---

# 18. Scheduled Jobs

Configure pg_cron

Jobs

```
Review Sync

Every 5 Minutes

Business Profile Sync

Every 30 Minutes

Analytics Sync

Daily 2 AM

Dashboard Cache Refresh

Every 15 Minutes

Cleanup Logs

Weekly

Generate Reports

Daily

AI Suggestions

Daily Morning
```

---

# 19. Edge Function Permissions

Public

None

Authenticated

```
Dashboard

Reviews

Posts

Analytics
```

Admin Only

```
Settings

User Management

System Configuration

Token Refresh

Google Resync
```

---

# 20. SQL Functions (RPC)

Implement

```
get_dashboard_summary()

get_review_statistics()

get_average_rating()

get_location_details()

refresh_dashboard_cache()

archive_logs()

calculate_review_score()

generate_location_summary()

search_reviews()

search_posts()
```

---

# 21. Database Extensions

Enable

```
uuid-ossp

pgcrypto

pg_trgm

unaccent

pg_stat_statements

pg_cron
```

---

# 22. Performance Configuration

Connection Pooling

Enabled

Prepared Statements

Enabled

Statement Timeout

30 Seconds

Idle Timeout

10 Minutes

---

# 23. API Configuration

Enable REST API

Enable PostgREST

Disable Public Write Access

Enable JWT Validation

---

# 24. Logging

Enable

Authentication Logs

API Logs

SQL Logs

Edge Function Logs

Storage Logs

Realtime Logs

Retention

90 Days

---

# 25. Monitoring

Monitor

Database CPU

Memory

Storage

Connections

API Requests

Failed Logins

Queue Status

Edge Function Errors

---

# 26. Alerts

Trigger Alerts

Database Down

Storage Full

High CPU

High Error Rate

Google Sync Failure

Expired OAuth Token

Failed Cron Job

---

# 27. Environment Variables

Development

```
.env.local
```

Staging

```
.env.staging
```

Production

```
Supabase Secrets

Cloud Environment Variables
```

Never commit `.env` files to Git.

---

# 28. Security Configuration

- Enforce HTTPS
- Secure Cookies
- JWT Validation
- CSP Headers
- Rate Limiting
- Input Validation
- Output Escaping
- Audit Logging
- Secret Rotation every 90 days

---

# 29. Initial Seed Data

Insert

- Default Roles
- Default Permissions
- Dashboard Widgets
- Notification Types
- AI Models
- Global Settings

---

# 30. Go-Live Checklist

- Supabase Project Created
- Database Migrated
- Storage Buckets Created
- RLS Policies Applied
- Edge Functions Deployed
- Cron Jobs Enabled
- Secrets Configured
- Google OAuth Verified
- SMTP Tested
- Monitoring Enabled
- Backups Enabled
- Health Checks Passing

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `05_Google_Business_Profile_Integration.md`