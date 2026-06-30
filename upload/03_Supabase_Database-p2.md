# 03_Supabase_Database.md
## Part 2 – Reviews, Posts, Analytics, SEO & AI Tables

**Project:** MyFNG Local AI Manager  
**Database:** PostgreSQL (Supabase)

---

# 24. Reviews

## reviews

Stores all Google Business Profile reviews.

| Column | Type |
|---------|------|
| id | UUID |
| google_review_id | TEXT |
| profile_id | UUID |
| reviewer_name | TEXT |
| reviewer_profile_photo | TEXT |
| reviewer_url | TEXT |
| rating | SMALLINT |
| review_text | TEXT |
| review_language | TEXT |
| review_time | TIMESTAMP |
| update_time | TIMESTAMP |
| sentiment | TEXT |
| sentiment_score | NUMERIC(5,2) |
| ai_summary | TEXT |
| has_reply | BOOLEAN |
| sync_status | TEXT |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Indexes

```
google_review_id
profile_id
rating
review_time
sentiment
```

Constraints

- google_review_id UNIQUE
- rating BETWEEN 1 AND 5

---

# 25. Review Replies

## review_replies

| Column | Type |
|---------|------|
| id | UUID |
| review_id | UUID |
| reply_text | TEXT |
| reply_source | TEXT |
| approved_by | UUID |
| published_by | UUID |
| google_reply_time | TIMESTAMP |
| status | TEXT |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

reply_source values

```
Manual

AI

Template
```

status

```
Draft

Approved

Published

Failed
```

---

# 26. Review Labels

## review_labels

| Column | Type |
|---------|------|
| id | UUID |
| review_id | UUID |
| label | TEXT |

Examples

```
Positive

Negative

Delayed Service

Engine

Pickup

Pricing

Complaint

Appreciation

Repeat Customer
```

---

# 27. Review Templates

## review_reply_templates

| Column | Type |
|---------|------|
| id | UUID |
| title | TEXT |
| rating | INTEGER |
| template | TEXT |
| language | TEXT |
| is_active | BOOLEAN |
| created_by | UUID |
| created_at | TIMESTAMP |

---

# 28. Google Posts

## google_posts

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| google_post_id | TEXT |
| title | TEXT |
| description | TEXT |
| post_type | TEXT |
| image_url | TEXT |
| cta_type | TEXT |
| cta_url | TEXT |
| schedule_at | TIMESTAMP |
| published_at | TIMESTAMP |
| status | TEXT |
| created_by | UUID |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

post_type

```
What's New

Offer

Event
```

status

```
Draft

Scheduled

Published

Failed
```

---

# 29. Media Library

## media_library

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| file_name | TEXT |
| bucket | TEXT |
| file_url | TEXT |
| mime_type | TEXT |
| file_size | BIGINT |
| uploaded_by | UUID |
| ai_generated | BOOLEAN |
| created_at | TIMESTAMP |

---

# 30. Performance Analytics (Daily)

## analytics_daily

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| report_date | DATE |
| search_views | INTEGER |
| maps_views | INTEGER |
| website_clicks | INTEGER |
| phone_calls | INTEGER |
| direction_requests | INTEGER |
| bookings | INTEGER |
| created_at | TIMESTAMP |

Unique

```
profile_id + report_date
```

---

# 31. Performance Analytics (Monthly)

## analytics_monthly

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| month | INTEGER |
| year | INTEGER |
| total_views | INTEGER |
| website_clicks | INTEGER |
| phone_calls | INTEGER |
| direction_requests | INTEGER |
| total_reviews | INTEGER |
| average_rating | NUMERIC(3,2) |
| created_at | TIMESTAMP |

---

# 32. Dashboard Cache

## dashboard_cache

Stores precomputed dashboard metrics.

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| cache_key | TEXT |
| payload | JSONB |
| expires_at | TIMESTAMP |
| updated_at | TIMESTAMP |

---

# 33. Keyword Tracking

## keywords

| Column | Type |
|---------|------|
| id | UUID |
| keyword | TEXT |
| city | TEXT |
| state | TEXT |
| is_active | BOOLEAN |
| created_at | TIMESTAMP |

Examples

```
Car Service

Car Repair

Car Garage

Wheel Alignment

Oil Change

AC Repair
```

---

# 34. Keyword Rankings

## keyword_rankings

| Column | Type |
|---------|------|
| id | UUID |
| keyword_id | UUID |
| profile_id | UUID |
| rank | INTEGER |
| search_date | DATE |
| search_location | TEXT |
| created_at | TIMESTAMP |

Indexes

```
keyword_id
profile_id
search_date
```

---

# 35. Geo Grid Results

## geo_grid_results

| Column | Type |
|---------|------|
| id | UUID |
| keyword_id | UUID |
| latitude | NUMERIC(10,7) |
| longitude | NUMERIC(10,7) |
| ranking | INTEGER |
| checked_at | TIMESTAMP |

---

# 36. Competitors

## competitors

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| business_name | TEXT |
| google_place_id | TEXT |
| category | TEXT |
| address | TEXT |
| latitude | NUMERIC |
| longitude | NUMERIC |
| is_active | BOOLEAN |
| created_at | TIMESTAMP |

---

# 37. Competitor Rankings

## competitor_rankings

| Column | Type |
|---------|------|
| id | UUID |
| competitor_id | UUID |
| keyword_id | UUID |
| ranking | INTEGER |
| checked_at | TIMESTAMP |

---

# 38. SEO Audits

## seo_audits

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| audit_score | INTEGER |
| profile_strength | INTEGER |
| missing_categories | JSONB |
| missing_photos | INTEGER |
| missing_services | INTEGER |
| recommendations | JSONB |
| audited_at | TIMESTAMP |

---

# 39. AI Jobs

## ai_jobs

Tracks every AI request.

| Column | Type |
|---------|------|
| id | UUID |
| job_type | TEXT |
| entity_type | TEXT |
| entity_id | UUID |
| model | TEXT |
| prompt | TEXT |
| response | TEXT |
| tokens | INTEGER |
| duration_ms | INTEGER |
| status | TEXT |
| created_by | UUID |
| created_at | TIMESTAMP |

job_type

```
Review Reply

Google Post

SEO Audit

Business Description

Monthly Report

Suggestion
```

---

# 40. AI Suggestions

## ai_suggestions

| Column | Type |
|---------|------|
| id | UUID |
| profile_id | UUID |
| category | TEXT |
| title | TEXT |
| description | TEXT |
| priority | TEXT |
| status | TEXT |
| generated_at | TIMESTAMP |

priority

```
Low

Medium

High

Critical
```

---

# 41. AI Usage Summary

## ai_usage

| Column | Type |
|---------|------|
| id | UUID |
| usage_date | DATE |
| model | TEXT |
| total_requests | INTEGER |
| total_tokens | INTEGER |
| estimated_cost | NUMERIC |
| created_at | TIMESTAMP |

---

# 42. Reports

## reports

| Column | Type |
|---------|------|
| id | UUID |
| report_type | TEXT |
| profile_id | UUID |
| report_name | TEXT |
| file_url | TEXT |
| generated_by | UUID |
| generated_at | TIMESTAMP |

report_type

```
Daily

Weekly

Monthly

Quarterly

Annual
```

---

# 43. Relationships

```
google_business_profiles

↓

reviews

↓

review_replies

↓

review_labels

↓

analytics_daily

↓

analytics_monthly

↓

keywords

↓

keyword_rankings

↓

competitors

↓

competitor_rankings

↓

seo_audits

↓

ai_jobs

↓

reports
```

---

# 44. Index Strategy

Create indexes on

```
google_review_id

rating

review_time

report_date

keyword

rank

checked_at

job_type

status

generated_at
```

Use GIN indexes for JSONB fields.

---

# 45. Next Document Sections

Part 3 will define

- Notifications
- Audit Logs
- Activity Logs
- Background Jobs
- Queue Tables
- System Settings
- Storage Metadata
- Webhooks
- RLS Policies
- Triggers
- RPC Functions
- Views
- Materialized Views
- Migration Order
- Backup Strategy

END OF PART 2