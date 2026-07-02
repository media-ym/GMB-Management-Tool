# 12_Admin_Settings.md

## System Administration & Configuration Module

**Project:** MyFNG Local AI Manager  
**Version:** 1.0  
**Status:** Production Ready

---

# 1. Objective

The Admin Settings module provides centralized control over the platform configuration, user management, Google integrations, AI providers, system preferences, notifications, audit logs, and operational settings.

Only authorized administrators can access this module.

---

# 2. Module Goals

- Manage platform configuration
- Control user access
- Configure Google integrations
- Configure AI providers
- Manage notifications
- Monitor system health
- View audit logs
- Manage global settings

---

# 3. Admin Dashboard

Widgets

```
Total Users

Active Sessions

Connected Google Accounts

Active Locations

System Health

Last Google Sync

Failed Jobs

Pending AI Jobs

Storage Usage

Database Status

API Usage

Latest System Alerts
```

---

# 4. User Management

Functions

- Create User
- Edit User
- Disable User
- Reset Password
- Assign Role
- Assign Locations
- View Activity

Fields

```
Full Name

Email

Mobile

Role

Assigned Locations

Status

Last Login

Created Date
```

---

# 5. Role Management

Default Roles

```
Super Admin

Marketing Manager

Branch Manager

Customer Support

Viewer
```

Permissions can be assigned per role.

Future support

Custom Roles.

---

# 6. Google Integration Settings

Configure

- Google OAuth
- Client ID
- Redirect URI
- Connected Account
- Sync Frequency
- Default Sync Options

View

- OAuth Status
- Token Expiry
- Last Refresh
- API Health

---

# 7. AI Provider Settings

Supported Providers

```
OpenAI

Gemini

Claude
```

Configuration

- API Key
- Default Model
- Temperature
- Max Tokens
- Timeout
- Retry Count

Ability to switch default model without code changes.

---

# 8. AI Prompt Management

Manage prompt templates for

- Review Reply
- Google Posts
- SEO Recommendations
- Business Description
- Monthly Reports
- Profile Audit

Each prompt includes

- Version
- Variables
- Active Status
- Last Modified

---

# 9. Notification Settings

Channels

- Dashboard
- Email

Future

- WhatsApp
- Slack

Configurable Events

- New Review
- 1-Star Review
- Sync Failure
- Token Expiry
- AI Job Failure
- Scheduled Report Ready

---

# 10. Dashboard Configuration

Manage

- Default Widgets
- Widget Order
- Refresh Interval
- Default Date Range
- Default Landing Page

---

# 11. System Settings

General

- Company Name
- Logo
- Support Email
- Timezone
- Language
- Date Format
- Currency

---

# 12. Sync Settings

Configure

- Review Sync Interval
- Analytics Sync Interval
- Business Profile Sync Interval
- Retry Attempts
- Retry Delay
- Batch Size

---

# 13. Email Configuration

SMTP Settings

- Host
- Port
- Username
- Password
- Encryption
- Sender Name
- Sender Email

Test email function required.

---

# 14. Storage Settings

View

- Total Storage
- Used Storage
- Bucket Usage
- Largest Files
- Storage Growth

Actions

- Cleanup Temporary Files
- Archive Reports

---

# 15. API Usage

Display

- Google API Requests
- AI Requests
- Failed Requests
- Average Response Time
- Rate Limit Status

---

# 16. Audit Logs

View

- User
- Module
- Action
- Timestamp
- IP Address
- Entity
- Previous Value
- New Value

Filters

- User
- Module
- Date
- Action

Audit logs are read-only.

---

# 17. Activity Logs

Track

- Login
- Logout
- Review Reply
- Post Publish
- Profile Update
- Settings Change
- AI Generation
- Report Export

Searchable and filterable.

---

# 18. Error Monitoring

Display

- Module
- Error Code
- Error Message
- Frequency
- Last Occurrence
- Resolution Status

Actions

- Retry Job
- Mark Resolved
- View Details

---

# 19. Background Jobs

Monitor

- Queue Length
- Running Jobs
- Failed Jobs
- Average Processing Time

Actions

- Retry Failed Job
- Cancel Pending Job
- View Payload

---

# 20. Health Checks

Monitor

- Database
- Realtime
- Storage
- Google API
- AI Provider
- SMTP
- Cron Jobs
- Edge Functions

Health Status

```
Healthy

Warning

Critical
```

---

# 21. Backup & Restore

Display

- Last Backup
- Backup Status
- Retention Period

Actions

- Trigger Manual Backup
- Download Backup Metadata
- Verify Backup Integrity

Restore operations restricted to Super Admin.

---

# 22. Security Settings

Configure

- Password Policy
- Session Timeout
- Account Lockout
- JWT Expiry
- Allowed IPs (Future)
- MFA (Future)

---

# 23. Environment Information

Read-only

- Environment
- Application Version
- Build Number
- Deployment Date
- Database Version
- Supabase Project ID

---

# 24. API Endpoints

Examples

```
GET    /api/admin/users

POST   /api/admin/users

PUT    /api/admin/users/{id}

GET    /api/admin/settings

PUT    /api/admin/settings

GET    /api/admin/audit

GET    /api/admin/activity

GET    /api/admin/system-health

GET    /api/admin/api-usage

POST   /api/admin/test-email
```

Restricted to authorized administrators.

---

# 25. Validation Rules

- Unique email for users
- Valid role assignment
- Valid API credentials
- Valid SMTP configuration
- Required settings cannot be empty

Changes are audited.

---

# 26. Production Checklist

- User management tested
- Role permissions verified
- Google settings configured
- AI provider configured
- Notification rules tested
- SMTP tested
- Audit logging enabled
- Background job monitoring verified
- Health checks operational
- Backup strategy validated

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `13_API_Documentation.md`