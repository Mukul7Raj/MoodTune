# MoodTune - Team Setup Guide

This guide will help you set up and run the MoodTune application on your local machine. Follow these steps carefully to ensure everything works consistently across all team members' devices.

---

## 📋 Prerequisites

Before starting, make sure you have the following installed:

### 1. **Python 3.10 or higher**
   - Download from: https://www.python.org/downloads/
   - **Important:** During installation, check "Add Python to PATH"
   - Verify installation:
     ```bash
     python --version
     ```
     Should show Python 3.10 or higher

### 2. **Node.js 18 or higher**
   - Download from: https://nodejs.org/
   - Install the LTS (Long Term Support) version
   - Verify installation:
     ```bash
     node --version
     npm --version
     ```
     Both should show version numbers

### 3. **Git** (if not already installed)
   - Download from: https://git-scm.com/downloads
   - Verify: Run `git --version`

---

## 📥 Step 1: Get the Project Code

### Option A: If using Git repository
```bash
git clone <repository-url>
cd MoodTune
```

### Option B: If sharing via ZIP/folder
- Extract the project folder to your desired location
- Open terminal/command prompt and navigate to the project:
  ```bash
  cd path/to/MoodTune
  ```

---

## 🔧 Step 2: Backend Setup

### 2.1 Navigate to Backend Directory
```bash
cd backend
```

### 2.2 Create Python Virtual Environment
```bash
# Windows
python -m venv venv

# macOS/Linux
python3 -m venv venv
```

### 2.3 Activate the Virtual Environment

**Windows (PowerShell):**
```bash
venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```bash
venv\Scripts\activate.bat
```

**macOS/Linux:**
```bash
source venv/bin/activate
```

**✅ Verification:** You should see `(venv)` in your terminal prompt when activated.

### 2.4 Install Python Dependencies
```bash
# Make sure you're in the backend directory with venv activated
pip install -r requirements.txt
```

**⏱️ Note:** This may take 5-10 minutes as it installs TensorFlow and other large packages. Be patient!

### 2.5 Create Environment Variables File

**⚠️ IMPORTANT:** Create the `.env` file at the **PROJECT ROOT** (not in the backend folder!)

1. Navigate back to the project root:
   ```bash
   cd ..
   ```

2. Create a new file named `.env` in the `MoodTune` folder (same level as `backend` and `frontend` folders)

3. Add the following content (replace placeholder values with actual credentials):
   ```env
   # Database (for local development with SQLite)
   DATABASE_URL=sqlite:///moodmusic.db
   
   # Secret key for session handling, JWTs, etc.
   SECRET_KEY=your-super-secret-key-change-this
   
   # Spotify Developer credentials (get these from developer.spotify.com)
   SPOTIFY_CLIENT_ID=your-spotify-client-id
   SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
   SPOTIFY_REDIRECT_URI=http://localhost:5000/spotify/callback
   
   # JWT Secret Key
   JWT_SECRET_KEY=super-secure-jwt-key-change-this
   
   # Google OAuth credentials (optional)
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/google/callback
   ```

**📝 Getting Spotify Credentials:**
1. Go to https://developer.spotify.com/dashboard
2. Log in with your Spotify account
3. Click "Create app"
4. Fill in app name and description
5. Copy the **Client ID** and **Client Secret**
6. Click "Edit Settings"
7. Under "Redirect URIs", add: `http://localhost:5000/spotify/callback`
8. Save and use these values in your `.env` file

**🔐 Security Note:** 
- Each team member can use their own Spotify Developer account, OR
- Share the same credentials if using a shared team account
- Never commit the `.env` file to git (it's already in `.gitignore`)

### 2.6 Create Instance Directory (for Database)
```bash
# From backend directory
cd backend

# Windows
mkdir instance

# macOS/Linux
mkdir -p instance
```

The database file (`moodmusic.db`) will be automatically created here on first run.

---

## 🎨 Step 3: Frontend Setup

### 3.1 Navigate to Frontend Directory
```bash
# From project root
cd frontend
```

### 3.2 Install Node.js Dependencies
```bash
npm install
```

This will install React, Next.js, TypeScript, and other frontend dependencies.

### 3.3 Create Environment Variables File (Optional but Recommended)

**Note:** The frontend will work without this file (it defaults to `http://localhost:5000`), but creating it ensures consistency across the team.

1. Create a new file named `.env.local` in the `frontend` directory

2. Add the following content:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```

**Why optional?** The frontend code has a fallback default, but having this file ensures everyone uses the same configuration.

---

## 🚀 Step 4: Running the Application

**⚠️ IMPORTANT:** You need to run both backend and frontend servers simultaneously in separate terminals.

### Terminal 1 - Start Backend Server

```bash
# Navigate to backend directory
cd backend

# Activate virtual environment (if not already activated)
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# Run the backend server
python app.py
```

**✅ Expected Output:**
```
 * Running on http://127.0.0.1:5000
 * Running on http://localhost:5000
```

**🔒 Keep this terminal open!** The backend must stay running.

### Terminal 2 - Start Frontend Server

```bash
# Navigate to frontend directory
cd frontend

# Run the development server
npm run dev
```

**✅ Expected Output:**
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - ready started server on 0.0.0.0:3000
```

**🔒 Keep this terminal open!** The frontend must stay running.

### Step 4.3: Open the Application

1. Open your web browser (Chrome, Firefox, Edge, etc.)
2. Navigate to: **http://localhost:3000**
3. The MoodTune application should load!

---

## ✅ Step 5: Verification Checklist

Verify everything is working correctly:

- [ ] Backend server is running on `http://localhost:5000`
- [ ] Frontend server is running on `http://localhost:3000`
- [ ] Can access the homepage at `http://localhost:3000`
- [ ] Can register a new account
- [ ] Can login with registered account
- [ ] No errors in browser console (Press F12 → Console tab)
- [ ] No errors in backend terminal
- [ ] No errors in frontend terminal

---

## 🐛 Common Issues & Solutions

### Issue 1: "python: command not found" or "python3: command not found"
**Solution:**
- **Windows:** Reinstall Python and make sure "Add Python to PATH" is checked
- **macOS/Linux:** Use `python3` instead of `python`, or install Python from python.org

### Issue 2: "pip: command not found"
**Solution:**
- Use `python -m pip` instead of `pip`
- Or reinstall Python with pip included

### Issue 3: Backend won't start - "Module not found" errors
**Solution:**
1. Ensure virtual environment is activated (you should see `(venv)` in prompt)
2. Reinstall dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Issue 4: Frontend won't start - "npm: command not found"
**Solution:**
- Install Node.js from https://nodejs.org/
- Restart your terminal after installation

### Issue 5: "CORS error" in browser console
**Solution:**
1. Ensure backend is running on port 5000
2. Check that `NEXT_PUBLIC_API_URL` in frontend `.env.local` is `http://localhost:5000`
3. Restart both servers

### Issue 6: Database errors or "sqlite3.OperationalError"
**Solution:**
1. Ensure `backend/instance` directory exists
2. If database is corrupted, delete `backend/instance/moodmusic.db` and restart backend (it will recreate automatically)

### Issue 7: TensorFlow/OpenCV installation fails
**Solution:**
- **Windows:** May need Visual C++ Redistributable (download from Microsoft)
- Try upgrading pip first: `pip install --upgrade pip`
- Then retry: `pip install -r requirements.txt` (from backend directory)
- If still failing, emotion detection will work in fallback mode (app will still function)

### Issue 8: Port already in use (Port 5000 or 3000)
**Solution:**
- **Backend:** Kill the process using port 5000, or change port in `app.py`
- **Frontend:** Kill the process using port 3000, or run: `npm run dev -- -p 3001`
- **Windows:** Use `netstat -ano | findstr :5000` to find process, then `taskkill /PID <pid> /F`
- **macOS/Linux:** Use `lsof -ti:5000 | xargs kill`

### Issue 9: Spotify linking doesn't work
**Solution:**
1. Verify `.env` file has correct Spotify credentials
2. Ensure redirect URI in Spotify dashboard matches exactly: `http://localhost:5000/spotify/callback`
3. Restart backend server after changing `.env` file
4. Check backend terminal for detailed error messages

### Issue 10: ".env file not found" or environment variables not loading
**Solution:**
- Ensure `.env` file is at **project root** (`MoodTune/.env`), NOT in backend folder
- Check file name is exactly `.env` (not `.env.txt` or `env`)
- Restart backend server after creating/modifying `.env` file

---

## 📁 File Structure Reference

Your project structure should look like this:

```
MoodTune/
├── .env                    ← CREATE HERE (project root) - REQUIRED
├── .gitignore
├── TEAM_SETUP_GUIDE.md     ← This file
├── backend/
│   ├── venv/               ← Created after Step 2.2
│   ├── instance/           ← Created in Step 2.6
│   │   └── moodmusic.db    ← Auto-created on first run
│   ├── app.py
│   ├── config.py
│   ├── models.py
│   ├── requirements.txt
│   └── utils/
├── frontend/
│   ├── .env.local          ← CREATE HERE (optional but recommended)
│   ├── node_modules/       ← Created after npm install
│   ├── package.json
│   ├── next.config.js
│   └── app/
└── __pycache__/            ← Auto-generated (ignore)
```

---

## 🔑 Important Notes for Consistency

### Environment Variables
- **`.env` file location:** **PROJECT ROOT** (`MoodTune/.env`) - **REQUIRED**
- **`.env.local` file location:** **frontend folder** (`MoodTune/frontend/.env.local`) - **OPTIONAL**
- Each team member must create their own `.env` file
- Do NOT commit these files to git (they're in `.gitignore`)
- Share Spotify credentials separately if using shared account

### Database
- Each developer will have their own local database (`backend/instance/moodmusic.db`)
- This file is gitignored, so each person starts fresh
- Database is automatically created on first backend run

### Dependencies
- Always use the exact versions specified in `requirements.txt` and `package.json`
- Don't update packages without team discussion
- If you add new dependencies, update the requirements files

### Ports
- **Backend:** `http://localhost:5000` (default)
- **Frontend:** `http://localhost:3000` (default)
- Don't change these unless necessary and coordinate with the team

### Virtual Environment
- Always activate the virtual environment before running backend
- Never install packages globally - always in the venv
- The `venv` folder is gitignored (each person creates their own)

---

## 🎯 Quick Start Commands Summary

Copy-paste these commands in order:

### Backend Setup (Terminal 1)
```bash
cd backend
python -m venv venv
venv\Scripts\activate                    # Windows
# OR: source venv/bin/activate           # macOS/Linux
pip install -r requirements.txt
cd ..
# Create .env file at project root with your credentials
cd backend
python app.py
```

### Frontend Setup (Terminal 2)
```bash
cd frontend
npm install
# Create .env.local file (optional)
npm run dev
```

---

## 📤 Sharing the Project

When sharing with new team members, make sure they have:

1. ✅ The complete project folder (all files and folders)
2. ✅ This setup guide (`TEAM_SETUP_GUIDE.md`)
3. ✅ Spotify Developer credentials (if using shared account) OR instructions to create their own
4. ✅ Python 3.10+ and Node.js 18+ installed

### Files that should NOT be shared (gitignored):
- `backend/.env` or `.env` at root (each person creates their own)
- `frontend/.env.local` (each person creates their own)
- `backend/instance/moodmusic.db` (database - auto-created)
- `node_modules/` (auto-installed via npm)
- `venv/` or `venv310/` (virtual environment - each person creates their own)
- `__pycache__/` (auto-generated Python cache)

---

## 🆘 Getting Help

If you encounter issues not covered here:

1. **Check Backend Terminal** - Look for error messages in the terminal where backend is running
2. **Check Browser Console** - Press F12 → Console tab for frontend errors
3. **Check Network Tab** - Press F12 → Network tab to see API request/response details
4. **Verify File Locations** - Ensure `.env` is at project root, not in backend folder
5. **Restart Servers** - Sometimes a simple restart fixes issues
6. **Check Prerequisites** - Verify Python and Node.js versions are correct

---

## ✨ Next Steps After Setup

Once everything is running:

1. ✅ Test user registration and login
2. ✅ Try the emotion detection feature (camera access required)
3. ✅ Link your Spotify account (if you have credentials)
4. ✅ Get personalized music recommendations!
5. ✅ Explore all the features of the application

---

## 📝 Summary Checklist

Before asking for help, make sure you've completed:

- [ ] Installed Python 3.10+ and Node.js 18+
- [ ] Created virtual environment in `backend/venv`
- [ ] Activated virtual environment
- [ ] Installed backend dependencies (`pip install -r requirements.txt` from backend directory)
- [ ] Created `.env` file at **project root** with all required variables
- [ ] Created `backend/instance` directory
- [ ] Installed frontend dependencies (`npm install`)
- [ ] Created `.env.local` in frontend folder (optional)
- [ ] Backend server running on port 5000
- [ ] Frontend server running on port 3000
- [ ] Can access `http://localhost:3000` in browser

---

**Happy Coding! 🎵🎶**

If you have any questions or run into issues, refer to the troubleshooting section above or reach out to the team lead.
