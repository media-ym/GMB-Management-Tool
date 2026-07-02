# 09_Google_Post_Management.md

## Google Business Profile Post Management Module

**Project:** MyFNG Local AI Manager  
**Version:** 1.0  
**Status:** Production Ready

---

# 1. Objective

The Google Post Management module enables the MyFNG marketing team to create, schedule, publish, monitor, and analyze Google Business Profile posts across all MyFNG locations from a centralized dashboard.

The module integrates with the official Google Business Profile APIs and includes AI-powered content generation, approval workflows, scheduling, and performance tracking.

---

# 2. Module Goals

- Create Google Business Profile posts
- Publish to one or multiple locations
- Schedule future posts
- Generate AI-assisted content
- Manage media assets
- Track publishing status
- Measure post performance
- Maintain post history

---

# 3. Dashboard Overview

Widgets

```
Total Posts

Draft Posts

Scheduled Posts

Published Posts

Failed Posts

Posts Published Today

Upcoming Scheduled Posts

Top Performing Posts

AI Drafts Pending

Publishing Queue
```

---

# 4. Supported Post Types

```
What's New

Offer

Event
```

Future Ready

```
Product Promotion

Seasonal Campaign

Emergency Notice
```

---

# 5. Post Lifecycle

```
Draft

↓

AI Enhancement (Optional)

↓

Preview

↓

Approval (Optional)

↓

Scheduled

↓

Published

↓

Archived
```

---

# 6. Post Fields

Required

- Title
- Description
- Post Type
- Target Locations

Optional

- Image
- CTA
- CTA URL
- Offer Dates
- Event Dates
- UTM Parameters
- Internal Notes

---

# 7. Call-to-Action (CTA)

Supported CTAs

```
Book Now

Call Now

Learn More

Visit Website

Get Offer

Contact Us
```

CTA URL validation required.

---

# 8. AI Content Generation

MiSA AI can generate

- Post title
- Description
- Offer copy
- Seasonal campaigns
- Festival campaigns
- Vehicle maintenance tips
- Workshop announcements
- Promotional campaigns

Tone Options

```
Professional

Friendly

Promotional

Informative

Urgent
```

---

# 9. AI Optimization

Before publishing

AI checks

- Grammar
- Readability
- Length
- Tone
- SEO keywords
- Duplicate content
- Brand consistency

---

# 10. Multi-Location Publishing

Publishing Modes

```
Single Location

Multiple Selected Locations

All Active Locations
```

Each location maintains its own publishing status.

---

# 11. Scheduling

Supported

- Publish Immediately
- Future Date & Time
- Bulk Schedule

Timezone

```
Asia/Kolkata
```

Scheduled jobs handled by background workers.

---

# 12. Media Management

Supported Formats

```
JPEG

PNG

WEBP
```

Maximum File Size

```
20 MB
```

Workflow

```
Upload

↓

Compress

↓

Optimize

↓

Preview

↓

Attach

↓

Publish
```

---

# 13. Preview

Before publishing, preview displays

- Desktop View
- Mobile View
- Image
- CTA
- Character Count
- Validation Status

---

# 14. Validation Rules

Check

- Required fields
- Character limits
- Valid CTA URL
- Supported image format
- Image size
- Duplicate scheduled posts
- Active location status

Publishing blocked until validation passes.

---

# 15. Approval Workflow (Optional)

```
Marketing Executive

↓

Submit Draft

↓

Marketing Manager Review

↓

Approve / Reject

↓

Schedule / Publish
```

Rejected drafts require comments.

---

# 16. Publishing Workflow

```
Create Post

↓

Validate

↓

Queue Job

↓

Google API

↓

Receive Response

↓

Update Status

↓

Log Activity

↓

Dashboard Refresh
```

---

# 17. Publishing Status

```
Draft

Scheduled

Publishing

Published

Failed

Archived
```

Failures include detailed error messages.

---

# 18. Bulk Operations

Supported

- Publish
- Schedule
- Archive
- Delete Drafts
- Regenerate AI Content
- Export Post History

Bulk actions execute through background jobs.

---

# 19. Search & Filters

Search by

- Title
- Description
- Post ID
- Location

Filters

- Status
- Post Type
- Date Range
- Created By
- Location

---

# 20. Post Analytics

Track

- Published Date
- Target Locations
- Publishing Success Rate
- Failed Publications
- Active Posts
- Historical Post Count

Future metrics can include Google engagement data if exposed by APIs.

---

# 21. Version History

Every edit creates a new version.

Stored

- Previous Content
- New Content
- Edited By
- Timestamp

Users can compare versions.

---

# 22. Internal Notes

Private notes visible only inside MyFNG.

Examples

- Campaign objective
- Approval comments
- Creative reference
- Promotion details

Notes are never sent to Google.

---

# 23. Activity Timeline

Track

- Draft Created
- AI Generated
- Edited
- Approved
- Scheduled
- Published
- Failed
- Archived

Timeline is immutable.

---

# 24. Notifications

Notify users when

- Post published
- Post failed
- Approval required
- Schedule completed
- Image validation failed
- CTA validation failed

---

# 25. API Endpoints

Examples

```
GET    /api/posts

GET    /api/posts/{id}

POST   /api/posts

PUT    /api/posts/{id}

DELETE /api/posts/{id}

POST   /api/posts/{id}/publish

POST   /api/posts/{id}/schedule

POST   /api/posts/{id}/generate-ai

POST   /api/posts/bulk-publish

GET    /api/posts/export
```

---

# 26. Permissions

Super Admin

- Full access

Marketing Manager

- Create
- Edit
- Publish
- Schedule

Branch Manager

- Create
- Edit
- Publish for assigned locations

Customer Support

- View only

Viewer

- Read only

---

# 27. Production Checklist

- Google Post API configured
- AI generation tested
- Media upload verified
- Validation rules implemented
- Scheduling tested
- Bulk publishing tested
- Approval workflow verified
- Activity logs enabled
- Notifications configured
- Dashboard widgets verified

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `10_Local_SEO_and_Rank_Tracking.md`