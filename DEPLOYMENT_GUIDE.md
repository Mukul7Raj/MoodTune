# MoodTune - Deployment Guide

This guide provides step-by-step instructions to deploy your MoodTune application to production.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Option 1: Vercel (Frontend) + Railway (Backend) - Recommended](#option-1-vercel--railway)
3. [Option 2: Render (Both Frontend & Backend)](#option-2-render)
4. [Option 3: Vercel (Frontend) + Render (Backend)](#option-3-vercel--render)
5. [Post-Deployment Configuration](#post-deployment-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:
- ✅ Git repository (GitHub, GitLab, or Bitbucket)
- ✅ Spotify Developer Account with app credentials
- ✅ All environment variables ready

---

## Option 1: Vercel (Frontend) + Railway (Backend) - Recommended

This is the easiest and most cost-effective option for beginners.

### Step 1: Prepare Backend for Production

1. **Update CORS settings** in `backend/app.py`:
   - We'll need to make the CORS origins dynamic based on environment

2. **Create a production-ready startup file** (`backend/wsgi.py` or update `app.py`):
   - The app should use environment variables for host/port

3. **Create `Procfile` for Railway** (or use their default):
   ```procfile
   web: gunicorn app:app --bind 0.0.0.0:$PORT
   ```

4. **Create `runtime.txt`** (optional, for Python version):
   ```
   python-3.10.0
   ```

### Step 2: Deploy Backend to Railway

1. **Sign up/Login to Railway**:
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Select your MoodTune repository

3. **Configure Backend Service**:
   - Railway will auto-detect Python
   - **IMPORTANT**: Set Root Directory to: `backend`
   - **IMPORTANT**: Make sure `requirements.txt` exists in the `backend` folder (not just in root)
   - Add environment variables:
     ```
     DATABASE_URL=sqlite:///moodmusic.db
     SECRET_KEY=<generate-a-strong-secret-key>
     JWT_SECRET_KEY=<generate-a-strong-jwt-secret>
     SPOTIFY_CLIENT_ID=<your-spotify-client-id>
     SPOTIFY_CLIENT_SECRET=<your-spotify-client-secret>
     SPOTIFY_REDIRECT_URI=https://your-backend-url.railway.app/spotify/callback
     FLASK_ENV=production
     PORT=5000
     ```

4. **Install Gunicorn**:
   - Add `gunicorn==21.2.0` to `requirements.txt`

5. **Deploy**:
   - Railway will automatically deploy
   - Note the generated URL (e.g., `https://moodtune-backend.railway.app`)

6. **Update Spotify Redirect URI**:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Add your Railway backend URL: `https://your-backend-url.railway.app/spotify/callback`

### Step 3: Deploy Frontend to Vercel

1. **Sign up/Login to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Import Project**:
   - Click "Add New Project"
   - Import your GitHub repository
   - Set Root Directory to: `frontend`

3. **Configure Build Settings**:
   - Framework Preset: Next.js
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `.next` (auto-detected)

4. **Add Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
   ```

5. **Deploy**:
   - Click "Deploy"
   - Vercel will build and deploy automatically
   - Note your frontend URL (e.g., `https://moodtune.vercel.app`)

6. **Update Backend CORS**:
   - Go back to Railway
   - Add environment variable:
     ```
     FRONTEND_URL=https://your-frontend-url.vercel.app
     ```

---

## Option 2: Render (Both Frontend & Backend)

Deploy both services on Render for simplicity.

### Step 1: Deploy Backend to Render

1. **Sign up/Login to Render**:
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Create Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `moodtune-backend`
     - **Root Directory**: `backend`
     - **Environment**: Python 3
     - **Build Command**: `pip install -r ../requirements.txt && pip install gunicorn`
     - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT`

3. **Add Environment Variables**:
   ```
   DATABASE_URL=sqlite:///moodmusic.db
   SECRET_KEY=<generate-a-strong-secret-key>
   JWT_SECRET_KEY=<generate-a-strong-jwt-secret>
   SPOTIFY_CLIENT_ID=<your-spotify-client-id>
   SPOTIFY_CLIENT_SECRET=<your-spotify-client-secret>
   SPOTIFY_REDIRECT_URI=https://your-backend-url.onrender.com/spotify/callback
   FLASK_ENV=production
   PORT=10000
   ```

4. **Deploy**:
   - Click "Create Web Service"
   - Note the URL (e.g., `https://moodtune-backend.onrender.com`)

### Step 2: Deploy Frontend to Render

1. **Create Static Site**:
   - Click "New +" → "Static Site"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `moodtune-frontend`
     - **Root Directory**: `frontend`
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `.next`

2. **Add Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
   ```

3. **Deploy**:
   - Click "Create Static Site"
   - Note the URL (e.g., `https://moodtune-frontend.onrender.com`)

4. **Update Backend CORS**:
   - Go to backend service settings
   - Add environment variable:
     ```
     FRONTEND_URL=https://your-frontend-url.onrender.com
     ```

---

## Option 3: Vercel (Frontend) + Render (Backend)

Combine Vercel's excellent Next.js support with Render's backend hosting.

### Backend: Follow Option 2, Step 1 (Render Backend)

### Frontend: Follow Option 1, Step 3 (Vercel Frontend)

---

## Post-Deployment Configuration

### 1. Update Backend Code for Production

We need to make the backend production-ready:

1. **Update CORS to use environment variable**
2. **Update Flask app to use production server (Gunicorn)**
3. **Update Spotify redirect URI handling**

### 2. Update Spotify App Settings

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click on your app
3. Edit Settings
4. Add Redirect URIs:
   - Production: `https://your-backend-url/spotify/callback`
   - Keep localhost for development: `http://localhost:5000/spotify/callback`

### 3. Test Your Deployment

1. **Test Backend**:
   - Visit: `https://your-backend-url/`
   - Should see: `{"message": "Mood-Based Music API is live!"}`

2. **Test Frontend**:
   - Visit: `https://your-frontend-url/`
   - Try registering a new user
   - Test login
   - Test Spotify linking

---

## Troubleshooting

### Backend Issues

**Problem**: "Error creating build plan with Railpack" in Railway
- **Solution**: 
  1. **Ensure `requirements.txt` is in the `backend` folder** (not just in root)
  2. **Set Root Directory correctly**: In Railway service settings, set Root Directory to `backend`
  3. **Check for configuration files**: Make sure `Procfile`, `runtime.txt`, and `nixpacks.toml` exist in `backend` folder
  4. **Manual build configuration**: If auto-detection fails:
     - Go to Railway service → Settings → Build
     - Set Build Command: `pip install -r requirements.txt`
     - Set Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT`
  5. **Alternative**: Try using Dockerfile instead (see below)

**Problem**: Backend not starting
- **Solution**: Check logs in Railway/Render dashboard
- Ensure `gunicorn` is in `requirements.txt`
- Verify start command is correct

**Problem**: CORS errors
- **Solution**: Update `FRONTEND_URL` environment variable in backend
- Ensure CORS origins include your frontend URL

**Problem**: Database errors
- **Solution**: SQLite works but consider PostgreSQL for production
- Render provides free PostgreSQL databases

**Problem**: Spotify OAuth not working
- **Solution**: 
  - Verify redirect URI matches exactly in Spotify dashboard
  - Check `SPOTIFY_REDIRECT_URI` environment variable
  - Ensure backend URL is HTTPS

### Frontend Issues

**Problem**: API calls failing
- **Solution**: 
  - Verify `NEXT_PUBLIC_API_URL` is set correctly
  - Check browser console for CORS errors
  - Ensure backend is running

**Problem**: Build fails
- **Solution**: 
  - Check build logs in Vercel/Render
  - Ensure all dependencies are in `package.json`
  - Verify Node.js version compatibility

---

## Next Steps

1. ✅ Set up custom domains (optional)
2. ✅ Enable HTTPS (automatic on Vercel/Render)
3. ✅ Set up database backups (if using PostgreSQL)
4. ✅ Configure monitoring and logging
5. ✅ Set up CI/CD for automatic deployments

---

## Cost Estimates

### Free Tier Options:
- **Vercel**: Free for personal projects (generous limits)
- **Railway**: $5/month free credit, then pay-as-you-go
- **Render**: Free tier available (with limitations)

### Recommended for Production:
- **Vercel Pro**: $20/month (better performance)
- **Railway**: ~$5-10/month (backend)
- **Render**: $7/month per service (better for production)

---

## Security Checklist

Before going live:
- [ ] Change all default secret keys
- [ ] Use strong, unique JWT secret
- [ ] Enable HTTPS (automatic on most platforms)
- [ ] Review CORS settings
- [ ] Set up proper error logging
- [ ] Consider using PostgreSQL instead of SQLite
- [ ] Set up environment variable encryption
- [ ] Review and update dependencies

---

Need help? Check the logs in your hosting platform's dashboard for detailed error messages.
