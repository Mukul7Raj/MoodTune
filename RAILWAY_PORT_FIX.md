# Fix: "$PORT is not a valid port number" Error

## Problem

Railway sets the `PORT` environment variable, but Docker isn't expanding it correctly in the CMD instruction.

## ✅ Solution 1: Use Entrypoint Script (Already Fixed)

I've created an `entrypoint.sh` script that properly handles the PORT variable. The Dockerfile has been updated to use it.

**What changed:**
- Created `entrypoint.sh` that reads PORT env var with a default fallback
- Updated Dockerfile to use the entrypoint script
- This ensures PORT is properly expanded

**Next steps:**
1. Commit and push:
   ```bash
   git add backend/entrypoint.sh backend/Dockerfile
   git commit -m "Fix PORT environment variable handling in Dockerfile"
   git push
   ```

2. Redeploy in Railway - should work now!

## ✅ Solution 2: Don't Use Dockerfile (Simpler for Railway)

Railway works better with native builds (Procfile) than Dockerfiles. If Solution 1 doesn't work:

1. **In Railway Dashboard**:
   - Go to your service → **Settings** → **Build**
   - Change **Builder** from "Dockerfile" to "Nixpacks" (or remove Dockerfile detection)
   - Railway will use your `Procfile` instead

2. **Make sure Procfile exists** (already created):
   ```
   web: gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 app:app
   ```

3. **Rename or remove Dockerfile temporarily**:
   ```bash
   mv backend/Dockerfile backend/Dockerfile.backup
   git add backend/Dockerfile.backup
   git commit -m "Use Procfile instead of Dockerfile for Railway"
   git push
   ```

4. **Redeploy** - Railway will use Procfile and handle PORT correctly

## ✅ Solution 3: Set PORT Manually in Railway

If both solutions fail:

1. **In Railway Dashboard**:
   - Go to your service → **Settings** → **Variables**
   - Add environment variable:
     - **Name**: `PORT`
     - **Value**: `5000` (or any port you want)
   - Save

2. **Update Dockerfile CMD** to use default:
   ```dockerfile
   CMD gunicorn app:app --bind 0.0.0.0:5000
   ```

   Or keep using the entrypoint script (it will use PORT if set, or default to 5000)

## Why This Happens

- Docker CMD doesn't expand `$PORT` the same way shell scripts do
- Railway sets PORT as an environment variable, but Docker needs special handling
- Using an entrypoint script (bash) properly expands the variable

## Recommended Approach

**For Railway, I recommend Solution 2** (using Procfile instead of Dockerfile):
- Simpler
- Railway handles it natively
- Less configuration needed
- Faster builds

The entrypoint script (Solution 1) works if you want to keep using Dockerfile.

---

**Try Solution 1 first** (already implemented). If it doesn't work, use Solution 2 (switch to Procfile).
