# 06_Authentication_RBAC.md

## Authentication & Role Based Access Control (RBAC)

**Project:** MyFNG Local AI Manager  
**Version:** 1.0  
**Status:** Production Ready

---

# 1. Objective

Provide a secure authentication and authorization system for internal MyFNG employees.

The system must ensure:

- Secure login
- Role-based permissions
- Session management
- Audit logging
- Least-privilege access
- Account security

---

# 2. Authentication Strategy

Authentication Provider

```
Supabase Auth
```

Login Methods

```
Email + Password

Google Workspace Login (Optional)
```

Registration

```
Disabled
```

Only Super Admin can create users.

---

# 3. User Lifecycle

```
Super Admin

↓

Create User

↓

Assign Role

↓

Send Invitation

↓

User Sets Password

↓

First Login

↓

Dashboard Access
```

---

# 4. User Roles

```
Super Admin

Marketing Manager

Branch Manager

Customer Support

Viewer
```

---

# 5. Role Permissions

## Super Admin

Full system access.

Can

- Manage users
- Manage roles
- Configure Google integration
- Manage all locations
- System settings
- AI configuration
- Reports
- Audit logs

Cannot

None.

---

## Marketing Manager

Can

- Create Google Posts
- Edit business descriptions
- Upload photos
- Use AI tools
- View analytics
- Manage reviews
- Export reports

Cannot

- Create users
- Change security settings
- Delete system logs

---

## Branch Manager

Limited to assigned locations.

Can

- View location dashboard
- Reply to reviews
- Update business hours
- Publish posts
- View analytics
- Upload media

Cannot

- Access other locations
- Manage users
- Change global settings

---

## Customer Support

Can

- Read reviews
- Generate AI replies
- Publish approved replies
- View notifications

Cannot

- Publish posts
- Modify business information
- Change settings

---

## Viewer

Read-only access.

Can

- Dashboard
- Reviews
- Analytics
- Reports

Cannot

- Create
- Update
- Delete
- Publish

---

# 6. Permission Matrix

| Module | Super Admin | Marketing | Branch | Support | Viewer |
|---------|-------------|-----------|---------|----------|--------|
| Dashboard | ✔ | ✔ | ✔ | ✔ | ✔ |
| Reviews | ✔ | ✔ | ✔ | ✔ | ✔ |
| Reply Reviews | ✔ | ✔ | ✔ | ✔ | ✖ |
| Google Posts | ✔ | ✔ | ✔ | ✖ | ✖ |
| Business Info | ✔ | ✔ | ✔ | ✖ | ✖ |
| Analytics | ✔ | ✔ | ✔ | ✔ | ✔ |
| SEO | ✔ | ✔ | ✔ | ✖ | ✔ |
| AI | ✔ | ✔ | ✔ | ✔ | ✖ |
| Users | ✔ | ✖ | ✖ | ✖ | ✖ |
| Settings | ✔ | ✖ | ✖ | ✖ | ✖ |
| Audit Logs | ✔ | ✖ | ✖ | ✖ | ✖ |

---

# 7. Login Flow

```
User

↓

Login Page

↓

Supabase Auth

↓

Validate Credentials

↓

JWT Issued

↓

Load User Profile

↓

Load Permissions

↓

Dashboard
```

---

# 8. Session Management

JWT Expiry

```
8 Hours
```

Refresh Token

```
Enabled
```

Idle Timeout

```
30 Minutes
```

Remember Me

```
30 Days
```

---

# 9. Password Policy

Minimum

```
12 Characters
```

Require

- Uppercase
- Lowercase
- Number
- Special Character

Disallow

- Common passwords
- Previous passwords (future enhancement)

---

# 10. Password Reset

Flow

```
Forgot Password

↓

Email Verification

↓

Reset Link

↓

New Password

↓

Login
```

Reset links expire after 30 minutes.

---

# 11. Account Lockout

After

```
5 Failed Login Attempts
```

Account is temporarily locked.

Lock Duration

```
15 Minutes
```

Admin can unlock manually.

---

# 12. User Profile

Each user has

- Name
- Email
- Mobile
- Avatar
- Role
- Assigned Locations
- Last Login
- Status
- Preferred Language
- Timezone

---

# 13. Location Assignment

Branch Managers and Customer Support users can be assigned to one or more locations.

Rules

- Access limited to assigned locations.
- Dashboard filters automatically apply assigned scope.
- Unauthorized location access returns HTTP 403.

---

# 14. Middleware Authorization

Every protected route performs:

```
Authenticate User

↓

Validate JWT

↓

Load Role

↓

Check Permission

↓

Allow / Deny
```

---

# 15. Route Protection

Public

```
Login

Forgot Password

Reset Password
```

Protected

```
Dashboard

Reviews

Posts

Analytics

SEO

Settings
```

Admin Only

```
User Management

System Settings

API Keys

Audit Logs
```

---

# 16. API Authorization

Every API request validates:

- Authenticated user
- Active account
- Required permission
- Assigned location (if applicable)

Unauthorized requests return:

```
401 Unauthorized

403 Forbidden
```

---

# 17. Activity Tracking

Track

- Login
- Logout
- Failed Login
- Password Reset
- Profile Update
- Role Change
- Review Reply
- Post Publish
- Business Update

All events stored in `activity_logs`.

---

# 18. Audit Logging

Critical actions stored in `audit_logs`.

Capture

- Previous Value
- New Value
- User
- Timestamp
- Entity
- IP Address

Audit logs are immutable.

---

# 19. Security Controls

- HTTPS only
- Secure cookies
- JWT validation
- CSRF protection (where applicable)
- XSS protection
- Content Security Policy
- Input validation
- Output escaping

---

# 20. User Status

Possible values

```
Active

Inactive

Invited

Locked

Suspended
```

Inactive users cannot log in.

---

# 21. Notification Preferences

Each user can configure

- Email notifications
- Dashboard alerts
- AI suggestions
- Review alerts
- Sync failure alerts

Stored in `user_preferences`.

---

# 22. Future Enhancements

- Google Workspace SSO
- MFA (TOTP)
- Hardware Security Keys (WebAuthn)
- IP allowlist
- Device management
- Session management dashboard

---

# 23. Production Checklist

- Supabase Auth configured
- Email templates customized
- Password policy enforced
- JWT expiration verified
- Role permissions seeded
- Middleware tested
- Route guards implemented
- Audit logging enabled
- Activity logging enabled
- Account lockout tested

---

# End of Document

**Document Status:** COMPLETE

**Next Document:** `07_Location_Management.md`