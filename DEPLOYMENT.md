# ═══════════════════════════════════════════════════════════════════════════
# MyFNG Local AI Manager — Hostinger Deployment Guide
# Complete step-by-step guide to deploy on Hostinger with real GMB connection.
# ═══════════════════════════════════════════════════════════════════════════

## Phase 1: Google Cloud Console Setup (Real GMB Connection)

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Name: `MyFNG Local AI Manager`
4. Click "Create"

### Step 2: Enable Required Google APIs
1. Go to "APIs & Services" → "Library"
2. Search and enable each:
   - **Google Business Profile API**
   - **Google Business Information API**
   - **Google Business Performance API**
   - **Google People API** (for user info)

### Step 3: Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. User type: **Internal** (for Google Workspace) or **External** (for testing)
3. Fill in:
   - App name: `MyFNG Local AI Manager`
   - User support email: your email
   - Developer contact: your email
4. Add Scopes:
   - `https://www.googleapis.com/auth/business.manage`
   - `https://www.googleapis.com/auth/business.info`
   - `openid`
   - `email`
   - `profile`
5. Save and Continue

### Step 4: Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: `MyFNG Local AI Manager`
5. **Authorized JavaScript origins**:
   - `https://your-domain.com`
   - `https://www.your-domain.com`
6. **Authorized redirect URIs**:
   - `https://your-domain.com/api/google/callback`
7. Click "Create"
8. **Copy the Client ID and Client Secret** — you'll need these

### Step 5: Google Business Profile Verification
1. Go to https://business.google.com/
2. Verify your business locations (if not already done)
3. Ensure you have Manager/Owner access to all MyFNG locations

---

## Phase 2: Hostinger Setup

### Step 1: Create Hostinger Account
1. Go to https://www.hostinger.com/
2. Choose a hosting plan (VPS or Premium Web Hosting with Node.js support)
3. Recommended: **VPS Plan** (more control) or **Premium/Business Hosting**

### Step 2: Create Database (PostgreSQL)
1. In Hostinger hPanel → "Databases" → "PostgreSQL Databases"
2. Create a new database:
   - Database name: `myfng_db`
   - Username: `myfng_user`
   - Password: (generate a strong password)
3. Note the connection details:
   - Host: `localhost` (or the provided host)
   - Port: `5432`
   - Database: `myfng_db`
   - Username: `myfng_user`
   - Password: (your password)
4. Connection string: `postgresql://myfng_user:password@localhost:5432/myfng_db`

---

## Phase 3: Deploy the Application

### Option A: Deploy via Git (Recommended)

1. **Push your code to GitHub** (if not already done)

2. **In Hostinger hPanel**:
   - Go to "Advanced" → "Git" (or "Node.js" depending on plan)
   - Click "Clone Repository"
   - Enter your GitHub repo URL
   - Set deployment path: `/domains/your-domain.com/public_html`
   - Branch: `main`

3. **Set up Node.js** (if using VPS):
   ```bash
   # SSH into your server
   ssh username@your-server-ip
   
   # Install Node.js (if not installed)
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install Bun
   curl -fsSL https://bun.sh/install | bash
   source ~/.bashrc
   
   # Navigate to your app
   cd /domains/your-domain.com/public_html
   
   # Install dependencies
   bun install
   
   # Set up environment variables
   nano .env
   # Paste all values from .env.example with your real credentials
   ```

4. **Switch to PostgreSQL schema**:
   ```bash
   # Edit prisma/schema.prisma
   # Change provider from "sqlite" to "postgresql"
   nano prisma/schema.prisma
   # Change line: provider = "sqlite" to provider = "postgresql"
   
   # Generate Prisma client for PostgreSQL
   bun run db:generate
   
   # Create all tables in PostgreSQL
   bun run db:push
   
   # Seed initial data (users, roles, 15 locations, etc.)
   bunx tsx prisma/seed.ts
   ```

5. **Build the application**:
   ```bash
   bun run build
   ```

6. **Start the application**:
   ```bash
   # Using PM2 (process manager — keeps app running)
   npm install -g pm2
   pm2 start "bun run start" --name "myfng"
   pm2 save
   pm2 startup  # auto-start on server reboot
   ```

### Option B: Deploy via SSH + Manual Upload

1. **Upload files** via FTP/SFTP to `/domains/your-domain.com/public_html/`
   - Exclude: `node_modules/`, `.next/`, `db/`
   
2. **SSH into server** and follow steps 3-6 from Option A

---

## Phase 4: Configure SSL & Domain

### Step 1: SSL Certificate
1. In Hostinger hPanel → "SSL" → "Install SSL"
2. Select your domain
3. Use free Let's Encrypt SSL
4. Force HTTPS redirect

### Step 2: Update Google OAuth Redirect URI
1. Go back to Google Cloud Console → Credentials
2. Update redirect URI to: `https://your-domain.com/api/google/callback`

### Step 3: Update .env
```
NEXTAUTH_URL=https://your-domain.com
GOOGLE_REDIRECT_URI=https://your-domain.com/api/google/callback
```

---

## Phase 5: Verify & Test

### Step 1: Test Login
1. Visit `https://your-domain.com`
2. Login with `admin@myfng.in` / `MyFNG@2025`
3. Verify dashboard loads

### Step 2: Connect Google Business Profile
1. Go to "Google Integration" module
2. Click "Connect Google Business Profile"
3. Complete Google OAuth consent
4. Verify real locations appear

### Step 3: Sync Real Data
1. Click "Sync" on any location
2. Verify real reviews sync from Google
3. Verify real analytics data appears

### Step 4: Test AI Features
1. Open "MiSA AI" module
2. Send a chat message
3. Verify AI responds

---

## Phase 6: Production Checklist

- [ ] Google Cloud project created
- [ ] Google Business Profile APIs enabled
- [ ] OAuth consent screen configured
- [ ] OAuth credentials created (Client ID + Secret)
- [ ] Hostinger account + hosting plan
- [ ] PostgreSQL database created
- [ ] .env configured with all real values
- [ ] Prisma schema switched to PostgreSQL
- [ ] Database tables created (db:push)
- [ ] Seed data inserted (seed.ts)
- [ ] Application built (bun run build)
- [ ] PM2 process manager running
- [ ] SSL certificate installed
- [ ] Domain pointing to app
- [ ] Google OAuth redirect URI updated
- [ ] Login works
- [ ] Google Business Profile connected
- [ ] Real reviews sync
- [ ] Real analytics display
- [ ] AI features work
- [ ] Email notifications tested

---

## Troubleshooting

### Common Issues:

**"Google token exchange failed"**
→ Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI match Google Console

**"Database connection failed"**
→ Check DATABASE_URL format: `postgresql://user:pass@host:5432/dbname`

**"Prisma client not generated"**
→ Run `bun run db:generate` after changing schema provider

**"Build failed"**
→ Run `bun run lint` to find errors, fix them, then rebuild

**"App not starting"**
→ Check PM2 logs: `pm2 logs myfng`

**"Google API quota exceeded"**
→ Check Google Cloud Console → APIs & Services → Quotas

---

## Support

For issues, check:
1. PM2 logs: `pm2 logs myfng --lines 100`
2. Application logs in dev.log
3. Browser console for frontend errors
4. Network tab for API errors

Contact: MyFNG IT Team
