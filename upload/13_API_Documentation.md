# 13_API_Documentation.md

## REST API Specification

**Project:** MyFNG Local AI Manager  
**Version:** 1.0  
**API Version:** v1
**Status:** Production Ready

---

# 1. API Overview

The platform exposes internal REST APIs used by the Next.js frontend and background workers.

All APIs are private.

Authentication

```
JWT (Supabase Auth)
```

Response Format

```json
{
  "success": true,
  "message": "Request completed successfully.",
  "data": {},
  "meta": {},
  "errors": null
}
```

---

# 2. Authentication APIs

## Login

```
POST /api/auth/login
```

Request

```json
{
  "email": "",
  "password": ""
}
```

Response

JWT Session

---

## Logout

```
POST /api/auth/logout
```

---

## Current User

```
GET /api/auth/me
```

---

## Reset Password

```
POST /api/auth/reset-password
```

---

# 3. User APIs

## List Users

```
GET /api/users
```

---

## User Details

```
GET /api/users/{id}
```

---

## Create User

```
POST /api/users
```

---

## Update User

```
PUT /api/users/{id}
```

---

## Disable User

```
PATCH /api/users/{id}/disable
```

---

# 4. Location APIs

## All Locations

```
GET /api/locations
```

Supports

```
Pagination

Search

Sorting

Filtering
```

---

## Location Details

```
GET /api/locations/{id}
```

---

## Sync Location

```
POST /api/locations/{id}/sync
```

---

## Bulk Sync

```
POST /api/locations/bulk-sync
```

---

## Update Business Information

```
PUT /api/locations/{id}/business-information
```

---

## Update Business Hours

```
PUT /api/locations/{id}/hours
```

---

# 5. Google Business Profile APIs

## Sync Profile

```
POST /api/google/profile/sync
```

---

## Refresh Token

```
POST /api/google/token/refresh
```

---

## Sync Categories

```
POST /api/google/categories/sync
```

---

## Sync Services

```
POST /api/google/services/sync
```

---

## Sync Photos

```
POST /api/google/photos/sync
```

---

# 6. Review APIs

## Reviews

```
GET /api/reviews
```

Filters

- Rating
- Location
- Date
- Status
- Sentiment

---

## Review Details

```
GET /api/reviews/{id}
```

---

## AI Reply

```
POST /api/reviews/{id}/generate-ai
```

---

## Publish Reply

```
POST /api/reviews/{id}/publish
```

---

## Bulk Publish Replies

```
POST /api/reviews/bulk-publish
```

---

## Export Reviews

```
GET /api/reviews/export
```

---

# 7. Google Posts APIs

## Posts

```
GET /api/posts
```

---

## Create

```
POST /api/posts
```

---

## Update

```
PUT /api/posts/{id}
```

---

## Delete

```
DELETE /api/posts/{id}
```

---

## Publish

```
POST /api/posts/{id}/publish
```

---

## Schedule

```
POST /api/posts/{id}/schedule
```

---

## Generate AI Content

```
POST /api/posts/{id}/generate-ai
```

---

# 8. SEO APIs

## Overview

```
GET /api/seo/overview
```

---

## Keywords

```
GET /api/seo/keywords
```

---

## Add Keyword

```
POST /api/seo/keywords
```

---

## Rankings

```
GET /api/seo/rankings
```

---

## Geo Grid

```
GET /api/seo/geo-grid
```

---

## Competitors

```
GET /api/seo/competitors
```

---

## SEO Audit

```
GET /api/seo/audit
```

---

# 9. Analytics APIs

## Dashboard

```
GET /api/dashboard
```

---

## Executive

```
GET /api/dashboard/executive
```

---

## Location Dashboard

```
GET /api/dashboard/location/{id}
```

---

## Analytics

```
GET /api/analytics
```

---

## Daily Analytics

```
GET /api/analytics/daily
```

---

## Monthly Analytics

```
GET /api/analytics/monthly
```

---

# 10. Reports APIs

## Reports

```
GET /api/reports
```

---

## Generate

```
POST /api/reports/generate
```

---

## Download

```
GET /api/reports/{id}/download
```

---

## Delete

```
DELETE /api/reports/{id}
```

---

# 11. AI APIs

## Generate Review Reply

```
POST /api/ai/review
```

---

## Generate Google Post

```
POST /api/ai/post
```

---

## Generate SEO Audit

```
POST /api/ai/seo-audit
```

---

## Generate Business Description

```
POST /api/ai/business-description
```

---

## Generate Monthly Report

```
POST /api/ai/monthly-report
```

---

## AI Suggestions

```
GET /api/ai/suggestions
```

---

# 12. Notifications APIs

## List

```
GET /api/notifications
```

---

## Read

```
PATCH /api/notifications/{id}/read
```

---

## Read All

```
PATCH /api/notifications/read-all
```

---

## Delete

```
DELETE /api/notifications/{id}
```

---

# 13. Settings APIs

## Get Settings

```
GET /api/settings
```

---

## Update Settings

```
PUT /api/settings
```

---

## Test SMTP

```
POST /api/settings/test-email
```

---

# 14. Admin APIs

## Audit Logs

```
GET /api/admin/audit
```

---

## Activity Logs

```
GET /api/admin/activity
```

---

## Background Jobs

```
GET /api/admin/jobs
```

---

## Retry Job

```
POST /api/admin/jobs/{id}/retry
```

---

## System Health

```
GET /api/admin/system-health
```

---

## API Usage

```
GET /api/admin/api-usage
```

---

# 15. File Upload APIs

## Upload

```
POST /api/files/upload
```

---

## Delete

```
DELETE /api/files/{id}
```

---

## List

```
GET /api/files
```

---

# 16. HTTP Status Codes

```
200 OK

201 Created

204 No Content

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Validation Error

429 Too Many Requests

500 Internal Server Error
```

---

# 17. Pagination

Parameters

```
page

limit

sort

order
```

Example

```
GET /api/reviews?page=1&limit=20
```

---

# 18. Filtering

Supported

```
Location

Rating

Status

Date Range

Keyword

Review Type

Role

Category
```

---

# 19. Error Response

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": [
    {
      "field": "email",
      "message": "Email is required."
    }
  ]
}
```

---

# 20. Rate Limiting

Authentication

```
10 requests / minute
```

AI Endpoints

```
30 requests / minute
```

General APIs

```
120 requests / minute
```

File Upload

```
20 requests / minute
```

---

# 21. API Security

- JWT Authentication
- HTTPS Only
- Input Validation
- Output Escaping
- Rate Limiting
- Audit Logging
- Permission Checks
- CSRF Protection (where applicable)

---

# 22. Versioning

API Prefix

```
/api/v1
```

Future

```
/api/v2
```

Backward compatibility maintained during upgrades.

---

# 23. Production Checklist

- Authentication verified
- Authorization middleware tested
- Validation implemented
- Pagination tested
- Filtering tested
- Error handling verified
- Rate limiting configured
- API documentation published
- Security review completed
- Performance benchmarks achieved

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `14_Deployment_DevOps.md`