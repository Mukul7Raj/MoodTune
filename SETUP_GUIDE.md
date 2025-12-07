# MoodTune - Setup Guide

This guide will help you set up and run the MoodTune application with integrated backend and frontend.

## Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- npm or yarn
- Spotify Developer Account (for Spotify integration)

## Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create a virtual environment (if not already created):**
   ```bash
   python -m venv venv
   ```

3. **Activate the virtual environment:**
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - macOS/Linux:
     ```bash
     source venv/bin/activate
     ```

4. **Install dependencies:**
   ```bash
   pip install -r ../requirements.txt
   ```

5. **Create a `.env` file in the backend directory:**
   ```env
   DATABASE_URL=sqlite:///moodmusic.db
   SECRET_KEY=your-secret-key-here
   JWT_SECRET_KEY=your-jwt-secret-key-here
   SPOTIFY_CLIENT_ID=your-spotify-client-id
   SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
   SPOTIFY_REDIRECT_URI=http://localhost:5000/spotify/callback
   ```

6. **Get Spotify Credentials:**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app
   - Copy the Client ID and Client Secret
   - Add `http://localhost:5000/spotify/callback` to the Redirect URIs

7. **Run the backend server:**
   ```bash
   python app.py
   ```
   The backend will run on `http://localhost:5000`

## Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create a `.env.local` file in the frontend directory:**
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   The frontend will run on `http://localhost:3000`

## Running the Application

1. **Start the backend server first** (in one terminal):
   ```bash
   cd backend
   python app.py
   ```

2. **Start the frontend server** (in another terminal):
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open your browser and navigate to:**
   ```
   http://localhost:3000
   ```

## Features Integrated

✅ **Authentication:**
- User registration and login
- JWT token-based authentication
- Protected routes

✅ **Emotion Detection:**
- Camera-based emotion detection
- Integration with FER (Facial Emotion Recognition)
- Real-time emotion logging

✅ **Music Recommendations:**
- Emotion-based music recommendations
- Language selection
- Spotify and JioSaavn integration

✅ **Search Functionality:**
- Music search across platforms
- Real-time search results

✅ **Spotify Integration:**
- OAuth-based Spotify account linking
- Access to Spotify playlists and tracks

✅ **User Profile:**
- User information management
- Spotify connection status

## API Endpoints

The backend provides the following main endpoints:

- `POST /register` - User registration
- `POST /login` - User login
- `GET /api/me` - Get current user info
- `POST /api/detect-emotion` - Detect emotion from image
- `GET /api/recommendations` - Get music recommendations
- `GET /api/search` - Search for music
- `GET /api/spotify/login-url` - Get Spotify OAuth URL
- `POST /spotify/callback/complete` - Complete Spotify OAuth
- `GET /api/playlists` - Get user playlists
- `POST /api/playlists` - Create playlist
- `GET /api/liked-songs` - Get liked songs
- `POST /api/songs/like` - Like a song
- `DELETE /api/songs/like` - Unlike a song

## Troubleshooting

### Backend Issues

1. **Database errors:**
   - Make sure the `instance` directory exists in the backend folder
   - The database will be created automatically on first run

2. **FER library issues:**
   - If emotion detection doesn't work, the app will fall back gracefully
   - Make sure TensorFlow and OpenCV are properly installed

3. **CORS errors:**
   - Ensure the frontend URL is added to CORS origins in `app.py`
   - Default: `http://localhost:3000` and `http://127.0.0.1:3000`

4. **Spotify Linking Internal Server Error:**
   
   This is usually caused by one of the following:
   
   a. **Missing Spotify Credentials:**
      - Check that your `.env` file in the `backend` directory has all required Spotify variables:
        ```
        SPOTIFY_CLIENT_ID=your-client-id
        SPOTIFY_CLIENT_SECRET=your-client-secret
        SPOTIFY_REDIRECT_URI=http://localhost:5000/spotify/callback
        ```
      - Restart the backend server after adding/updating `.env` file
   
   b. **Redirect URI Mismatch:**
      - The `SPOTIFY_REDIRECT_URI` in your `.env` must EXACTLY match the redirect URI in your Spotify app settings
      - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
      - Click on your app → Edit Settings
      - Under "Redirect URIs", add: `http://localhost:5000/spotify/callback`
      - Make sure there are no trailing slashes or extra characters
   
   c. **Backend Server Not Running:**
      - Ensure the backend is running on `http://localhost:5000`
      - Check backend terminal for error messages
      - Look for any Python exceptions or import errors
   
   d. **Database Issues:**
      - If you see "User not found" errors, try creating a new account
      - Check that the database file exists in `backend/instance/moodmusic.db`
   
   e. **Check Backend Logs:**
      - Look at the backend terminal output when clicking "Link Now"
      - The improved error handling will show detailed error messages
      - Common errors:
        - "Spotify credentials not configured" → Missing .env variables
        - "Failed to get access token" → Check redirect URI or credentials
        - "User not found" → Authentication issue, try logging out and back in
   
   f. **Network/Firewall Issues:**
      - Ensure your firewall isn't blocking connections to `localhost:5000`
      - Try accessing `http://localhost:5000/` directly in your browser
      - Should see: `{"message": "Mood-Based Music API is live!"}`

### Frontend Issues

1. **API connection errors:**
   - Verify the backend is running on `http://localhost:5000`
   - Check the `NEXT_PUBLIC_API_URL` in `.env.local`

2. **Authentication issues:**
   - Clear browser localStorage if tokens are corrupted
   - Check browser console for detailed error messages

3. **Camera access:**
   - Ensure you grant camera permissions when prompted
   - Use HTTPS in production for camera access

## Development Notes

- The frontend uses Next.js 14 with TypeScript
- The backend uses Flask with SQLAlchemy for the database
- JWT tokens are stored in localStorage (consider httpOnly cookies for production)
- Emotion detection requires the FER library and TensorFlow

## Next Steps

1. Set up your Spotify Developer account and add credentials
2. Test the registration and login flow
3. Try the emotion detection feature
4. Link your Spotify account
5. Get personalized music recommendations!

## Support

If you encounter any issues, check:
- Backend logs in the terminal
- Browser console for frontend errors
- Network tab for API request/response details

