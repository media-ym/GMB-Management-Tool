# 05_Google_Business_Profile_Integration.md

## Production Ready Google Business Profile Integration

**Project:** MyFNG Local AI Manager

Version: 1.0

Status: Production Ready

---

# 1. Objective

This module integrates MyFNG Local AI Manager with Google Business Profile using Google's official APIs.

The integration enables centralized management of all MyFNG Google Business Profiles from one dashboard.

Supported operations include:

- OAuth Authentication
- Profile Sync
- Review Management
- Reply Management
- Google Posts
- Business Information
- Photos
- Performance Analytics
- Categories
- Services
- Attributes
- Business Hours

---

# 2. Google Cloud Project

Project Name

```
MyFNG Local AI
```

Environment

```
Development

Staging

Production
```

Separate Google Cloud Project for each environment.

---

# 3. Required APIs

Enable

```
Business Profile Business Information API

Business Profile Performance API

Business Profile APIs

My Business Notifications API (if applicable)

Google OAuth

Google People API
```

Disable unused APIs.

---

# 4. OAuth Configuration

OAuth Type

```
Web Application
```

Authorized Origins

```
Development

http://localhost:3000

Staging

https://staging.localai.myfng.in

Production

https://localai.myfng.in
```

Redirect URI

```
/auth/google/callback
```

---

# 5. OAuth Scopes

Request minimum required scopes.

```
Business Profile

Business Information

Business Manage

Profile Performance

OpenID

Email

Profile
```

---

# 6. Authentication Flow

```
User Clicks

↓

Connect Google

↓

Google Consent Screen

↓

Approve

↓

Authorization Code

↓

Backend Exchange

↓

Access Token

↓

Refresh Token

↓

Encrypted Storage

↓

Sync Profiles
```

---

# 7. Token Storage

Store

```
Google User ID

Google Email

Access Token

Refresh Token

Expiry

Scopes
```

Refresh automatically before expiry.

Never expose tokens to browser.

---

# 8. Initial Profile Import

After successful login

```
Google OAuth

↓

Fetch Accounts

↓

Fetch Locations

↓

Store Profiles

↓

Store Categories

↓

Store Hours

↓

Store Services

↓

Store Photos

↓

Dashboard Ready
```

---

# 9. Profile Synchronization

Sync

Business Name

Address

Coordinates

Phone

Website

Categories

Business Hours

Attributes

Services

Products

Photos

Verification Status

Review Count

Average Rating

---

# 10. Sync Modes

Automatic

Manual

Scheduled

Automatic Sync

```
Every 30 Minutes
```

Manual

```
Sync Now
```

Scheduled

```
Cron Jobs
```

---

# 11. Review Synchronization

```
Google Reviews

↓

Fetch Latest

↓

Compare Database

↓

Insert New

↓

Update Existing

↓

Store AI Sentiment

↓

Dashboard Update
```

---

# 12. Reply Management

Workflow

```
Review

↓

Generate AI Reply

↓

Manager Review

↓

Approve

↓

Publish Reply

↓

Google API

↓

Sync Reply Status
```

Reply Sources

```
Manual

AI

Templates
```

---

# 13. Google Posts

Supported Types

```
What's New

Offer

Event
```

Workflow

```
Create

↓

AI Improve

↓

Preview

↓

Publish

↓

Google

↓

Track Status
```

---

# 14. Business Information Update

Editable

```
Business Description

Phone

Website

Appointment URL

Hours

Special Hours

Categories

Attributes

Services
```

Every update

↓

Google API

↓

Sync Confirmation

↓

Audit Log

---

# 15. Business Hours

Support

```
Regular Hours

Holiday Hours

Temporary Closure

Reopening
```

---

# 16. Categories

Support

```
Primary Category

Additional Categories
```

Changes require

Validation

↓

Google Update

↓

Refresh Local Database

---

# 17. Services

Each location can manage

```
Service Name

Description

Category

Status
```

Bulk update supported.

---

# 18. Products

Fields

```
Name

Description

Category

Price

Image

Status
```

Future ready.

---

# 19. Photos

Upload Flow

```
Upload

↓

Optimize

↓

Compress

↓

Google Upload

↓

Store Metadata

↓

Dashboard Refresh
```

Supported

```
JPG

PNG

WEBP
```

---

# 20. Performance Metrics

Daily sync

Metrics

```
Search Views

Maps Views

Website Clicks

Phone Calls

Direction Requests

Bookings

Customer Actions
```

Stored in analytics tables.

---

# 21. Sync Scheduler

Every

```
5 Minutes

Reviews
```

Every

```
30 Minutes

Business Information
```

Daily

```
Analytics

Photos

Categories

Services
```

---

# 22. Sync Status

Each sync stores

```
Started

Completed

Duration

Records Updated

Records Failed

Errors
```

Visible in dashboard.

---

# 23. Conflict Resolution

Google is source of truth.

Rules

If local record newer

↓

Prompt user before overwrite.

If Google newer

↓

Update local.

---

# 24. Error Handling

Errors

```
Token Expired

Permission Denied

Quota Exceeded

Network Failure

Validation Error

API Error
```

Actions

```
Retry

Log

Notify

Manual Retry
```

---

# 25. Rate Limit Handling

Implement

- Request Queue
- Exponential Backoff
- Retry Policy
- Incremental Sync
- Batch Processing where supported

Never call Google APIs directly from frontend.

---

# 26. Audit Logging

Log

```
Profile Updated

Review Synced

Reply Published

Post Published

Category Changed

Hours Updated

Photo Uploaded
```

Store

- User
- Timestamp
- Location
- Previous Value
- New Value

---

# 27. Dashboard Widgets

Show

```
Connected Profiles

Last Sync

Sync Health

Review Queue

Average Rating

Pending Replies

Recent Posts

Google API Status
```

---

# 28. Security

- OAuth handled only by backend.
- Tokens encrypted at rest.
- Service Role keys never exposed.
- Validate every Google response.
- Log all API interactions.
- Rotate credentials if compromised.

---

# 29. Future Extensions

Designed to support additional connectors.

Potential integrations

```
Apple Business Connect

Bing Places

Waze

Facebook Pages

Google Ads

GA4
```

Each connector should follow the same adapter interface used for Google Business Profile.

---

# 30. Production Checklist

- Google Cloud Project configured
- OAuth Consent Screen verified
- APIs enabled
- OAuth credentials stored securely
- Redirect URIs validated
- Token refresh tested
- Initial profile sync successful
- Review sync verified
- Reply publishing tested
- Post publishing tested
- Analytics sync scheduled
- Monitoring enabled
- Audit logging verified

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `06_Authentication_RBAC.md`