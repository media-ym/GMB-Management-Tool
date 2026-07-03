# 18_Frontend_Component_Architecture.md

## MyFNG Local AI Manager
### Frontend Engineering Architecture

Version: 1.0

Frontend Stack

```
Next.js 15

React 19

TypeScript

TailwindCSS

ShadCN UI

React Query

Supabase

React Hook Form

Zod

Lucide Icons

Recharts
```

Status

Production Ready

---

# 1. Objective

This document defines the complete frontend architecture of MyFNG Local AI Manager.

Goals

- Enterprise Scale
- Highly Modular
- Reusable Components
- Clean Architecture
- Maximum Performance
- Easy Maintenance

---

# 2. Folder Structure

```
src

│

├── app

├── components

├── features

├── hooks

├── services

├── providers

├── lib

├── utils

├── types

├── constants

├── config

├── middleware

├── styles

├── assets

└── store
```

---

# 3. App Router Structure

```
app

login

dashboard

locations

reviews

posts

seo

analytics

ai

reports

settings

users

audit

notifications

profile
```

---

# 4. Components Structure

```
components

ui

layout

dashboard

analytics

reviews

posts

seo

locations

notifications

charts

tables

forms

dialogs

cards

common
```

---

# 5. Features Structure

Every feature owns its business logic.

```
features

dashboard

reviews

posts

locations

analytics

seo

reports

ai

notifications

settings

users
```

Each feature contains

```
components

hooks

services

types

constants

validators
```

---

# 6. Layout Components

```
AppLayout

Sidebar

TopNavbar

Breadcrumb

Footer

PageHeader

ContentContainer

RightPanel
```

---

# 7. Shared UI Components

Buttons

Cards

Dialogs

Drawer

Input

Textarea

Select

Date Picker

Table

Badge

Avatar

Tooltip

Popover

Tabs

Accordion

Alert

Toast

Pagination

Skeleton

Empty State

---

# 8. Dashboard Components

```
KPICard

MetricCard

TrendCard

AnalyticsCard

HealthCard

ReviewCard

LocationCard

AISuggestionCard

NotificationCard

SyncStatusCard
```

---

# 9. Review Components

```
ReviewList

ReviewCard

ReviewFilters

ReplyEditor

ReplyPreview

AIReplyPanel

ReviewTimeline

ReviewNotes

ReviewLabels

ReviewAnalytics
```

---

# 10. Location Components

```
LocationTable

LocationMap

LocationCard

LocationHeader

BusinessInformation

BusinessHours

CategoryManager

ServicesManager

PhotoGallery

LocationHealth

SyncHistory
```

---

# 11. Google Posts Components

```
PostList

PostCard

PostEditor

MediaUploader

Calendar

Preview

ScheduleDialog

ApprovalDialog
```

---

# 12. Analytics Components

```
AnalyticsChart

LineChart

BarChart

AreaChart

PieChart

DonutChart

HeatMap

ComparisonTable

MetricsGrid
```

---

# 13. SEO Components

```
KeywordTable

RankingChart

GeoGrid

CompetitorTable

SEOAuditCard

VisibilityCard

RecommendationCard
```

---

# 14. AI Components

```
AIChat

AIReply

AIWriter

AISummary

AISuggestionPanel

AIHistory

AIUsage

PromptSelector
```

---

# 15. Notification Components

```
NotificationBell

NotificationList

NotificationItem

NotificationDrawer

NotificationBadge
```

---

# 16. Tables

Reusable Tables

```
ReviewTable

LocationTable

AnalyticsTable

KeywordTable

PostsTable

UsersTable

AuditTable
```

Features

Sorting

Filtering

Pagination

Bulk Selection

Export

Column Visibility

---

# 17. Forms

React Hook Form

+

Zod Validation

Reusable

```
LocationForm

ReviewReplyForm

GooglePostForm

BusinessHoursForm

SettingsForm

UserForm
```

---

# 18. State Management

Global State

```
Zustand
```

Store

```
User

Theme

Notifications

Filters

Sidebar

Dashboard

Location

Search
```

---

# 19. Server State

Use

```
TanStack Query
```

Queries

```
Reviews

Locations

Analytics

Posts

SEO

Users

Reports
```

Mutations

```
Reply Review

Create Post

Sync Google

Generate AI

Upload Image
```

---

# 20. API Layer

Never call fetch directly.

Create

```
services

api.ts

review.service.ts

location.service.ts

post.service.ts

analytics.service.ts

seo.service.ts

ai.service.ts

user.service.ts
```

---

# 21. Hooks

Reusable Hooks

```
useAuth

useUser

useLocations

useReviews

usePosts

useAnalytics

useSEO

useAI

useNotifications

useSearch

useDebounce

usePagination

usePermissions
```

---

# 22. Providers

```
QueryProvider

ThemeProvider

AuthProvider

ToastProvider

SupabaseProvider
```

---

# 23. Validation

Use

```
Zod
```

Schemas

```
Login

Location

Review Reply

Post

Settings

Keyword

Report

User
```

---

# 24. Route Protection

Middleware

Checks

Authentication

↓

Permissions

↓

Location Assignment

↓

Render Page

---

# 25. Error Handling

Error Boundary

↓

Toast

↓

Retry Button

↓

Logging

↓

Fallback UI

---

# 26. Loading Strategy

Every page includes

Skeleton

↓

Loader

↓

Content

Lazy Load

Charts

Maps

Large Tables

Dialogs

---

# 27. Performance

Use

React.memo

useMemo

useCallback

Dynamic Imports

Code Splitting

Server Components

Streaming

Image Optimization

---

# 28. Styling

TailwindCSS

+

CSS Variables

Avoid

Inline Styles

---

# 29. Icons

Library

```
Lucide React
```

No custom SVG unless branding.

---

# 30. Theme

Light

Dark

System

Stored

User Preferences

---

# 31. Search

Global Search

Supports

Reviews

Locations

Keywords

Posts

Users

Autocomplete

Debounce

300ms

---

# 32. Accessibility

WCAG AA

Keyboard Support

ARIA Labels

Screen Reader

Focus Ring

---

# 33. Testing

Component Testing

Integration Testing

Visual Regression

Accessibility Testing

---

# 34. Build Optimization

Tree Shaking

Minification

Bundle Splitting

Prefetch

Preload

Caching

---

# 35. Production Folder Example

```
src

app

dashboard

locations

reviews

analytics

posts

seo

ai

settings

components

ui

layout

cards

charts

forms

tables

hooks

services

providers

lib

store

types

utils
```

---

# 36. Development Standards

- One component per file
- One responsibility per component
- No business logic inside UI components
- Use feature-based organization
- Prefer Server Components where appropriate
- Centralize API calls
- Centralize validation
- Reuse UI components

---

# 37. Production Checklist

- Folder structure implemented
- Shared UI library complete
- Feature modules isolated
- API layer centralized
- State management configured
- Route protection enabled
- Validation implemented
- Error boundaries added
- Lazy loading configured
- Accessibility verified

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `19_Backend_Service_Architecture.md`