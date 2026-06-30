# 02_System_Architecture.md
## Part 1 - High Level Architecture

**Project:** MyFNG Local AI Manager
**Version:** 1.0
**Status:** Production Architecture
**Backend:** Supabase
**Frontend:** Next.js 15
**Purpose:** Internal Enterprise Platform

---

# 1. Architecture Overview

## Objective

MyFNG Local AI Manager is an internal enterprise platform designed to centrally manage every MyFNG Google Business Profile from a single dashboard.

The platform will provide:

- Centralized Google Business Profile Management
- Review Management
- AI Generated Review Replies
- Google Posts
- Business Profile Analytics
- Local SEO
- Keyword Tracking
- Performance Reports
- Notification System
- AI Marketing Assistant

The platform is NOT intended for external customers.

It will only be used by MyFNG employees.

---

# 2. High Level System Diagram

                    Internet

                        │

                        ▼

              Next.js Web Application

                        │

         ─────────────────────────────────

        Server Actions / REST APIs

                        │

         ─────────────────────────────────

                    Supabase

        PostgreSQL Database

        Authentication

        Storage

        Edge Functions

        Realtime

                        │

        ───────────────────────────────

              Background Workers

                Redis Queue

                Cron Scheduler

                Sync Engine

                AI Processing

                        │

        ───────────────────────────────

                Google APIs

Business Information API

Business Profile Performance API

Reviews API

Media API

Google OAuth

---

# 3. Core Components

The platform consists of the following major components.

### Frontend

Responsible for

- Dashboard
- Reviews
- Analytics
- Google Posts
- AI
- Reports
- Settings

Technology

- Next.js 15
- React
- TypeScript
- TailwindCSS
- ShadCN

---

### Backend

Responsible for

- Business Logic
- Validation
- Authentication
- Google Sync
- AI Requests
- Report Generation

Technology

- Supabase Edge Functions
- PostgreSQL
- Redis
- Cron Jobs

---

### Database

Stores

- Locations
- Reviews
- Replies
- Posts
- Keywords
- Rankings
- Analytics
- AI History
- Audit Logs
- Notifications

Database Engine

Supabase PostgreSQL

---

### Google Integration Layer

Responsible for

- OAuth
- Profile Sync
- Review Sync
- Analytics Sync
- Posts
- Business Information Updates

All communication happens through official Google APIs.

---

### AI Layer

Responsible for

- AI Review Replies
- AI Google Posts
- AI Reports
- AI SEO Suggestions
- AI Profile Audit

Supported Models

OpenAI

Gemini

Claude

---

### Queue Layer

Responsible for

Long running tasks.

Example

Import Reviews

↓

Generate AI Reply

↓

Sync Analytics

↓

Generate Report

↓

Send Notification

Redis prevents blocking user requests.

---

# 4. Platform Modules

The platform is divided into independent modules.

Module 1

Authentication

---

Module 2

Dashboard

---

Module 3

Location Management

---

Module 4

Google Business Profiles

---

Module 5

Review Management

---

Module 6

Google Posts

---

Module 7

Media Library

---

Module 8

Performance Analytics

---

Module 9

Keyword Tracking

---

Module 10

Local SEO

---

Module 11

AI Assistant

---

Module 12

Reports

---

Module 13

Notifications

---

Module 14

Settings

---

Module 15

Audit Logs

---

# 5. Request Lifecycle

User Login

↓

Authentication

↓

Permission Check

↓

API Validation

↓

Business Logic

↓

Database

↓

Google API (if required)

↓

Response

↓

Realtime Update

---

# 6. Frontend Architecture

App Router

↓

Layouts

↓

Pages

↓

Server Components

↓

Client Components

↓

API Calls

↓

Supabase

Folder Structure

/app

/components

/lib

/hooks

/services

/types

/utils

/context

/public

/styles

---

# 7. Dashboard Architecture

The dashboard loads independent widgets.

Widgets

Business Overview

↓

Locations

↓

Reviews

↓

Average Rating

↓

Calls

↓

Website Clicks

↓

Direction Requests

↓

Latest Reviews

↓

AI Suggestions

↓

Ranking Summary

↓

Notifications

Every widget loads independently.

Failure of one widget should not affect others.

---

# 8. Google Sync Engine

Google is the source of truth.

Every sync follows:

Google

↓

Fetch Latest Data

↓

Validate

↓

Compare Database

↓

Insert New

↓

Update Existing

↓

Archive Deleted

↓

Write Logs

↓

Notify UI

No duplicate records should be created.

---

# 9. Analytics Flow

Google Performance API

↓

Daily Sync

↓

Normalize Data

↓

Store Daily Records

↓

Aggregate Weekly

↓

Aggregate Monthly

↓

Dashboard

↓

Reports

Raw API responses should never be shown directly.

---

# 10. Review Flow

Google Review

↓

Webhook / Scheduled Sync

↓

Store Review

↓

AI Sentiment

↓

Notify Dashboard

↓

AI Suggest Reply

↓

Manager Approval (Optional)

↓

Publish Reply

↓

Sync Status

All replies must be tracked with timestamps and editor information.

---

# 11. Google Posts Flow

Marketing Team

↓

Create Post

↓

AI Improve Content (Optional)

↓

Preview

↓

Schedule / Publish

↓

Google API

↓

Success Log

↓

Analytics Tracking

Supported Post Types

- What's New
- Offer
- Event
- Update

---

# 12. Media Architecture

Media uploads are stored in Supabase Storage.

Folders

/business-images

/post-images

/ai-images

/profile-images

/report-assets

Features

Image Compression

Image Resize

Metadata

Version History

---

# 13. AI Processing Flow

User Request

↓

Validation

↓

Prompt Builder

↓

Selected AI Model

↓

Response Validation

↓

Content Moderation

↓

Database

↓

Dashboard

Every AI response should be stored for future reference.

---

# 14. Notification Engine

Notification Sources

Google Sync

↓

Negative Reviews

↓

AI Alerts

↓

Ranking Drop

↓

Profile Error

↓

System Error

↓

Manual Alerts

Channels

Dashboard

Email

Future Push Notifications

---

# 15. Security Layers

Layer 1

Authentication

Layer 2

Authorization

Layer 3

API Validation

Layer 4

Rate Limiting

Layer 5

Audit Logging

Layer 6

Encrypted Tokens

Layer 7

Secure Environment Variables

---

# 16. Error Handling Strategy

Google API Failure

↓

Retry

↓

Log

↓

Notify

↓

Retry Queue

↓

Manual Retry

No user data should be lost.

---

# 17. Logging

System Logs

API Logs

Google Logs

AI Logs

Security Logs

Authentication Logs

Sync Logs

Error Logs

Audit Logs

Logs are immutable.

---

# 18. Performance Targets

Dashboard

< 2 Seconds

Review Page

< 1 Second

Search

< 500ms

AI Reply

< 10 Seconds

Google Sync

Background

Image Upload

< 5 Seconds

---

# 19. Scalability

Current Target

100+ MyFNG Locations

Future Ready

1000+ Locations

Millions of Reviews

Millions of Analytics Records

Architecture should support horizontal scaling without major redesign.

---

# 20. Next Document Sections

Part 2 will cover:

- Background Workers
- Redis Queue Design
- Google Synchronization Scheduler
- Cron Jobs
- Event Driven Architecture
- API Gateway Design
- Realtime Events
- Failure Recovery
- Caching Strategy
- Sync Conflict Resolution
- Google API Rate Limit Strategy
- Request Retry Strategy
- Data Consistency

END OF PART 1