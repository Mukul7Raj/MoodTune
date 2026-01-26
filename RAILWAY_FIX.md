# Railway Build Error Fix

## Error: "Error creating build plan with Railpack"

This error occurs when Railway can't automatically detect your project structure. Here are the solutions:

## ✅ Solution 1: Verify File Structure (Easiest)

1. **Check that `requirements.txt` exists in the `backend` folder**
   - The file should be at: `backend/requirements.txt`
   - Not just at the root: `requirements.txt`

2. **In Railway Dashboard**:
   - Go to your service → Settings
   - Under "Source", set **Root Directory** to: `backend`
   - Save and redeploy

3. **Verify these files exist in `backend` folder**:
   - ✅ `requirements.txt`
   - ✅ `Procfile`
   - ✅ `runtime.txt`
   - ✅ `app.py`

## ✅ Solution 2: Manual Build Configuration

If Solution 1 doesn't work:

1. **In Railway Dashboard**:
   - Go to your service → Settings → Build
   - **Disable** "Auto Deploy" temporarily
   - Set **Build Command**: `pip install -r requirements.txt`
   - Set **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT`
   - Save and redeploy

## ✅ Solution 3: Use Dockerfile (Most Reliable)

If Solutions 1 & 2 don't work, Railway will automatically use the Dockerfile:

1. **The Dockerfile is already created** at `backend/Dockerfile`
2. **In Railway Dashboard**:
   - Go to your service → Settings → Build
   - Railway should auto-detect the Dockerfile
   - If not, set Builder to "Dockerfile"
   - Redeploy

## ✅ Solution 4: Check Railway Service Settings

1. **Verify Service Type**:
   - Should be "Web Service" (not Static Site)
   
2. **Check Environment Variables**:
   - Make sure you've added all required variables
   - Especially: `PORT` (Railway sets this automatically, but you can set it manually)

3. **Check Build Logs**:
   - Click on "Deployments" → Latest deployment → "View Logs"
   - Look for specific error messages
   - Common issues:
     - Missing dependencies
     - Python version mismatch
     - File path issues

## Quick Checklist

Before redeploying, ensure:

- [ ] `backend/requirements.txt` exists
- [ ] `backend/Procfile` exists with: `web: gunicorn app:app --bind 0.0.0.0:$PORT`
- [ ] `backend/runtime.txt` exists with: `python-3.10.0`
- [ ] Root Directory in Railway is set to `backend`
- [ ] All environment variables are set
- [ ] Code is committed and pushed to GitHub

## Still Having Issues?

1. **Check Railway Logs**:
   - Go to your service → Deployments → Click on failed deployment
   - Read the full error message
   - Look for specific file or dependency errors

2. **Try Alternative Platform**:
   - Consider using Render instead (see DEPLOYMENT_GUIDE.md, Option 2)
   - Render has better Python detection

3. **Common Issues**:
   - **Heavy dependencies** (TensorFlow, OpenCV): These can cause build timeouts
   - **Solution**: Consider using lighter alternatives or increasing build timeout
   - **Memory issues**: Large dependencies need more memory
   - **Solution**: Railway Pro plan or use Render

## Next Steps After Fix

Once the build succeeds:

1. ✅ Test the backend health endpoint: `https://your-backend-url.railway.app/`
2. ✅ Verify environment variables are set correctly
3. ✅ Update Spotify redirect URI with your production URL
4. ✅ Deploy frontend and connect it to backend

---

**Note**: The files have been created/updated. Make sure to commit and push to GitHub:
```bash
git add backend/requirements.txt backend/Procfile backend/runtime.txt backend/nixpacks.toml backend/railway.json backend/Dockerfile
git commit -m "Add Railway deployment configuration files"
git push
```

Then try redeploying in Railway!
