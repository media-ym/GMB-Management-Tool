# 03_Supabase_Database.md
## Part 3 – Notifications, Audit, Security, RLS, RPC & Database Operations

**Project:** MyFNG Local AI Manager  
**Database:** PostgreSQL (Supabase)  
**Status:** Production Ready

---

# 46. Notifications

## notifications

Stores all system notifications.

| Column | Type |
|---------|------|
| id | UUID |
| title | TEXT |
| message | TEXT |
| notification_type | TEXT |
| priority | TEXT |
| user_id | UUID |
| profile_id | UUID |
| is_read | BOOLEAN |
| action_url | TEXT |
| metadata | JSONB |
| created_at | TIMESTAMP |

Notification Types

```
Review

Google Sync

AI

Analytics

Ranking

System

Security
```

Priority

```
Low

Medium

High

Critical
```

---

# 47. Activity Logs

## activity_logs

Stores every user action.

| Column | Type |
|---------|------|
| id | UUID |
| user_id | UUID |
| module | TEXT |
| action | TEXT |
| entity_type | TEXT |
| entity_id | UUID |
| ip_address | TEXT |
| user_agent | TEXT |
| created_at | TIMESTAMP |

Examples

```
Created Google Post

Replied Review

Deleted Draft

Exported Report

Updated Business Hours

Changed Category
```

---

# 48. Audit Logs

## audit_logs

Immutable audit trail.

| Column | Type |
|---------|------|
| id | UUID |
| table_name | TEXT |
| record_id | UUID |
| operation | TEXT |
| old_data | JSONB |
| new_data | JSONB |
| changed_by | UUID |
| changed_at | TIMESTAMP |

Operations

```
INSERT

UPDATE

DELETE
```

Audit records cannot be edited.

---

# 49. Background Jobs

## background_jobs

Queue metadata.

| Column | Type |
|---------|------|
| id | UUID |
| queue_name | TEXT |
| job_name | TEXT |
| payload | JSONB |
| status | TEXT |
| attempts | INTEGER |
| started_at | TIMESTAMP |
| completed_at | TIMESTAMP |
| error_message | TEXT |
| created_at | TIMESTAMP |

Queues

```
google-sync

review-sync

analytics-sync

ai-processing

notifications

reports
```

---

# 50. Scheduled Jobs

## scheduled_jobs

Cron configuration.

| Column | Type |
|---------|------|
| id | UUID |
| job_name | TEXT |
| cron_expression | TEXT |
| is_enabled | BOOLEAN |
| last_run | TIMESTAMP |
| next_run | TIMESTAMP |
| created_at | TIMESTAMP |

Examples

```
Review Sync

Analytics Sync

Generate Daily Report

Cleanup Logs

Refresh Dashboard Cache
```

---

# 51. Error Logs

## error_logs

| Column | Type |
|---------|------|
| id | UUID |
| module | TEXT |
| error_code | TEXT |
| error_message | TEXT |
| stack_trace | TEXT |
| payload | JSONB |
| resolved | BOOLEAN |
| created_at | TIMESTAMP |

---

# 52. API Tokens

## api_tokens

Stores integration credentials.

| Column | Type |
|---------|------|
| id | UUID |
| provider | TEXT |
| token_name | TEXT |
| encrypted_value | TEXT |
| expires_at | TIMESTAMP |
| status | TEXT |
| created_at | TIMESTAMP |

Providers

```
Google

OpenAI

Gemini

SMTP
```

---

# 53. File Metadata

## storage_files

Tracks Supabase Storage files.

| Column | Type |
|---------|------|
| id | UUID |
| bucket | TEXT |
| object_name | TEXT |
| original_name | TEXT |
| mime_type | TEXT |
| file_size | BIGINT |
| uploaded_by | UUID |
| created_at | TIMESTAMP |

---

# 54. Webhooks

## webhooks

Future integration support.

| Column | Type |
|---------|------|
| id | UUID |
| provider | TEXT |
| event_name | TEXT |
| payload | JSONB |
| processed | BOOLEAN |
| processed_at | TIMESTAMP |
| created_at | TIMESTAMP |

---

# 55. Dashboard Widgets

## dashboard_widgets

Stores configurable dashboard cards.

| Column | Type |
|---------|------|
| id | UUID |
| widget_key | TEXT |
| title | TEXT |
| display_order | INTEGER |
| is_enabled | BOOLEAN |
| configuration | JSONB |

Examples

```
Overview

Reviews

Analytics

Keyword Rankings

Latest Posts

Notifications

AI Suggestions
```

---

# 56. User Preferences

## user_preferences

| Column | Type |
|---------|------|
| id | UUID |
| user_id | UUID |
| theme | TEXT |
| language | TEXT |
| timezone | TEXT |
| default_dashboard | TEXT |
| notification_settings | JSONB |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# 57. Storage Buckets

Public Buckets

```
business-photos

post-images

profile-images
```

Private Buckets

```
reports

exports

documents

backups

ai-cache
```

---

# 58. Row Level Security (RLS)

Enable RLS on all application tables.

Policies

### Users

- Users can read their own profile.
- Only Super Admin can manage users.

### Reviews

- Authenticated users can read.
- Only authorized roles can reply.

### Posts

- Marketing Manager & Super Admin can create.
- Branch Managers can edit assigned location posts.

### Analytics

- Read-only for authorized roles.

### Settings

- Super Admin only.

---

# 59. Database Triggers

Create automatic triggers for:

```
updated_at

audit_logs

activity_logs

notification generation

dashboard cache refresh
```

Example

```
AFTER UPDATE reviews

↓

Create activity log

↓

Refresh dashboard cache

↓

Generate notification
```

---

# 60. Database Functions (RPC)

Create reusable RPC functions.

```
get_dashboard_summary()

get_location_summary()

get_review_statistics()

get_average_rating()

get_keyword_rankings()

refresh_dashboard_cache()

sync_google_profile()

generate_ai_review()

archive_old_logs()

search_reviews()

search_locations()
```

---

# 61. Database Views

Create SQL views for reporting.

Views

```
vw_dashboard_summary

vw_review_summary

vw_location_performance

vw_keyword_rankings

vw_latest_reviews

vw_ai_usage

vw_sync_status
```

---

# 62. Materialized Views

Use for expensive queries.

```
mv_dashboard_metrics

mv_monthly_analytics

mv_review_sentiment

mv_location_scores
```

Refresh Schedule

```
Every Hour

Daily

Manual
```

---

# 63. Full Text Search

Enable PostgreSQL Full Text Search.

Searchable Fields

```
Review Text

Business Description

Services

Products

Posts

Locations
```

Use GIN indexes for performance.

---

# 64. Database Constraints

Enforce:

- Unique Google Location ID
- Unique Google Review ID
- Valid foreign keys
- Rating range (1–5)
- Required timestamps
- Non-null critical fields

Use soft delete where business history must be preserved.

---

# 65. Migration Strategy

Migration Order

1. Extensions
2. Roles
3. Permissions
4. Users
5. Locations
6. Google Accounts
7. Google Business Profiles
8. Reviews
9. Replies
10. Posts
11. Analytics
12. SEO
13. AI
14. Notifications
15. Audit
16. RPC Functions
17. Views
18. Materialized Views
19. RLS Policies
20. Seed Data

---

# 66. Seed Data

Create initial records for

Roles

```
Super Admin

Marketing Manager

Branch Manager

Customer Support

Viewer
```

Default Settings

Dashboard Widgets

AI Models

Notification Types

---

# 67. Backup Strategy

Database

- Daily automated backup
- 30-day retention

Storage

- Weekly backup

Configuration

- Version controlled

---

# 68. Database Performance Guidelines

- Use UUID primary keys
- Index all foreign keys
- Avoid SELECT *
- Paginate large datasets
- Use materialized views for heavy reporting
- Batch updates during Google sync
- Archive historical logs periodically

---

# 69. Estimated Database Size

Initial Deployment

- 20–30 Locations
- 50 Internal Users
- 100,000 Reviews
- 2 Years Analytics

Growth Target

- 200+ Locations
- 5,000,000+ Reviews
- 10+ Years Historical Data

---

# 70. Database Summary

Estimated Tables

```
Core Tables                 10
Google Integration           8
Reviews & Posts              8
Analytics & SEO              8
AI                           3
Notifications & Logs         8
Settings & Operations        7
```

**Total:** ~52 Tables

Additional Objects

- RPC Functions
- Views
- Materialized Views
- Triggers
- RLS Policies
- Indexes

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `04_Supabase_Setup.md`