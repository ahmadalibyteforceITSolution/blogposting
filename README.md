# blogposting

> **FB AutoBlog Master** — Luxury Autonomous & 1-Click Facebook & Group Auto-Blog & Video Posting Dashboard Software.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FahmadalibyteforceITSolution%2Fblogposting.git)

---

## 💎 Features & Capabilities

- 🚀 **1-Click Multi-Poster Studio**: Select any blog post or video, choose unlimited target Facebook groups/pages with "Select All" or tag filters, and publish in a single click.
- 🎬 **Full Video & Image Posting Support**:
  - Direct local video uploads (`.mp4`, `.mov`, `.webm`)
  - Video URLs & Rich Link Previews
  - High-res image attachments
  - Automatic Facebook video processing detector
- ⏰ **Auto Everything Scheduler (24/7 Campaigns)**:
  - Create recurring automated campaigns
  - Round-robin least-posted distribution, random rotation, or latest articles
  - Multi-post repeat cycles (re-post 2x, 3x, 5x, 10x with safety intervals)
- 📡 **RSS / Atom & One-Click URL Ingestion**:
  - Sync WordPress, Blogger, Medium, Ghost, and custom RSS feeds
  - Auto-post new RSS releases as soon as published
  - Instant Blog URL Scraper: paste any article URL and it auto-extracts title, cover image, and excerpt
- 🛡️ **Anti-Ban & Anti-Spam Safety Guard**:
  - Configurable random jitter delays (e.g. 45–90 seconds) between group submissions
  - Dynamic Spintax text variations (`{Check out|Discover|Read}: {title} {link}`)
  - Humanized keystrokes and mouse movement simulation
- 🔐 **Safe Persistent Session**:
  - Interactive Facebook login helper: log in safely once using your existing Chrome profile; sessions and cookies are remembered permanently.
- ✨ **Luxury Dark Glassmorphism UI**:
  - High-end enterprise dashboard with real-time SSE progress streaming, terminal logs, and system metrics.

---

## ⚡ Quick Start (Desktop)

### 1. Requirements
- Node.js (v18 or newer)
- Google Chrome or Microsoft Edge installed on your PC

### 2. Launching in 1-Click
Double-click `start.bat` on Windows:
```cmd
start.bat
```
The software will automatically install dependencies, start the server, and open `http://localhost:3000` in your browser.

Or run manually:
```bash
npm install
npm start
```

---

---

## 🌐 Deploy to Vercel with SQL Database

This repository is pre-configured with `vercel.json`, `api/index.js`, and `server/sqlDatabase.js` for instant deployment to Vercel:

### Step 1: Deploy Project
1. Go to [Vercel](https://vercel.com/bytely-team/)
2. Click **Add New Project** -> **Import Git Repository**
3. Select `ahmadalibyteforceITSolution/blogposting`
4. Framework Preset: **Other** (Root directory: `./`)
5. Click **Deploy**!

### Step 2: Attach Vercel Postgres SQL Database (1-Click)
1. On your Vercel project dashboard, navigate to the **Storage** tab.
2. Click **Create Database** -> Select **Postgres** (Powered by Neon).
3. Click **Connect Project**.
   - Vercel automatically creates and binds `POSTGRES_URL` to your production environment.
4. Redeploy or restart the project:
   - The software will automatically detect PostgreSQL, create all relational tables (`posts`, `groups`, `rss_sources`, `campaigns`, `history`, `settings`), and run with persistent SQL storage!
5. (Optional) You can also inspect or customize tables using the provided [`schema.sql`](schema.sql) file.

---

## 👥 Bulk Import Facebook Groups

In the **Facebook Groups** tab, click **Bulk Import URLs** and paste your group links:
```text
https://www.facebook.com/groups/digitalmarketingpros
https://www.facebook.com/groups/techstartups
Crypto Investors, https://www.facebook.com/groups/cryptoworld
```

---

## 📜 Git Repository Setup

```bash
git init
git add .
git commit -m "first commit: FB AutoBlog Master luxury suite"
git branch -M main
git remote add origin https://github.com/ahmadalibyteforceITSolution/blogposting.git
git push -u origin main
```
