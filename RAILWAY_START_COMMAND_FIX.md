# Quick Fix: "No start command was found" Error

## ✅ IMMEDIATE SOLUTION (2 minutes)

Railway detected your Python app but couldn't find the start command. Here's how to fix it:

### Step-by-Step Instructions:

1. **Open Railway Dashboard**
   - Go to [railway.app](https://railway.app)
   - Click on your project
   - Click on your backend service

2. **Go to Settings**
   - Click the **"Settings"** tab (top navigation)
   - Scroll down to find the **"Deploy"** section

3. **Set Start Command**
   - Find the **"Start Command"** field
   - Paste this command:
     ```
     gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 app:app
     ```
   - Or use this simpler version:
     ```
     gunicorn app:app --bind 0.0.0.0:$PORT
     ```

4. **Save and Deploy**
   - Click **"Save"** button
   - Go to **"Deployments"** tab
   - Click **"Redeploy"** (or push a new commit to trigger auto-deploy)

5. **Verify**
   - Wait for deployment to complete
   - Check the logs - you should see Gunicorn starting
   - Visit your backend URL: `https://your-service.railway.app/`
   - Should see: `{"message": "Mood-Based Music API is live!"}`

## Why This Happens

Railway's Railpack auto-detection sometimes doesn't find the Procfile or start command, even when the files exist. Setting it manually in the dashboard ensures Railway knows exactly how to start your app.

## Alternative: If Start Command Field is Missing

If you don't see a "Start Command" field in Settings:

1. Go to **Settings** → **Build**
2. Look for **"Build Command"** and **"Start Command"** fields
3. If still not visible, try:
   - Go to **Settings** → **Service**
   - Look for deployment configuration options
   - Or use the **railway.json** file (already created in backend folder)

## What the Command Does

- `gunicorn` - Production WSGI server for Python
- `--bind 0.0.0.0:$PORT` - Binds to all interfaces on Railway's assigned port
- `--workers 2` - Runs 2 worker processes (good for small apps)
- `--timeout 120` - 2 minute timeout (needed for heavy ML operations)
- `app:app` - Points to the `app` variable in `app.py` file

## After Fixing

Once the deployment succeeds:

1. ✅ Test backend: Visit `https://your-backend-url.railway.app/`
2. ✅ Set environment variables (if not already done)
3. ✅ Update Spotify redirect URI
4. ✅ Deploy frontend

---

**Still having issues?** Check the full troubleshooting guide in `RAILWAY_FIX.md`
