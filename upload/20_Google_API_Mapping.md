# 20_Google_API_Mapping.md

# MyFNG Local AI Manager

## Google Business Profile API Complete Mapping Document

**Version:** 1.0  
**Status:** Production Ready

---

# 1. Objective

This document defines the complete mapping between Google Business Profile APIs and the MyFNG Local AI Manager database.

This acts as the single source of truth for developers implementing Google integrations.

---

# 2. Google APIs Used

## Authentication

```
OAuth 2.0
```

---

## Business Profile APIs

```
Business Profile API

Business Information API

Business Performance API
```

---

## Additional APIs

```
Google People API

Google OAuth API
```

---

# 3. Authentication Flow

```
User Login

↓

Google OAuth

↓

Authorization Code

↓

Access Token

↓

Refresh Token

↓

Encrypted Database

↓

API Calls
```

---

# 4. Google Account Mapping

Google Object

↓

Table

```
google_accounts
```

Mapped Fields

```
Google Email

Google User ID

Refresh Token

Access Token

Expiry

Scopes
```

---

# 5. Business Profile Mapping

Google

↓

google_business_profiles

Fields

```
Google Location ID

Business Name

Verification Status

Average Rating

Review Count

Language

Store Code

Primary Category

Additional Categories
```

---

# 6. Business Information Mapping

Google

↓

business_information

Fields

```
Description

Website

Phone

Appointment URL

Latitude

Longitude

Address

Business Hours

Attributes
```

---

# 7. Business Hours Mapping

Google

↓

business_hours

Fields

```
Day

Open

Close

Closed
```

---

# 8. Holiday Hours Mapping

Google

↓

special_hours

Fields

```
Date

Open

Close

Closed
```

---

# 9. Categories Mapping

Google

↓

business_categories

Fields

```
Primary Category

Additional Categories
```

---

# 10. Services Mapping

Google

↓

services

Fields

```
Name

Description

Category

Status
```

---

# 11. Products Mapping

Google

↓

products

Fields

```
Name

Description

Price

Category

Image
```

Future Ready.

---

# 12. Photos Mapping

Google

↓

business_photos

Fields

```
Photo ID

URL

Category

Source

Status
```

---

# 13. Reviews Mapping

Google

↓

reviews

Fields

```
Review ID

Reviewer

Rating

Review Text

Language

Create Time

Update Time

Reply Status
```

---

# 14. Review Replies Mapping

Google

↓

review_replies

Fields

```
Reply Text

Reply Time

Status
```

---

# 15. Google Posts Mapping

Google

↓

google_posts

Fields

```
Title

Description

Type

CTA

Image

Status

Publish Time
```

---

# 16. Performance Metrics Mapping

Google

↓

analytics_daily

Metrics

```
Search Views

Maps Views

Website Clicks

Calls

Direction Requests

Customer Actions
```

---

# 17. Performance Aggregation

Daily

↓

analytics_daily

Monthly

↓

analytics_monthly

Dashboard

↓

dashboard_cache

---

# 18. Sync Direction

```
Google

↓

Supabase

↓

Dashboard
```

Updates

```
Dashboard

↓

Google

↓

Confirmation

↓

Database
```

---

# 19. Sync Frequency

Reviews

```
Every 5 Minutes
```

Business Information

```
30 Minutes
```

Photos

```
Daily
```

Analytics

```
Daily
```

Categories

```
Daily
```

Services

```
Daily
```

---

# 20. Sync Status

Each sync stores

```
Started

Completed

Duration

Records Updated

Errors
```

Table

```
sync_logs
```

---

# 21. Error Mapping

Google Errors

↓

error_logs

Examples

```
401

403

404

429

500
```

Store

```
Message

Payload

Retry Count

Status
```

---

# 22. Retry Policy

Retry

```
Network Failure

Timeout

429

Temporary Server Error
```

Do Not Retry

```
401

403

Validation Errors
```

---

# 23. Rate Limiting

Implement

Queue

↓

Batch Processing

↓

Exponential Backoff

↓

Retry

---

# 24. Google API Service Layer

```
GoogleOAuthService

GoogleProfileService

GoogleReviewService

GoogleReplyService

GooglePostService

GoogleAnalyticsService

GoogleCategoryService

GooglePhotoService

GoogleHoursService

GoogleServiceCatalog
```

---

# 25. Background Jobs

Jobs

```
Review Sync

Business Sync

Analytics Sync

Posts Sync

Photo Sync

Category Sync

Services Sync
```

---

# 26. API Response Validation

Every response validates

- Required fields
- Null values
- Data types
- Duplicate IDs
- Timestamp format

Invalid payloads are logged and skipped.

---

# 27. Audit Trail

Log

- Sync Started
- Sync Completed
- Sync Failed
- Reply Published
- Post Published
- Hours Updated
- Category Updated

Stored in

```
audit_logs
```

---

# 28. Dashboard Dependencies

Executive Dashboard

Depends on

- analytics_daily
- reviews
- google_business_profiles

Review Dashboard

Depends on

- reviews
- review_replies

SEO Dashboard

Depends on

- keywords
- keyword_rankings
- seo_audits

---

# 29. Security

- OAuth tokens encrypted
- Backend-only API access
- JWT required
- Audit all write operations
- Validate Google responses
- Never expose service credentials

---

# 30. Production Checklist

- OAuth verified
- APIs enabled
- Token refresh tested
- Profile import verified
- Review sync verified
- Reply publishing tested
- Analytics sync verified
- Error handling implemented
- Retry policy validated
- Audit logging enabled

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `21_Testing_Strategy.md`