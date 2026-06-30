# 03_Supabase_Database.md
## Production Database Design
### Project: MyFNG Local AI Manager

Version: 1.0

Database: PostgreSQL (Supabase)

---

# 1. Database Overview

The database is designed for an internal enterprise platform to manage multiple MyFNG Google Business Profiles, reviews, analytics, AI operations, local SEO data, audit logs, and reporting.

Database Goals

- High Performance
- ACID Compliance
- Optimized Indexing
- Realtime Support
- Secure Authentication
- Auditability
- Scalability

---

# 2. Database Naming Convention

Tables

snake_case

Example

```
locations

google_business_profiles

review_replies
```

Columns

snake_case

Example

```
location_name

created_at

updated_at
```

Primary Key

```
id UUID
```

Foreign Key

```
location_id

review_id

user_id
```

Timestamp

```
created_at

updated_at
```

Soft Delete

```
deleted_at
```

Status

```
status
```

---

# 3. Extensions

Enable

```
uuid-ossp

pgcrypto

pg_trgm

unaccent
```

---

# 4. Core Tables

---

## users

Stores internal MyFNG users.

| Column | Type |
|----------|------|
| id | UUID |
| full_name | TEXT |
| email | TEXT |
| mobile | TEXT |
| password_hash | TEXT |
| role_id | UUID |
| avatar | TEXT |
| is_active | BOOLEAN |
| last_login | TIMESTAMP |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Indexes

```
email

mobile

role_id
```

---

## roles

| Column | Type |
|----------|------|
| id | UUID |
| name | TEXT |
| description | TEXT |
| created_at | TIMESTAMP |

Default Roles

```
Super Admin

Marketing Manager

Branch Manager

Customer Support

Viewer
```

---

## permissions

| Column | Type |
|----------|------|
| id | UUID |
| permission_name | TEXT |
| description | TEXT |

Examples

```
reviews.read

reviews.write

reviews.reply

posts.create

posts.publish

analytics.read

locations.update

settings.update
```

---

## role_permissions

Many-to-many mapping.

| Column | Type |
|----------|------|
| id | UUID |
| role_id | UUID |
| permission_id | UUID |

---

# 5. Location Management

---

## locations

Stores every MyFNG branch.

| Column | Type |
|----------|------|
| id | UUID |
| location_code | TEXT |
| location_name | TEXT |
| address | TEXT |
| city | TEXT |
| state | TEXT |
| pincode | TEXT |
| latitude | DECIMAL |
| longitude | DECIMAL |
| phone | TEXT |
| email | TEXT |
| website | TEXT |
| timezone | TEXT |
| is_active | BOOLEAN |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Indexes

```
city

state

location_code

latitude

longitude
```

---

# 6. Google Accounts

---

## google_accounts

Stores authenticated Google Workspace account.

| Column | Type |
|----------|------|
| id | UUID |
| email | TEXT |
| google_user_id | TEXT |
| refresh_token | TEXT |
| access_token | TEXT |
| token_expiry | TIMESTAMP |
| scopes | JSONB |
| status | TEXT |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# 7. Google Business Profiles

---

## google_business_profiles

Each row represents one GBP location.

| Column | Type |
|----------|------|
| id | UUID |
| google_location_id | TEXT |
| location_id | UUID |
| google_account_id | UUID |
| profile_name | TEXT |
| primary_category | TEXT |
| additional_categories | JSONB |
| average_rating | DECIMAL |
| total_reviews | INTEGER |
| verification_state | TEXT |
| profile_status | TEXT |
| map_url | TEXT |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Indexes

```
google_location_id

location_id

profile_status
```

---

# 8. Business Information

---

## business_information

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| description | TEXT |
| opening_hours | JSONB |
| special_hours | JSONB |
| services | JSONB |
| attributes | JSONB |
| website | TEXT |
| appointment_url | TEXT |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# 9. Categories

---

## business_categories

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| category_name | TEXT |
| is_primary | BOOLEAN |

---

# 10. Photos

---

## business_photos

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| google_photo_id | TEXT |
| image_url | TEXT |
| thumbnail_url | TEXT |
| uploaded_by | UUID |
| source | TEXT |
| status | TEXT |
| created_at | TIMESTAMP |

---

# 11. Products

---

## products

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| product_name | TEXT |
| description | TEXT |
| category | TEXT |
| price | DECIMAL |
| currency | TEXT |
| image_url | TEXT |
| status | TEXT |
| created_at | TIMESTAMP |

---

# 12. Services

---

## services

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| service_name | TEXT |
| description | TEXT |
| category | TEXT |
| status | TEXT |
| created_at | TIMESTAMP |

---

# 13. Business Attributes

---

## business_attributes

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| attribute_name | TEXT |
| attribute_value | TEXT |

---

# 14. Business Hours

---

## business_hours

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| day_of_week | INTEGER |
| open_time | TIME |
| close_time | TIME |
| is_closed | BOOLEAN |

---

# 15. Holiday Hours

---

## special_hours

| Column | Type |
|----------|------|
| id | UUID |
| profile_id | UUID |
| date | DATE |
| open_time | TIME |
| close_time | TIME |
| is_closed | BOOLEAN |

---

# 16. Sync Logs

---

## sync_logs

Tracks every Google synchronization.

| Column | Type |
|----------|------|
| id | UUID |
| module | TEXT |
| profile_id | UUID |
| started_at | TIMESTAMP |
| completed_at | TIMESTAMP |
| status | TEXT |
| records_processed | INTEGER |
| records_inserted | INTEGER |
| records_updated | INTEGER |
| records_failed | INTEGER |
| error_message | TEXT |

---

# 17. API Logs

---

## api_logs

| Column | Type |
|----------|------|
| id | UUID |
| endpoint | TEXT |
| method | TEXT |
| request_body | JSONB |
| response_code | INTEGER |
| duration_ms | INTEGER |
| user_id | UUID |
| created_at | TIMESTAMP |

---

# 18. System Settings

---

## settings

Stores global application settings.

| Column | Type |
|----------|------|
| id | UUID |
| setting_key | TEXT |
| setting_value | JSONB |
| description | TEXT |
| updated_by | UUID |
| updated_at | TIMESTAMP |

Examples

```
default_ai_model

review_sync_interval

analytics_sync_interval

email_notifications

dashboard_refresh_interval
```

---

# 19. Relationships

```
roles

↓

users

↓

locations

↓

google_business_profiles

↓

business_information

↓

services

↓

products

↓

photos

↓

categories

↓

hours

↓

special_hours
```

---

# 20. Storage Buckets

Supabase Storage

```
avatars

business-photos

post-images

reports

exports

ai-generated

documents
```

Public

```
business-photos

post-images
```

Private

```
reports

exports

documents
```

---

# 21. Index Strategy

Create indexes on

```
email

google_location_id

location_id

created_at

status

average_rating

city

state

profile_status
```

Use GIN indexes for JSONB columns.

---

# 22. Constraints

- Unique email per user
- Unique Google Location ID
- Foreign key validation on all relationships
- Cascade delete disabled for production data
- Use soft delete (`deleted_at`) where appropriate

---

# 23. Migration Order

1. Extensions
2. Roles
3. Permissions
4. Users
5. Locations
6. Google Accounts
7. Google Business Profiles
8. Business Information
9. Categories
10. Services
11. Products
12. Photos
13. Business Hours
14. Special Hours
15. Settings
16. Sync Logs
17. API Logs

---

# Next Document Sections

Part 2 will define:

- Reviews
- Review Replies
- Google Posts
- Media Library
- Performance Analytics
- Keyword Tracking
- Local SEO
- Competitor Tracking
- AI Processing Tables

END OF PART 1