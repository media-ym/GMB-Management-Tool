# 07_Location_Management.md

## Multi-Location Management Module

**Project:** MyFNG Local AI Manager  
**Version:** 1.0  
**Status:** Production Ready

---

# 1. Objective

The Location Management module is the foundation of the platform.

Every MyFNG Google Business Profile will be mapped to one physical MyFNG service center.

This module allows the marketing and operations team to centrally manage all locations, their Google Business Profiles, business information, SEO data, analytics, reviews, posts, and AI recommendations.

---

# 2. Module Goals

- Centralize all MyFNG locations
- Connect each location with its Google Business Profile
- Manage location metadata
- Track operational status
- Enable location-level permissions
- Support bulk management
- Provide location health monitoring

---

# 3. Location Hierarchy

```
MyFNG

│

├── Mumbai

├── Navi Mumbai

├── Thane

├── Pune

├── Nashik

├── Panvel

├── Kalyan

├── Dombivli

├── Bhiwandi

├── Virar

├── Vasai

└── Future Locations
```

Every location has one Google Business Profile.

---

# 4. Location Dashboard

Each location has its own dashboard.

Widgets

```
Business Information

Google Rating

Review Count

Latest Reviews

Performance Analytics

Google Posts

Business Hours

SEO Score

Keyword Rankings

AI Suggestions

Sync Status

Recent Activities
```

---

# 5. Location Profile

Each location stores

```
Location Name

Internal Code

Address

City

State

Pincode

Latitude

Longitude

Phone Number

Email

Website

Timezone

Business Status

Manager

Created Date

Updated Date
```

---

# 6. Google Business Profile Mapping

Every location is linked to one Google Business Profile.

```
Location

↓

Google Location ID

↓

Business Profile

↓

Reviews

↓

Analytics

↓

Posts

↓

Photos
```

The Google Location ID is the primary external identifier.

---

# 7. Location Status

Supported statuses

```
Active

Inactive

Temporarily Closed

Permanently Closed

Pending Verification
```

Status changes are synchronized with Google where supported.

---

# 8. Business Information Management

Editable fields

- Business Name
- Phone Number
- Website
- Address
- Coordinates
- Business Description
- Appointment URL
- Opening Date
- Categories
- Services
- Attributes

All updates pass through Google Business Profile APIs.

---

# 9. Business Hours

Manage

- Regular Hours
- Holiday Hours
- Temporary Closure
- Reopening Schedule

Validation Rules

- Opening time must be before closing time.
- No overlapping time slots.
- Holiday hours override regular hours.

---

# 10. Service Management

Each location maintains its own list of services.

Fields

- Service Name
- Description
- Category
- Display Order
- Status

Bulk update supported.

---

# 11. Photo Management

Supported image categories

```
Logo

Cover Photo

Exterior

Interior

Team

Workshop

Customer Area

Service Images

Offers

Products
```

Workflow

```
Upload

↓

Compress

↓

Preview

↓

Publish to Google

↓

Store Metadata

↓

Sync Status
```

---

# 12. Location Assignment

Each location may have

- Branch Manager
- Marketing Owner
- Customer Support Owner

Assignments determine access permissions.

---

# 13. Location Health Score

Each location receives a calculated health score.

Factors

- Google Rating
- Review Response Rate
- Profile Completeness
- Photos
- Business Hours Accuracy
- Services Added
- Recent Posts
- SEO Score

Displayed as a percentage.

---

# 14. Profile Completeness

Calculated automatically.

Checklist

- Business Name
- Phone
- Website
- Description
- Categories
- Services
- Photos
- Business Hours
- Attributes
- Location Verified

Score displayed on dashboard.

---

# 15. Bulk Operations

Supported actions

- Sync Selected Locations
- Publish Google Post
- Update Business Hours
- Upload Photos
- Export Analytics
- Export Reviews
- Generate AI Reports

Bulk actions execute through background jobs.

---

# 16. Search & Filters

Search by

- Location Name
- City
- Internal Code
- Google Location ID

Filters

- City
- Status
- Rating
- Review Count
- Last Sync
- Health Score

---

# 17. Location Timeline

Every location has an activity timeline.

Events

- Profile Created
- Google Connected
- Review Received
- Reply Published
- Post Published
- Hours Updated
- Category Changed
- Sync Completed
- AI Suggestion Generated

Timeline is read-only.

---

# 18. Location Alerts

Examples

- Profile verification required
- Sync failed
- Low review rating
- Missing business hours
- Missing photos
- Profile incomplete
- AI recommendation available

Alerts shown on dashboard and notification center.

---

# 19. Sync Controls

Available actions

- Sync Business Information
- Sync Reviews
- Sync Photos
- Sync Posts
- Sync Analytics
- Full Profile Sync

Display

- Last Sync Time
- Sync Status
- Records Updated
- Errors (if any)

---

# 20. Location Performance Summary

For each location display

- Average Rating
- Total Reviews
- Review Response Rate
- Website Clicks
- Phone Calls
- Direction Requests
- Google Search Views
- Google Maps Views
- SEO Score
- Keyword Ranking Summary

---

# 21. Location Reports

Generate

- Daily Summary
- Weekly Summary
- Monthly Performance
- Review Report
- SEO Report
- Google Profile Audit

Formats

- PDF
- Excel

---

# 22. Location Archive

Inactive locations can be archived.

Rules

- Preserve historical analytics
- Preserve reviews
- Preserve audit logs
- Prevent new updates
- Exclude from active dashboards by default

---

# 23. API Endpoints

Examples

```
GET    /api/locations

GET    /api/locations/{id}

POST   /api/locations

PUT    /api/locations/{id}

DELETE /api/locations/{id}

POST   /api/locations/{id}/sync

POST   /api/locations/{id}/publish-post

GET    /api/locations/{id}/analytics

GET    /api/locations/{id}/reviews
```

All endpoints require authentication.

---

# 24. Validation Rules

- Location name required
- Google Location ID unique
- Phone number valid
- Coordinates valid
- Website URL valid
- Email format valid
- Status must be supported value

Invalid requests return validation errors.

---

# 25. Production Checklist

- Locations imported
- Google Profile mapping verified
- Managers assigned
- Business information validated
- Business hours configured
- Services synced
- Photos uploaded
- Health score calculation tested
- Bulk actions verified
- Reports generated successfully

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `08_Review_Management.md`