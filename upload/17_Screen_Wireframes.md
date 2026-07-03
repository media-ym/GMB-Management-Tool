# 17_Screen_Wireframes.md

## MyFNG Local AI Manager
### Complete Screen Specifications & Wireframes

Version: 1.0  
Status: Production Ready

---

# 1. Screen Inventory

## Authentication

```
Login

Forgot Password

Reset Password
```

---

## Dashboard

```
Executive Dashboard

Location Dashboard

Analytics Dashboard

Review Dashboard

SEO Dashboard
```

---

## Locations

```
Location List

Location Details

Business Information

Business Hours

Services

Photos

Categories

Attributes

Sync History
```

---

## Reviews

```
Review Inbox

Review Details

Reply Editor

AI Reply Generator

Templates

Review Analytics
```

---

## Google Posts

```
Posts List

Create Post

Edit Post

Media Library

Calendar View

Publishing Queue
```

---

## SEO

```
SEO Overview

Keyword Management

Keyword Rankings

Geo Grid

Competitors

SEO Audit
```

---

## Analytics

```
Overview

Location Comparison

Review Analytics

Performance Metrics

Reports
```

---

## AI

```
AI Dashboard

AI Suggestions

AI Review Reply

AI Google Posts

AI SEO

AI Reports
```

---

## Admin

```
Users

Roles

Settings

Notifications

Audit Logs

System Health
```

---

# 2. Login Screen

```
------------------------------------------------

               MyFNG Logo

        MyFNG Local AI Manager

Email

____________________

Password

____________________

Remember Me

Forgot Password

[ Login ]

------------------------------------------------
```

Features

- Email validation
- Password visibility toggle
- Loading state
- Error handling
- Secure authentication

---

# 3. Executive Dashboard

```
----------------------------------------------------

Sidebar

Top Navigation

----------------------------------------------------

KPI Cards

Locations

Reviews

Rating

Calls

Clicks

Directions

SEO

----------------------------------------------------

Analytics Charts

----------------------------------------------------

Latest Reviews

AI Suggestions

----------------------------------------------------

Notifications

Sync Status

----------------------------------------------------
```

Widgets

- Total Locations
- Average Rating
- Calls
- Clicks
- Directions
- Reviews
- SEO Score
- Pending Replies

---

# 4. Location List

```
----------------------------------------------------

Search

Filters

Add Location

----------------------------------------------------

Table

Location

City

Rating

Reviews

Health

Last Sync

Status

Actions

----------------------------------------------------
```

Actions

- View
- Sync
- Edit
- Analytics
- Reviews

---

# 5. Location Details

Tabs

```
Overview

Business Information

Hours

Services

Categories

Photos

Reviews

Posts

Analytics

SEO

Audit
```

---

Overview

```
Business Information

Google Rating

Review Count

Last Sync

SEO Score

AI Suggestions

Quick Actions
```

---

# 6. Business Information Screen

Fields

```
Business Name

Address

Phone

Website

Description

Categories

Attributes

Appointment URL
```

Buttons

```
Save

Sync Google

Cancel
```

---

# 7. Business Hours

```
Monday

Tuesday

Wednesday

Thursday

Friday

Saturday

Sunday
```

Holiday Hours

```
Date

Open

Close

Closed
```

---

# 8. Review Inbox

```
----------------------------------------------------

Search

Filters

Export

----------------------------------------------------

Review Cards

----------------------------------------------------
```

Review Card

```
★★★★★

Reviewer

Date

Review

Sentiment

AI Reply

Reply

Labels

Notes
```

---

# 9. Review Details

Sections

Customer

Review

Reply

AI

History

Notes

Audit

Buttons

```
Generate AI Reply

Publish

Save Draft

Delete Draft
```

---

# 10. AI Reply Screen

Layout

```
Original Review

↓

AI Suggested Reply

↓

Editable Textarea

↓

Tone Selector

↓

Generate Again

↓

Publish
```

---

# 11. Google Posts List

```
----------------------------------------------------

Create Post

Filters

Calendar

----------------------------------------------------

Posts Table

----------------------------------------------------
```

Columns

- Title
- Type
- Status
- Scheduled
- Published
- Location
- Actions

---

# 12. Create Google Post

```
Title

Description

Post Type

Locations

Image

CTA

Schedule

Preview

Publish
```

Sidebar

AI Assistant

---

# 13. Media Library

Grid View

```
Image

Filename

Uploaded By

Size

Created

Actions
```

Actions

- Preview
- Replace
- Delete

---

# 14. SEO Dashboard

Cards

```
SEO Score

Visibility

Profile Health

Keyword Rankings
```

Charts

- Ranking Trend
- Visibility Trend
- SEO Audit Summary

Tables

- Top Keywords
- Ranking Changes

---

# 15. Keyword Management

```
Search

Add Keyword

Import

----------------------------------------------------

Keyword

Location

Rank

Change

Status

Actions
```

---

# 16. Geo Grid

Layout

```
Map

↓

Grid

↓

Ranking Numbers

↓

Average Rank

↓

Legend
```

---

# 17. Competitors

Table

```
Business

Rating

Reviews

Distance

Visibility

Rank

Actions
```

---

# 18. Analytics Dashboard

Tabs

```
Overview

Reviews

Performance

SEO

Reports
```

Cards

- Calls
- Clicks
- Directions
- Searches

Charts

- Daily
- Weekly
- Monthly

---

# 19. Reports

```
Generate Report

↓

Select

Date

Locations

Format

↓

Generate

↓

Download
```

---

# 20. AI Dashboard

Cards

```
AI Suggestions

AI Jobs

AI Usage

Recent AI Activity
```

Tables

- Suggestions
- Generated Replies
- Generated Posts

---

# 21. Notifications

Layout

```
Unread

↓

Read

↓

Archive
```

Each notification

- Icon
- Title
- Description
- Time
- Action

---

# 22. User Management

Table

```
Name

Role

Email

Locations

Status

Actions
```

Actions

- Edit
- Disable
- Reset Password

---

# 23. Audit Logs

Table

```
Timestamp

User

Action

Module

Entity

IP

Details
```

Filters

- User
- Date
- Module

---

# 24. System Health

Cards

```
Database

Google API

Storage

AI

Redis

SMTP

Queue

Edge Functions
```

Statuses

- Healthy
- Warning
- Critical

---

# 25. Global Search

Searches

- Locations
- Reviews
- Posts
- Keywords
- Users

Autocomplete supported.

---

# 26. Mobile Layout

Sidebar becomes

```
Drawer Navigation
```

Cards become

```
Single Column
```

Tables become

```
Horizontal Scroll
```

Charts resize automatically.

---

# 27. Empty States

Every module includes

- Illustration
- Message
- Primary Action

---

# 28. Loading States

Use

- Skeletons
- Progress Indicators
- Button Loading States

---

# 29. Error States

Show

- Error Icon
- Message
- Retry Button

---

# 30. Final UX Rules

- Maximum 3-click access to any major feature
- Consistent page headers
- Sticky filters on long lists
- Persistent global search
- Autosave for drafts where applicable
- Confirmation dialogs for destructive actions
- Responsive on desktop and tablet
- Keyboard-accessible navigation

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `18_Frontend_Component_Architecture.md`