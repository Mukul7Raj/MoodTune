import requests
import urllib.parse
import json
import base64
import numpy as np
import random
import datetime
import os
from io import BytesIO
from PIL import Image
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.exceptions import BadRequest, Unauthorized, Forbidden, NotFound, MethodNotAllowed, Conflict
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
from config import Config
from models import db, User, EmotionLog, VoiceCommandLog, GestureLog, Playlist, PlaylistSong, LikedSong, SongHistory
from utils.spotify import get_playlist_for_emotion, get_spotify_token

# Try to import FER for emotion detection (optional - will fallback if not available)
try:
    from fer import FER
    FER_AVAILABLE = True
except ImportError:
    FER_AVAILABLE = False
    print("⚠️ FER library not available. Emotion detection from images will be limited.")

fer_detector = None

app = Flask(__name__)
app.config.from_object(Config)
# CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"], supports_credentials=True)
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
CORS(app, origins=[frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"], supports_credentials=True)

db.init_app(app)
jwt = JWTManager(app)

# ======================================================
# 0️⃣  Health Check
# ======================================================
@app.route('/')
def home():
    return jsonify({"message": "Mood-Based Music API is live!"}), 200


# ======================================================
# 1️⃣  Authentication & User Management
# ======================================================
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password required"}), 400

    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "User already exists"}), 409

    hashed_pw = generate_password_hash(data["password"])
    new_user = User(email=data["email"], password=hashed_pw, consent_given=True)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"message": "User registered successfully"}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data.get("email")).first()
    if not user or not check_password_hash(user.password, data.get("password")):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token}), 200


@app.route('/api/me', methods=['GET'])
@jwt_required()
def get_me():
    """Return user profile info + Spotify connection status"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "username": user.username,
        "phone_number": user.phone_number,
        "bio": user.bio,
        "profile_picture_url": user.profile_picture_url,
        "spotifyLinked": bool(user.spotify_access_token),
        "spotifyUser": {
            "id": user.spotify_id,
            "name": user.spotify_display_name,
            "email": user.spotify_email
        } if user.spotify_access_token else None,
        "googleLinked": bool(user.google_id),
        "googleUser": {
            "id": user.google_id,
            "name": user.google_name,
            "email": user.google_email
        } if user.google_id else None
    }), 200


# ======================================================
# 2️⃣  Spotify Integration
# ======================================================
def ensure_valid_spotify_token(user):
    """Auto-refresh Spotify access token if expired"""
    test_resp = requests.get(
        "https://api.spotify.com/v1/me",
        headers={"Authorization": f"Bearer {user.spotify_access_token}"}
    )
    if test_resp.status_code == 401:
        token_url = "https://accounts.spotify.com/api/token"
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": user.spotify_refresh_token,
            "client_id": app.config["SPOTIFY_CLIENT_ID"],
            "client_secret": app.config["SPOTIFY_CLIENT_SECRET"]
        }
        response = requests.post(token_url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
        token_data = response.json()
        new_access_token = token_data.get("access_token")
        if new_access_token:
            user.spotify_access_token = new_access_token
            db.session.commit()
            print("🔄 Spotify access token refreshed successfully.")


@app.route('/api/spotify/login-url', methods=['GET'])
@jwt_required()
def get_spotify_login_url():
    """Get Spotify OAuth login URL - returns JSON with URL"""
    user_id = get_jwt_identity()
    auth_url = "https://accounts.spotify.com/authorize"
    params = {
        "client_id": app.config["SPOTIFY_CLIENT_ID"],
        "response_type": "code",
        "redirect_uri": app.config["SPOTIFY_REDIRECT_URI"],
        "scope": "user-read-email playlist-read-private user-read-playback-state user-modify-playback-state streaming",
        "show_dialog": "true",
        "state": str(user_id)  # Pass user_id in state for verification
    }
    query_string = urllib.parse.urlencode(params)
    spotify_url = f"{auth_url}?{query_string}"
    return jsonify({"url": spotify_url}), 200


@app.route('/spotify/login')
@jwt_required()
def spotify_login():
    """Initiate Spotify OAuth flow - redirects to Spotify (for direct browser access)"""
    user_id = get_jwt_identity()
    auth_url = "https://accounts.spotify.com/authorize"
    params = {
        "client_id": app.config["SPOTIFY_CLIENT_ID"],
        "response_type": "code",
        "redirect_uri": app.config["SPOTIFY_REDIRECT_URI"],
        "scope": "user-read-email playlist-read-private user-read-playback-state user-modify-playback-state streaming",
        "show_dialog": "true",
        "state": str(user_id)  # Pass user_id in state for verification
    }
    query_string = urllib.parse.urlencode(params)
    return redirect(f"{auth_url}?{query_string}")


@app.route('/api/google/login', methods=['GET'])
def google_login_initiate():
    """Initiate Google OAuth for login/signup (no JWT required)"""
    # Check if Google credentials are configured
    if not app.config.get("GOOGLE_CLIENT_ID") or not app.config.get("GOOGLE_CLIENT_SECRET") or not app.config.get("GOOGLE_REDIRECT_URI"):
        return jsonify({"error": "Google credentials not configured"}), 500
    
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
    redirect_uri = app.config["GOOGLE_REDIRECT_URI"]
    
    params = {
        "client_id": app.config["GOOGLE_CLIENT_ID"],
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": "login_signup"  # State to indicate login/signup flow
    }
    query_string = urllib.parse.urlencode(params)
    google_url = f"{auth_url}?{query_string}"
    return jsonify({"url": google_url}), 200


@app.route('/spotify/callback')
def spotify_callback():
    """Handle Spotify OAuth callback - redirects to frontend with code"""
    code = request.args.get("code")
    state = request.args.get("state")  # Contains user_id
    
    if not code:
        return jsonify({"error": "Missing code in callback"}), 400

    # Redirect to frontend home page with the code - frontend will handle the connection
    return redirect(f"http://localhost:3000/home?spotify_code={code}")


@app.route('/google/callback')
def google_callback():
    """Handle Google OAuth callback - auto-create account if needed or log in"""
    code = request.args.get("code")
    state = request.args.get("state")  # Contains "login_signup" or user_id
    error = request.args.get("error")
    
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    if error:
        return redirect(f"{frontend_url}/login?error={error}")
    
    if not code:
        return redirect(f"{frontend_url}/login?error=missing_code")

    # Check if this is a login/signup flow or linking flow
    if state == "login_signup":
        # This is a login/signup attempt - process it
        # Check if Google credentials are configured
        if not app.config.get("GOOGLE_CLIENT_ID") or not app.config.get("GOOGLE_CLIENT_SECRET"):
            return redirect(f"{frontend_url}/login?error=google_not_configured")

        # Exchange code for access token
        redirect_uri = app.config["GOOGLE_REDIRECT_URI"]
        token_url = "https://oauth2.googleapis.com/token"
        payload = {
            "client_id": app.config["GOOGLE_CLIENT_ID"],
            "client_secret": app.config["GOOGLE_CLIENT_SECRET"],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri
        }
        
        try:
            response = requests.post(token_url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
            
            if response.status_code != 200:
                try:
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("error_description", error_data.get("error", "Unknown error"))
                except:
                    error_msg = response.text or f"HTTP {response.status_code} error"
                print(f"❌ Google token exchange error: Status {response.status_code}, Response: {error_msg}")
                return redirect(f"{frontend_url}/login?error=failed_to_get_token")

            try:
                token_data = response.json()
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse Google token response as JSON: {e}")
                print(f"   Response text: {response.text}")
                return redirect(f"{frontend_url}/login?error=invalid_token_response")
            
            access_token = token_data.get("access_token")
            id_token = token_data.get("id_token")

            if not access_token:
                return redirect(f"{frontend_url}/login?error=no_access_token")

            # Fetch Google user profile using access token
            user_info_response = requests.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if user_info_response.status_code != 200:
                try:
                    error_data = user_info_response.json() if user_info_response.text else {}
                    error_msg = error_data.get("error", {}).get("message", "Unknown error") if isinstance(error_data, dict) else str(error_data)
                except:
                    error_msg = user_info_response.text or f"HTTP {user_info_response.status_code} error"
                print(f"❌ Google profile fetch error: Status {user_info_response.status_code}, Response: {error_msg}")
                return redirect(f"{frontend_url}/login?error=failed_to_fetch_profile")

            try:
                user_info = user_info_response.json()
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse Google user info response as JSON: {e}")
                print(f"   Response text: {user_info_response.text}")
                return redirect(f"{frontend_url}/login?error=invalid_profile_response")
            
            google_id = user_info.get("id")
            google_email = user_info.get("email")
            google_name = user_info.get("name", "")
            google_picture = user_info.get("picture")
            
            if not google_id:
                return redirect(f"{frontend_url}/login?error=no_google_id")
            
            if not google_email:
                return redirect(f"{frontend_url}/login?error=no_google_email")

            # Check if a user with this email exists
            user = User.query.filter_by(email=google_email).first()
            
            # Get refresh token if available
            refresh_token = token_data.get("refresh_token")
            
            if not user:
                # User doesn't exist - create a new account automatically
                # Split name into first and last name if available
                name_parts = google_name.split(" ", 1) if google_name else []
                first_name = name_parts[0] if name_parts else None
                
                try:
                    new_user = User(
                        email=google_email,
                        password=None,  # No password for Google-based accounts
                        first_name=first_name,
                        profile_picture_url=google_picture,
                        consent_given=True,
                        google_id=google_id,
                        google_email=google_email,
                        google_name=google_name,
                        google_access_token=access_token,
                        google_refresh_token=refresh_token
                    )
                    db.session.add(new_user)
                    db.session.commit()
                    user = new_user
                    print(f"✅ Created new MoodTune account for Google user: {google_email}")
                except Exception as db_error:
                    db.session.rollback()
                    print(f"❌ Database error creating user: {str(db_error)}")
                    # Check if it's a unique constraint violation (email already exists)
                    if "UNIQUE constraint" in str(db_error) or "unique" in str(db_error).lower():
                        # Try to find the user that might have been created concurrently
                        user = User.query.filter_by(email=google_email).first()
                        if user:
                            print(f"✅ Found existing user: {google_email}")
                            # Update Google credentials for existing user
                            user.google_id = google_id
                            user.google_email = google_email
                            user.google_name = google_name
                            user.google_access_token = access_token
                            if refresh_token:
                                user.google_refresh_token = refresh_token
                            db.session.commit()
                        else:
                            raise db_error
                    else:
                        raise db_error
            else:
                # User exists - update profile picture and Google credentials
                try:
                    if google_picture and not user.profile_picture_url:
                        user.profile_picture_url = google_picture
                    if google_name and not user.first_name:
                        name_parts = google_name.split(" ", 1)
                        user.first_name = name_parts[0] if name_parts else None
                    # Update Google credentials
                    user.google_id = google_id
                    user.google_email = google_email
                    user.google_name = google_name
                    user.google_access_token = access_token
                    if refresh_token:
                        user.google_refresh_token = refresh_token
                    db.session.commit()
                    print(f"✅ Logged in existing user with Google: {google_email}")
                except Exception as db_error:
                    db.session.rollback()
                    print(f"❌ Database error updating user: {str(db_error)}")
                    raise db_error

            # Create JWT token for the user
            token = create_access_token(identity=str(user.id))
            
            # Redirect to homepage with token so user lands on home (Spotify can be linked there)
            return redirect(f"{frontend_url}/home?google_token={token}")
        except Exception as e:
            print(f"❌ Error in Google login/signup callback: {str(e)}")
            import traceback
            traceback.print_exc()
            error_message = str(e)
            return redirect(f"{frontend_url}/login?error=server_error&details={urllib.parse.quote(error_message)}")
    else:
        # This is a linking flow (existing logged-in user linking Google)
        return redirect(f"{frontend_url}/home?google_code={code}")


@app.route('/spotify/callback/complete', methods=['POST'])
@jwt_required()
def spotify_callback_complete():
    """Complete Spotify OAuth connection - called from callback HTML page"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        code = data.get("code")
        
        if not code:
            return jsonify({"error": "Missing code"}), 400

        # Validate user exists
        user = User.query.get(int(user_id))
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Check if Spotify credentials are configured
        if not app.config.get("SPOTIFY_CLIENT_ID") or not app.config.get("SPOTIFY_CLIENT_SECRET"):
            return jsonify({"error": "Spotify credentials not configured"}), 500

        token_url = "https://accounts.spotify.com/api/token"
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": app.config["SPOTIFY_REDIRECT_URI"],
            "client_id": app.config["SPOTIFY_CLIENT_ID"],
            "client_secret": app.config["SPOTIFY_CLIENT_SECRET"]
        }
        
        response = requests.post(token_url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
        
        if response.status_code != 200:
            error_data = response.json() if response.text else {}
            print(f"Spotify token error: {response.status_code} - {error_data}")
            return jsonify({
                "error": "Failed to get access token from Spotify",
                "details": error_data
            }), 400

        token_data = response.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")

        if not access_token:
            return jsonify({
                "error": "Failed to get access token",
                "details": token_data
            }), 400

        # Fetch Spotify user profile
        user_info_response = requests.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if user_info_response.status_code != 200:
            error_data = user_info_response.json() if user_info_response.text else {}
            print(f"Spotify user info error: {user_info_response.status_code} - {error_data}")
            return jsonify({
                "error": "Failed to fetch Spotify user profile",
                "details": error_data
            }), 400

        user_info = user_info_response.json()

        # Update user with Spotify info
        try:
            user.spotify_id = user_info.get("id")
            user.spotify_display_name = user_info.get("display_name")
            user.spotify_email = user_info.get("email")
            user.spotify_access_token = access_token
            if refresh_token:
                user.spotify_refresh_token = refresh_token
            
            db.session.commit()
        except Exception as db_error:
            db.session.rollback()
            print(f"Database error: {str(db_error)}")
            # Check if it's a unique constraint violation
            if "UNIQUE constraint" in str(db_error) or "unique" in str(db_error).lower():
                return jsonify({
                    "error": "Spotify account is already linked to another user"
                }), 409
            return jsonify({
                "error": "Failed to save Spotify information",
                "details": str(db_error)
            }), 500

        return jsonify({
            "message": "Spotify account linked successfully",
            "spotify_user": {
                "id": user.spotify_id,
                "name": user.spotify_display_name,
                "email": user.spotify_email
            }
        }), 200

    except Exception as e:
        print(f"Unexpected error in spotify_callback_complete: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "Internal server error",
            "details": str(e)
        }), 500


@app.route('/spotify/refresh_token', methods=['POST'])
@jwt_required()
def refresh_spotify_token():
    """Refresh Spotify access token using stored refresh_token"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    refresh_token = getattr(user, "spotify_refresh_token", None)
    if not refresh_token:
        return jsonify({"error": "No refresh token found"}), 400

    token_url = "https://accounts.spotify.com/api/token"
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": app.config["SPOTIFY_CLIENT_ID"],
        "client_secret": app.config["SPOTIFY_CLIENT_SECRET"]
    }
    response = requests.post(token_url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
    token_data = response.json()

    new_access_token = token_data.get("access_token")
    if not new_access_token:
        return jsonify({"error": "Failed to refresh token"}), 400

    user.spotify_access_token = new_access_token
    db.session.commit()
    return jsonify({"message": "Spotify token refreshed successfully"}), 200


# ======================================================
# 3️⃣  Emotion Detection & Recommendations
# ======================================================
@app.route('/log_emotion', methods=['POST'])
@jwt_required()
def log_emotion_post():
    """Store detected emotion from emotion_detector.py"""
    user_id = get_jwt_identity()
    data = request.get_json()
    emotion = data.get("emotion")
    if not emotion:
        return jsonify({"error": "Emotion field required"}), 400

    db.session.add(EmotionLog(user_id=user_id, emotion=emotion))
    db.session.commit()

    return jsonify({"message": f"Logged emotion: {emotion}"}), 200


@app.route('/api/detect-emotion', methods=['POST'])
@jwt_required()
def detect_emotion_from_image():
    """Detect emotion from base64 encoded image"""
    if not FER_AVAILABLE:
        return jsonify({"error": "Emotion detection service not available. FER library not installed."}), 503
    
    try:
        data = request.get_json()
        image_data = data.get("image")
        
        if not image_data:
            return jsonify({"error": "Image data required"}), 400
        
        # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,...")
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        
        # Convert PIL Image to numpy array (RGB)
        image_array = np.array(image)
        
        # Convert RGB to BGR for OpenCV/FER
        if len(image_array.shape) == 3 and image_array.shape[2] == 3:
            image_bgr = image_array[:, :, ::-1]  # RGB to BGR
        else:
            image_bgr = image_array
        
        # Detect emotions
        global fer_detector
        if fer_detector is None and FER_AVAILABLE:
             try:
                 print("Initializing FER detector (lazy load)...")
                 fer_detector = FER(mtcnn=True)
             except Exception as e:
                 print(f"Error initializing FER: {e}")
        
        if fer_detector:
             emotions = fer_detector.detect_emotions(image_bgr)
        else:
             print("FER detector not available.")
             emotions = []
        
        if not emotions or len(emotions) == 0:
            return jsonify({
                "emotion": None,
                "confidence": 0,
                "message": "No face detected in the image"
            }), 200
        
        # Get the first face's top emotion
        face = emotions[0]
        emotion_scores = face.get("emotions", {})
        
        if not emotion_scores:
            return jsonify({
                "emotion": None,
                "confidence": 0,
                "message": "Could not detect emotions"
            }), 200
        
        # Find the emotion with highest score
        top_emotion = max(emotion_scores, key=emotion_scores.get)
        confidence = emotion_scores[top_emotion]
        
        return jsonify({
            "emotion": top_emotion,
            "confidence": round(confidence, 2),
            "all_emotions": emotion_scores
        }), 200
        
    except Exception as e:
        print(f"Error detecting emotion: {str(e)}")
        return jsonify({"error": f"Failed to detect emotion: {str(e)}"}), 500


@app.route('/api/recommendations', methods=['GET'])
@jwt_required()
def get_recommendations():
    """Emotion-based music recommendations (Spotify / JioSaavn + Well-being mode)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    emotion = request.args.get("emotion")
    language = request.args.get("language")
    wellbeing_mode = request.args.get("wellbeing", "false").lower() == "true"

    if not emotion:
        last_log = EmotionLog.query.filter_by(user_id=user_id).order_by(EmotionLog.timestamp.desc()).first()
        if not last_log:
            return jsonify({"error": "No emotion detected yet"}), 404
        emotion = last_log.emotion

    if not language:
        return jsonify({
            "message": "Please select a language to continue.",
            "available_languages": ["Hindi", "English", "Bengali", "Marathi", "Telugu", "Tamil", "Global"]
        }), 200

    # 🌿 Mental well-being mapping
    MENTAL_WELLBEING_MAP = {
        "sad": "motivational",
        "depressed": "healing",
        "angry": "calm",
        "stressed": "relaxing",
        "fear": "courage",
        "anxious": "soothing"
    }
    query_emotion = MENTAL_WELLBEING_MAP.get(emotion.lower(), emotion) if wellbeing_mode else emotion
    
    # For Global, search without language restriction
    if language == "Global":
        query = query_emotion
    else:
        query = f"{query_emotion} {language}"

    # ✅ Spotify path - only return Spotify data, no fallbacks when linked
    if user and user.spotify_access_token:
        ensure_valid_spotify_token(user)
        spotify_resp = requests.get(
            f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=15",
            headers={"Authorization": f"Bearer {user.spotify_access_token}"}
        )
        if spotify_resp.status_code == 200:
            tracks = spotify_resp.json().get("tracks", {}).get("items", [])
            results = []
            seen_track_ids = set()
            
            for t in tracks:
                track_id = t.get("id")
                # Skip duplicates
                if track_id in seen_track_ids:
                    continue
                seen_track_ids.add(track_id)
                
                album = t.get("album", {})
                images = album.get("images", [])
                # Get the medium-sized image (index 1) or largest (index 0) if available
                image_url = images[1].get("url") if len(images) > 1 else (images[0].get("url") if len(images) > 0 else None)
                
                results.append({
                    "id": track_id,
                    "title": t.get("name"),
                    "artist": ", ".join([a["name"] for a in t.get("artists", [])]),
                    "album": album.get("name"),
                    "spotifyUri": t.get("uri"),
                    "imageUrl": image_url,
                    "source": "Spotify",
                    "emotion": query_emotion,
                    "language": language,
                    "wellbeing_mode": wellbeing_mode
                })
            # Return only 15 items max
            return jsonify(results[:15]), 200
        # If Spotify request fails, return empty array (no fallback when Spotify is linked)
        return jsonify([]), 200

    # No fallback when Spotify is not linked - return empty array
    return jsonify([]), 200


@app.route('/api/search', methods=['GET'])
@jwt_required()
def search_music():
    """Unified music search (Spotify or JioSaavn fallback)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    query = request.args.get("q")
    search_type = request.args.get("type", "track")

    if not query:
        return jsonify({"error": "Missing search query"}), 400

    # Spotify path
    if user and user.spotify_access_token:
        ensure_valid_spotify_token(user)
        resp = requests.get(
            f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type={search_type}&limit=10",
            headers={"Authorization": f"Bearer {user.spotify_access_token}"}
        )
        if resp.status_code == 200:
            data = resp.json()
            results = []
            for t in data.get("tracks", {}).get("items", []):
                album = t.get("album", {})
                images = album.get("images", [])
                # Get the medium-sized image (index 1) or largest (index 0) if available
                image_url = images[1].get("url") if len(images) > 1 else (images[0].get("url") if len(images) > 0 else None)
                
                results.append({
                    "id": t.get("id"),
                    "title": t.get("name"),
                    "artist": ", ".join([a["name"] for a in t.get("artists", [])]),
                    "album": album.get("name"),
                    "spotifyUri": t.get("uri"),
                    "imageUrl": image_url,
                    "source": "Spotify"
                })
            return jsonify(results), 200

    # No fallback when Spotify is not linked - return empty array
    return jsonify([]), 200

# =========================================
# Liked / Unliked songs & history endpoints
# =========================================

@app.route('/api/songs/like', methods=['POST'])
@jwt_required()
def like_song():
    """
    Body JSON:
    {
      "source": "spotify" | "jiosaavn",
      "external_id": "spotify:track:abc" or "<jiosaavn-url-or-id>",
      "title": "...",
      "artist": "...",
      "album": "..."
    }
    """
    user_id = get_jwt_identity()
    data = request.get_json()
    source = data.get("source")
    external_id = data.get("external_id")
    title = data.get("title")
    artist = data.get("artist")
    album = data.get("album")

    if not source or not external_id or not title:
        return jsonify({"error": "source, external_id and title are required"}), 400

    # Check duplicate via unique constraint
    existing = LikedSong.query.filter_by(user_id=user_id, source=source, external_id=external_id).first()
    if existing:
        return jsonify({"message": "Song already liked"}), 200

    liked = LikedSong(
        user_id=user_id,
        source=source,
        external_id=external_id,
        title=title,
        artist=artist,
        album=album
    )
    db.session.add(liked)
    db.session.commit()
    return jsonify({"message": "Song liked successfully"}), 201

@app.route('/api/songs/like', methods=['DELETE'])
@jwt_required()
def unlike_song():
    """
    Body JSON:
    {
      "source": "spotify" | "jiosaavn",
      "external_id": "..."
    }
    """
    user_id = get_jwt_identity()
    data = request.get_json()
    source = data.get("source")
    external_id = data.get("external_id")
    if not source or not external_id:
        return jsonify({"error": "source and external_id are required"}), 400

    existing = LikedSong.query.filter_by(user_id=user_id, source=source, external_id=external_id).first()
    if not existing:
        return jsonify({"error": "Song not found in liked songs"}), 404

    db.session.delete(existing)
    db.session.commit()
    return jsonify({"message": "Song unliked successfully"}), 200

@app.route('/api/liked-songs', methods=['GET'])
@jwt_required()
def get_liked_songs():
    user_id = get_jwt_identity()
    liked = LikedSong.query.filter_by(user_id=user_id).all()
    results = [
        {
            "source": s.source,
            "external_id": s.external_id,
            "title": s.title,
            "artist": s.artist,
            "album": s.album
        } for s in liked
    ]
    return jsonify(results), 200

@app.route('/api/song-history', methods=['GET'])
@jwt_required()
def get_song_history():
    user_id = get_jwt_identity()
    history = SongHistory.query.filter_by(user_id=user_id).all()
    results = [
        {
            "source": h.source,
            "external_id": h.external_id,
            "title": h.title,
            "artist": h.artist,
            "album": h.album
        } for h in history
    ]
    return jsonify(results), 200


# ======================================================
# 4️⃣  Playlist Management
# ======================================================
@app.route('/api/playlists', methods=['GET'])
@jwt_required()
def get_all_playlists():
    user_id = get_jwt_identity()
    playlists = Playlist.query.filter_by(user_id=user_id).all()
    return jsonify([
        {"playlistId": p.id, "name": p.name, "description": p.description, "createdAt": p.created_at.isoformat()}
        for p in playlists
    ]), 200


@app.route('/api/public/trending-songs', methods=['GET'])
def get_public_trending_songs():
    """Get trending/popular songs without authentication - ALWAYS returns exactly 10 items"""
    language = request.args.get("language", "English")
    all_tracks = []
    seen_track_ids = set()
    
    # Get Spotify client credentials token
    spotify_token = get_spotify_token()
    
    # Strategy 1: Try multiple popular search queries (fastest and most reliable)
    if spotify_token:
        search_queries = []
        if language == "Global":
            search_queries = ["top hits", "popular songs", "trending", "chart hits", "viral"]
        elif language == "Hindi":
            search_queries = ["bollywood hits", "hindi top", "hindi popular", "bollywood chart", "hindi trending"]
        elif language == "English":
            search_queries = ["top songs", "pop hits", "popular music", "chart top", "trending songs"]
        else:
            search_queries = [f"{language} hits", f"{language} top", f"{language} popular"]
        
        for query in search_queries:
            if len(all_tracks) >= 10:
                break
            try:
                spotify_resp = requests.get(
                    f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=20",
                    headers={"Authorization": f"Bearer {spotify_token}"},
                    timeout=3
                )
                if spotify_resp.status_code == 200:
                    tracks = spotify_resp.json().get("tracks", {}).get("items", [])
                    for track in tracks:
                        if len(all_tracks) >= 10:
                            break
                        track_id = track.get("id")
                        if not track_id or track_id in seen_track_ids:
                            continue
                        seen_track_ids.add(track_id)
                        
                        album = track.get("album", {})
                        images = album.get("images", [])
                        image_url = images[1].get("url") if len(images) > 1 else (images[0].get("url") if images else "/images/song-1.png")
                        artists = track.get("artists", [])
                        artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                        
                        all_tracks.append({
                            "id": track_id,
                            "title": track.get("name"),
                            "subtitle": artist_name,
                            "imageUrl": image_url,
                            "album": album.get("name"),
                            "artist": artist_name,
                            "spotifyId": track_id,
                            "spotifyUri": track.get("uri"),
                            "spotifyUrl": f"https://open.spotify.com/track/{track_id}",
                            "source": "Spotify"
                        })
            except Exception as e:
                print(f"Error with search query '{query}': {e}")
                continue
    
    # Spotify-only: no JioSaavn or static defaults.
    return jsonify(all_tracks[:10]), 200


@app.route('/api/public/industry-songs', methods=['GET'])
def get_public_industry_songs():
    """Get industry/popular songs for Industry section - ALWAYS returns exactly 10 items, different from trending"""
    language = request.args.get("language", "English")
    # Get exclude IDs from query parameter (comma-separated list of trending song IDs)
    exclude_ids_param = request.args.get("exclude_ids", "")
    exclude_ids = set(exclude_ids_param.split(",")) if exclude_ids_param else set()
    
    all_tracks = []
    seen_track_ids = set(exclude_ids)  # Start with excluded IDs to avoid duplicates
    
    # Get Spotify client credentials token
    spotify_token = get_spotify_token()
    
    # Strategy 1: Use different search queries than trending songs (industry-focused)
    if spotify_token:
        search_queries = []
        if language == "Global":
            search_queries = ["chart hits", "viral songs", "trending now", "popular music", "top charts", "new releases", "latest hits"]
        elif language == "Hindi":
            search_queries = ["hindi chart", "bollywood chart", "indian hits", "hindi trending", "bollywood viral", "latest hindi", "new bollywood"]
        elif language == "English":
            search_queries = ["chart top", "viral hits", "trending music", "popular chart", "top music", "new releases", "latest songs"]
        else:
            search_queries = [f"{language} chart", f"{language} viral", f"{language} trending", f"latest {language}", f"new {language}"]
        
        for query in search_queries:
            if len(all_tracks) >= 10:
                break
            try:
                spotify_resp = requests.get(
                    f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=20",
                    headers={"Authorization": f"Bearer {spotify_token}"},
                    timeout=3
                )
                if spotify_resp.status_code == 200:
                    tracks = spotify_resp.json().get("tracks", {}).get("items", [])
                    for track in tracks:
                        if len(all_tracks) >= 10:
                            break
                        track_id = track.get("id")
                        if not track_id or track_id in seen_track_ids:
                            continue
                        seen_track_ids.add(track_id)
                        
                        album = track.get("album", {})
                        images = album.get("images", [])
                        image_url = images[1].get("url") if len(images) > 1 else (images[0].get("url") if images else "/images/song-1.png")
                        artists = track.get("artists", [])
                        artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                        
                        all_tracks.append({
                            "id": track_id,
                            "title": track.get("name"),
                            "subtitle": artist_name,
                            "imageUrl": image_url,
                            "album": album.get("name"),
                            "artist": artist_name,
                            "spotifyId": track_id,
                            "spotifyUri": track.get("uri"),
                            "spotifyUrl": f"https://open.spotify.com/track/{track_id}",
                            "source": "Spotify"
                        })
            except Exception as e:
                print(f"Error with industry search query '{query}': {e}")
                continue
    
    # Spotify-only: no JioSaavn or static defaults.
    return jsonify(all_tracks[:10]), 200


@app.route('/api/public/featured-playlists', methods=['GET'])
def get_public_featured_playlists():
    """Get featured playlists without authentication - ALWAYS returns exactly 2 items"""
    language = request.args.get("language", "English")
    playlists_data = []
    seen_playlist_ids = set()
    
    spotify_token = get_spotify_token()
    
    # Strategy 1: Get featured playlists directly (most reliable)
    if spotify_token:
        try:
            featured_resp = requests.get(
                "https://api.spotify.com/v1/browse/featured-playlists?limit=20",
                headers={"Authorization": f"Bearer {spotify_token}"},
                timeout=3
            )
            if featured_resp.status_code == 200:
                featured = featured_resp.json().get("playlists", {}).get("items", [])
                for playlist in featured:
                    if len(playlists_data) >= 2:
                        break
                    playlist_id = playlist.get("id")
                    if not playlist_id or playlist_id in seen_playlist_ids:
                        continue
                    seen_playlist_ids.add(playlist_id)
                    
                    images = playlist.get("images", [])
                    image_url = images[0].get("url") if images else "/images/playlist-1.png"
                    description = playlist.get("description", "")
                    if description:
                        description = description[:60]
                    else:
                        tracks_total = playlist.get("tracks", {}).get("total", 0)
                        description = f"{tracks_total} tracks"
                    
                    playlists_data.append({
                        "id": playlist_id,
                        "title": playlist.get("name"),
                        "subtitle": description,
                        "imageUrl": image_url,
                        "spotifyId": playlist_id,
                        "genre": "Featured"
                    })
        except Exception as e:
            print(f"Error fetching featured playlists: {e}")
    
    # Strategy 2: Search for popular playlists if featured didn't return enough
    if len(playlists_data) < 2 and spotify_token:
        popular_playlist_queries = {
            "Global": ["top hits", "global top", "popular playlist", "trending playlist"],
            "Hindi": ["bollywood top", "hindi top", "bollywood playlist", "hindi playlist"],
            "English": ["top hits", "usa top", "popular playlist", "trending playlist"]
        }
        
        queries = popular_playlist_queries.get(language, popular_playlist_queries["Global"])
        
        for query in queries:
            if len(playlists_data) >= 2:
                break
            try:
                search_resp = requests.get(
                    f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=playlist&limit=10",
                    headers={"Authorization": f"Bearer {spotify_token}"},
                    timeout=3
                )
                if search_resp.status_code == 200:
                    playlists = search_resp.json().get("playlists", {}).get("items", [])
                    for playlist in playlists:
                        if len(playlists_data) >= 2:
                            break
                        playlist_id = playlist.get("id")
                        if not playlist_id or playlist_id in seen_playlist_ids:
                            continue
                        seen_playlist_ids.add(playlist_id)
                        
                        images = playlist.get("images", [])
                        image_url = images[0].get("url") if images else "/images/playlist-1.png"
                        tracks_total = playlist.get("tracks", {}).get("total", 0)
                        description = f"{tracks_total} tracks"
                        
                        playlists_data.append({
                            "id": playlist_id,
                            "title": playlist.get("name"),
                            "subtitle": description,
                            "imageUrl": image_url,
                            "spotifyId": playlist_id,
                            "genre": "Popular"
                        })
            except Exception as e:
                print(f"Error searching for playlists with query '{query}': {e}")
                continue
    
    # Spotify-only: no static defaults.
    return jsonify(playlists_data[:2]), 200


@app.route('/api/public/artists', methods=['GET'])
def get_public_artists():
    """Get popular artists without authentication - ALWAYS returns exactly 10 items"""
    language = request.args.get("language", "English")
    artists_data = []
    seen_artist_ids = set()
    
    spotify_token = get_spotify_token()
    
    # Strategy 1: Try multiple search queries to get popular artists
    if spotify_token:
        search_queries = []
        if language == "Global":
            search_queries = ["top artist", "popular artist", "trending artist", "famous artist", "best artist"]
        elif language == "Hindi":
            search_queries = ["bollywood top artist", "hindi singer", "bollywood singer", "hindi artist", "indian singer"]
        elif language == "English":
            search_queries = ["top artist", "popular singer", "famous artist", "best singer", "trending artist"]
        else:
            search_queries = [f"{language} artist", f"{language} singer", f"{language} top artist"]
        
        for query in search_queries:
            if len(artists_data) >= 10:
                break
            try:
                search_resp = requests.get(
                    f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=artist&limit=20",
                    headers={"Authorization": f"Bearer {spotify_token}"},
                    timeout=3
                )
                if search_resp.status_code == 200:
                    artists = search_resp.json().get("artists", {}).get("items", [])
                    # Sort by followers to get most popular
                    artists_sorted = sorted(artists, key=lambda x: x.get('followers', {}).get('total', 0), reverse=True)
                    for artist in artists_sorted:
                        if len(artists_data) >= 10:
                            break
                        artist_id = artist.get("id")
                        if not artist_id or artist_id in seen_artist_ids:
                            continue
                        seen_artist_ids.add(artist_id)
                        
                        images = artist.get("images", [])
                        image_url = images[0].get("url") if images else f"/images/artist-{artist.get('name', '').lower().replace(' ', '-')}-circle.png"
                        artists_data.append({
                            "id": artist_id,
                            "title": artist.get("name"),
                            "subtitle": f"{artist.get('followers', {}).get('total', 0):,} followers",
                            "imageUrl": image_url,
                            "spotifyId": artist_id
                        })
            except Exception as e:
                print(f"Error with artist search query '{query}': {e}")
                continue
    
    # Spotify-only: no static defaults.
    return jsonify(artists_data[:10]), 200


@app.route('/api/featured-playlists', methods=['GET'])
@jwt_required()
def get_featured_playlists():
    """Get featured playlists based on various genres"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    # Get language preference from query param or user settings
    language = request.args.get("language")
    if not language and user:
        language = user.language or "English"
    
    playlists_data = []
    
    # Filter genres based on language preference
    if language == "Global":
        # Global: Mix of popular genres from around the world
        genres = [
            {"name": "Global Pop", "query": "pop hits"},
            {"name": "Global Rock", "query": "rock classics"},
            {"name": "Hip Hop", "query": "hip hop"},
            {"name": "Electronic", "query": "electronic dance"},
            {"name": "Bollywood", "query": "bollywood hits"},
            {"name": "K-Pop", "query": "k-pop"},
            {"name": "Latin", "query": "latin music"},
            {"name": "R&B", "query": "r&b soul"},
            {"name": "Reggae", "query": "reggae"},
            {"name": "Indie", "query": "indie music"},
            {"name": "Jazz", "query": "jazz"},
            {"name": "Classical", "query": "classical music"}
        ]
    elif language == "Hindi":
        genres = [
            {"name": "Bollywood", "query": "bollywood hits"},
            {"name": "Hindi Pop", "query": "hindi pop"},
            {"name": "Hindi Rock", "query": "hindi rock"},
            {"name": "Devotional", "query": "hindi devotional"},
            {"name": "Ghazal", "query": "hindi ghazal"},
            {"name": "Classical", "query": "hindi classical"}
        ]
    elif language == "Bengali":
        genres = [
            {"name": "Bengali", "query": "bengali music"},
            {"name": "Rabindra Sangeet", "query": "rabindra sangeet"},
            {"name": "Modern Bengali", "query": "modern bengali"}
        ]
    elif language == "Marathi":
        genres = [
            {"name": "Marathi", "query": "marathi music"},
            {"name": "Lavani", "query": "marathi lavani"},
            {"name": "Bhakti", "query": "marathi bhakti"}
        ]
    elif language == "Telugu":
        genres = [
            {"name": "Telugu", "query": "telugu music"},
            {"name": "Tollywood", "query": "tollywood hits"},
            {"name": "Carnatic", "query": "telugu carnatic"}
        ]
    elif language == "Tamil":
        genres = [
            {"name": "Tamil", "query": "tamil music"},
            {"name": "Kollywood", "query": "kollywood hits"},
            {"name": "Carnatic", "query": "tamil carnatic"}
        ]
    else:
        # Default genres for English
        genres = [
            {"name": "Pop", "query": "pop hits"},
            {"name": "Rock", "query": "rock classics"},
            {"name": "Hip Hop", "query": "hip hop"},
            {"name": "Electronic", "query": "electronic dance"},
            {"name": "Jazz", "query": "jazz"},
            {"name": "Classical", "query": "classical music"},
            {"name": "Country", "query": "country music"},
            {"name": "R&B", "query": "r&b soul"},
            {"name": "Reggae", "query": "reggae"},
            {"name": "Latin", "query": "latin music"},
            {"name": "Bollywood", "query": "bollywood hits"},
            {"name": "Indie", "query": "indie music"}
        ]
    
    # If user has Spotify, fetch genre-based playlists - only Spotify, no fallbacks
    if user and user.spotify_access_token:
        try:
            ensure_valid_spotify_token(user)
            
            # Fetch featured playlists from Spotify's browse API
            try:
                spotify_resp = requests.get(
                    "https://api.spotify.com/v1/browse/featured-playlists?limit=15",
                    headers={"Authorization": f"Bearer {user.spotify_access_token}"}
                )
                
                if spotify_resp.status_code == 200:
                    featured = spotify_resp.json().get("playlists", {}).get("items", [])
                    for playlist in featured:
                        if len(playlists_data) >= 15:
                            break
                        images = playlist.get("images", [])
                        image_url = images[0].get("url") if images else None
                        playlists_data.append({
                            "id": playlist.get("id"),
                            "title": playlist.get("name"),
                            "subtitle": playlist.get("description", "")[:50] if playlist.get("description") else f"{playlist.get('tracks', {}).get('total', 0)} tracks",
                            "imageUrl": image_url,
                            "spotifyId": playlist.get("id"),
                            "genre": "Featured"
                        })
                else:
                    print(f"Spotify featured playlists API returned status {spotify_resp.status_code}: {spotify_resp.text}")
            except Exception as e:
                print(f"Error fetching featured playlists: {e}")
                # Continue to genre search even if featured fails
            
            # Also search for genre-specific playlists if we need more
            if len(playlists_data) < 15:
                # Calculate how many we need
                needed = 15 - len(playlists_data)
                for genre in genres[:15]:  # Limit to 15 total
                    if len(playlists_data) >= 15:
                        break
                    try:
                        genre_resp = requests.get(
                            f"https://api.spotify.com/v1/search?q={urllib.parse.quote(genre['query'])}&type=playlist&limit=3",
                            headers={"Authorization": f"Bearer {user.spotify_access_token}"}
                        )
                        if genre_resp.status_code == 200:
                            playlists = genre_resp.json().get("playlists", {}).get("items", [])
                            if playlists:
                                # Add multiple playlists from this genre if we still need more
                                for playlist in playlists:
                                    if len(playlists_data) >= 15:
                                        break
                                    images = playlist.get("images", [])
                                    image_url = images[0].get("url") if images else None
                                    # Check if already added
                                    if not any(p.get("spotifyId") == playlist.get("id") for p in playlists_data):
                                        playlists_data.append({
                                            "id": playlist.get("id"),
                                            "title": playlist.get("name"),
                                            "subtitle": f"{genre['name']} • {playlist.get('tracks', {}).get('total', 0)} tracks",
                                            "imageUrl": image_url,
                                            "spotifyId": playlist.get("id"),
                                            "genre": genre["name"]
                                        })
                    except Exception as e:
                        print(f"Error fetching {genre['name']} playlists: {e}")
                        continue
            
            # Return playlists (even if empty, but at least we tried)
            return jsonify(playlists_data[:15]), 200
                    
        except Exception as e:
            print(f"Error fetching Spotify playlists: {e}")
            import traceback
            traceback.print_exc()
            # When Spotify is linked but fails, return empty array (no fallback)
            return jsonify([]), 200
    
    # Use client credentials token when Spotify is not linked (same as featured-playlists already does)
    spotify_token = get_spotify_token()
    if not spotify_token:
        return jsonify([]), 200
    
    try:
        # Try to get playlists using client credentials token
        # Fetch featured playlists from Spotify's browse API
        try:
            spotify_resp = requests.get(
                "https://api.spotify.com/v1/browse/featured-playlists?limit=15",
                headers={"Authorization": f"Bearer {spotify_token}"}
            )
            
            if spotify_resp.status_code == 200:
                featured = spotify_resp.json().get("playlists", {}).get("items", [])
                for playlist in featured:
                    if len(playlists_data) >= 15:
                        break
                    images = playlist.get("images", [])
                    image_url = images[0].get("url") if images else None
                    playlists_data.append({
                        "id": playlist.get("id"),
                        "title": playlist.get("name"),
                        "subtitle": playlist.get("description", "")[:50] if playlist.get("description") else f"{playlist.get('tracks', {}).get('total', 0)} tracks",
                        "imageUrl": image_url,
                        "spotifyId": playlist.get("id"),
                        "genre": "Featured"
                    })
            else:
                print(f"Spotify featured playlists API returned status {spotify_resp.status_code}: {spotify_resp.text}")
        except Exception as e:
            print(f"Error fetching featured playlists: {e}")
            # Continue to genre search even if featured fails
        
        # Also search for genre-specific playlists if we need more
        if len(playlists_data) < 15:
            for genre in genres[:15]:  # Limit to 15 total
                if len(playlists_data) >= 15:
                    break
                try:
                    genre_resp = requests.get(
                        f"https://api.spotify.com/v1/search?q={urllib.parse.quote(genre['query'])}&type=playlist&limit=3",
                        headers={"Authorization": f"Bearer {spotify_token}"}
                    )
                    if genre_resp.status_code == 200:
                        playlists = genre_resp.json().get("playlists", {}).get("items", [])
                        if playlists:
                            # Add multiple playlists from this genre if we still need more
                            for playlist in playlists:
                                if len(playlists_data) >= 15:
                                    break
                                images = playlist.get("images", [])
                                image_url = images[0].get("url") if images else None
                                # Check if already added
                                if not any(p.get("spotifyId") == playlist.get("id") for p in playlists_data):
                                    playlists_data.append({
                                        "id": playlist.get("id"),
                                        "title": playlist.get("name"),
                                        "subtitle": f"{genre['name']} • {playlist.get('tracks', {}).get('total', 0)} tracks",
                                        "imageUrl": image_url,
                                        "spotifyId": playlist.get("id"),
                                        "genre": genre["name"]
                                    })
                except Exception as e:
                    print(f"Error fetching {genre['name']} playlists: {e}")
                    continue
        
        # Return playlists (even if empty, but at least we tried)
        return jsonify(playlists_data[:15]), 200
    except Exception as e:
        print(f"Error fetching Spotify playlists with client credentials: {e}")
        return jsonify([]), 200


@app.route('/api/trending-songs', methods=['GET'])
@jwt_required()
def get_trending_songs():
    """Get trending/popular songs"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    # Get language preference from query param or user settings
    language = request.args.get("language")
    if not language and user:
        language = user.language or "English"
    
    songs_data = []
    
    # Try Spotify first - if linked, only use Spotify (no fallbacks)
    if user and user.spotify_access_token:
        try:
            ensure_valid_spotify_token(user)
            # Search for trending songs in the selected language
            if language == "Global":
                # For Global, get new releases (globally popular)
                spotify_resp = requests.get(
                    "https://api.spotify.com/v1/browse/new-releases?limit=15",
                    headers={"Authorization": f"Bearer {user.spotify_access_token}"}
                )
            elif language and language != "English":
                # Map language to search query
                lang_queries = {
                    "Hindi": "hindi bollywood",
                    "Bengali": "bengali",
                    "Marathi": "marathi",
                    "Telugu": "telugu",
                    "Tamil": "tamil"
                }
                search_query = lang_queries.get(language, language.lower())
                spotify_resp = requests.get(
                    f"https://api.spotify.com/v1/search?q={urllib.parse.quote(search_query)}&type=track&limit=15",
                    headers={"Authorization": f"Bearer {user.spotify_access_token}"}
                )
            else:
                # Get featured playlists or new releases for English/default
                spotify_resp = requests.get(
                    "https://api.spotify.com/v1/browse/new-releases?limit=15",
                    headers={"Authorization": f"Bearer {user.spotify_access_token}"}
                )
            if spotify_resp.status_code == 200:
                if language == "Global" or (language and language != "English"):
                    if language == "Global":
                        # For Global, use new releases (already fetched above)
                        albums = spotify_resp.json().get("albums", {}).get("items", [])
                        for album in albums:
                            images = album.get("images", [])
                            image_url = images[0].get("url") if images else None
                            artists = album.get("artists", [])
                            artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                            album_id = album.get("id")
                            
                            # Use album URL directly
                            spotify_uri = f"spotify:album:{album_id}"
                            spotify_url = f"https://open.spotify.com/album/{album_id}"
                            
                            songs_data.append({
                                "id": album_id,
                                "title": album.get("name"),
                                "subtitle": artist_name,
                                "imageUrl": image_url,
                                "album": album.get("name"),
                                "artist": artist_name,
                                "spotifyId": album_id,
                                "spotifyUri": spotify_uri,
                                "spotifyUrl": spotify_url
                            })
                    else:
                        # Handle track search results for specific languages
                        tracks = spotify_resp.json().get("tracks", {}).get("items", [])
                        seen_track_ids = set()
                        for track in tracks:
                            track_id = track.get("id")
                            if track_id in seen_track_ids:
                                continue
                            seen_track_ids.add(track_id)
                            
                            album = track.get("album", {})
                            images = album.get("images", [])
                            image_url = images[1].get("url") if len(images) > 1 else (images[0].get("url") if images else None)
                            artists = track.get("artists", [])
                            artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                            
                            songs_data.append({
                                "id": track_id,
                                "title": track.get("name"),
                                "subtitle": artist_name,
                                "imageUrl": image_url,
                                "album": album.get("name"),
                                "artist": artist_name,
                                "spotifyId": track_id,
                                "spotifyUri": track.get("uri"),
                                "spotifyUrl": f"https://open.spotify.com/track/{track_id}"
                            })
                else:
                    # Handle album results (new releases) for English
                    albums = spotify_resp.json().get("albums", {}).get("items", [])
                    for album in albums:
                        images = album.get("images", [])
                        image_url = images[0].get("url") if images else None
                        artists = album.get("artists", [])
                        artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                        album_id = album.get("id")
                        
                        # Use album URL directly (faster, and users can see all tracks in the album)
                        spotify_uri = f"spotify:album:{album_id}"
                        spotify_url = f"https://open.spotify.com/album/{album_id}"
                        
                        songs_data.append({
                            "id": album_id,
                            "title": album.get("name"),
                            "subtitle": artist_name,
                            "imageUrl": image_url,
                            "album": album.get("name"),
                            "artist": artist_name,
                            "spotifyId": album_id,
                            "spotifyUri": spotify_uri,
                            "spotifyUrl": spotify_url
                        })
            # Return only 15 items max when Spotify is linked (no fallbacks)
            return jsonify(songs_data[:15]), 200
        except Exception as e:
            print(f"Error fetching Spotify trending: {e}")
            import traceback
            traceback.print_exc()
            # When Spotify is linked but fails, return empty array (no fallback)
            return jsonify([]), 200
    
    # Use client credentials token when Spotify is not linked
    spotify_token = get_spotify_token()
    if not spotify_token:
        return jsonify([]), 200
    
    try:
        # Try to get trending songs using client credentials token
        # Search for trending songs in the selected language
        if language == "Global":
            # For Global, get new releases (globally popular)
            spotify_resp = requests.get(
                "https://api.spotify.com/v1/browse/new-releases?limit=15",
                headers={"Authorization": f"Bearer {spotify_token}"}
            )
        elif language and language != "English":
            # Map language to search query
            lang_queries = {
                "Hindi": "hindi bollywood",
                "Bengali": "bengali",
                "Marathi": "marathi",
                "Telugu": "telugu",
                "Tamil": "tamil"
            }
            search_query = lang_queries.get(language, language.lower())
            spotify_resp = requests.get(
                f"https://api.spotify.com/v1/search?q={urllib.parse.quote(search_query)}&type=track&limit=15",
                headers={"Authorization": f"Bearer {spotify_token}"}
            )
        else:
            # Get new releases for English/default
            spotify_resp = requests.get(
                "https://api.spotify.com/v1/browse/new-releases?limit=15",
                headers={"Authorization": f"Bearer {spotify_token}"}
            )
        if spotify_resp.status_code == 200:
            if language == "Global":
                # For Global, use new releases (already fetched above)
                albums = spotify_resp.json().get("albums", {}).get("items", [])
                for album in albums:
                    images = album.get("images", [])
                    image_url = images[0].get("url") if images else None
                    artists = album.get("artists", [])
                    artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                    album_id = album.get("id")
                    
                    # Use album URL directly
                    spotify_uri = f"spotify:album:{album_id}"
                    spotify_url = f"https://open.spotify.com/album/{album_id}"
                    
                    songs_data.append({
                        "id": album_id,
                        "title": album.get("name"),
                        "subtitle": artist_name,
                        "imageUrl": image_url,
                        "album": album.get("name"),
                        "artist": artist_name,
                        "spotifyId": album_id,
                        "spotifyUri": spotify_uri,
                        "spotifyUrl": spotify_url
                    })
            elif language and language != "English":
                # Handle track results for language-specific searches
                tracks = spotify_resp.json().get("tracks", {}).get("items", [])
                for track in tracks:
                    track_id = track.get("id")
                    album = track.get("album", {})
                    images = album.get("images", [])
                    image_url = images[0].get("url") if images else None
                    artists = track.get("artists", [])
                    artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                    
                    songs_data.append({
                        "id": track_id,
                        "title": track.get("name"),
                        "subtitle": artist_name,
                        "imageUrl": image_url,
                        "album": album.get("name"),
                        "artist": artist_name,
                        "spotifyId": track_id,
                        "spotifyUri": track.get("uri"),
                        "spotifyUrl": f"https://open.spotify.com/track/{track_id}"
                    })
            else:
                # Handle album results (new releases) for English
                albums = spotify_resp.json().get("albums", {}).get("items", [])
                for album in albums:
                    images = album.get("images", [])
                    image_url = images[0].get("url") if images else None
                    artists = album.get("artists", [])
                    artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                    album_id = album.get("id")
                    
                    # Use album URL directly
                    spotify_uri = f"spotify:album:{album_id}"
                    spotify_url = f"https://open.spotify.com/album/{album_id}"
                    
                    songs_data.append({
                        "id": album_id,
                        "title": album.get("name"),
                        "subtitle": artist_name,
                        "imageUrl": image_url,
                        "album": album.get("name"),
                        "artist": artist_name,
                        "spotifyId": album_id,
                        "spotifyUri": spotify_uri,
                        "spotifyUrl": spotify_url
                    })
        # Return only 15 items max
        return jsonify(songs_data[:15]), 200
    except Exception as e:
        print(f"Error fetching Spotify trending songs with client credentials: {e}")
        import traceback
        traceback.print_exc()
        return jsonify([]), 200


@app.route('/api/industry-songs', methods=['GET'])
@jwt_required()
def get_industry_songs():
    """Get industry/popular songs for Industry section - different from trending songs"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    # Get language preference from query param or user settings
    language = request.args.get("language")
    if not language and user:
        language = user.language or "English"
    
    # Get exclude IDs from query parameter (comma-separated list of trending song IDs)
    exclude_ids_param = request.args.get("exclude_ids", "")
    exclude_ids = set(exclude_ids_param.split(",")) if exclude_ids_param else set()
    
    songs_data = []
    seen_track_ids = set(exclude_ids)  # Start with excluded IDs to avoid duplicates
    
    # If user has Spotify, fetch industry songs from Spotify - only Spotify, no fallbacks
    if user and user.spotify_access_token:
        try:
            ensure_valid_spotify_token(user)
            
            # Use different search queries than trending songs (industry-focused)
            search_queries = []
            if language == "Global":
                search_queries = ["chart hits", "viral songs", "trending now", "popular music", "top charts", "new releases", "latest hits", "billboard top", "music charts"]
            elif language == "Hindi":
                search_queries = ["hindi chart", "bollywood chart", "indian hits", "hindi trending", "bollywood viral", "latest hindi", "new bollywood", "indian top songs"]
            elif language == "English":
                search_queries = ["chart top", "viral hits", "trending music", "popular chart", "top music", "new releases", "latest songs", "billboard hot", "top charts"]
            elif language == "Bengali":
                search_queries = ["bengali chart", "bengali viral", "bengali trending", "latest bengali", "new bengali"]
            elif language == "Marathi":
                search_queries = ["marathi chart", "marathi viral", "marathi trending", "latest marathi", "new marathi"]
            elif language == "Telugu":
                search_queries = ["telugu chart", "telugu viral", "telugu trending", "latest telugu", "new telugu"]
            elif language == "Tamil":
                search_queries = ["tamil chart", "tamil viral", "tamil trending", "latest tamil", "new tamil"]
            else:
                search_queries = [f"{language} chart", f"{language} viral", f"{language} trending", f"latest {language}", f"new {language}"]
            
            for query in search_queries:
                if len(songs_data) >= 15:
                    break
                try:
                    spotify_resp = requests.get(
                        f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=20",
                        headers={"Authorization": f"Bearer {user.spotify_access_token}"},
                        timeout=3
                    )
                    if spotify_resp.status_code == 200:
                        tracks = spotify_resp.json().get("tracks", {}).get("items", [])
                        for track in tracks:
                            if len(songs_data) >= 15:
                                break
                            track_id = track.get("id")
                            if not track_id or track_id in seen_track_ids:
                                continue
                            seen_track_ids.add(track_id)
                            
                            album = track.get("album", {})
                            images = album.get("images", [])
                            image_url = images[1].get("url") if len(images) > 1 else (images[0].get("url") if images else None)
                            artists = track.get("artists", [])
                            artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                            
                            songs_data.append({
                                "id": track_id,
                                "title": track.get("name"),
                                "subtitle": artist_name,
                                "imageUrl": image_url,
                                "album": album.get("name"),
                                "artist": artist_name,
                                "spotifyId": track_id,
                                "spotifyUri": track.get("uri"),
                                "spotifyUrl": f"https://open.spotify.com/track/{track_id}",
                                "source": "Spotify"
                            })
                except Exception as e:
                    print(f"Error with industry search query '{query}': {e}")
                    continue
            
            # Return only 15 items max when Spotify is linked (no fallbacks)
            return jsonify(songs_data[:15]), 200
        except Exception as e:
            print(f"Error fetching Spotify industry songs: {e}")
            import traceback
            traceback.print_exc()
            # When Spotify is linked but fails, return empty array (no fallback)
            return jsonify([]), 200
    
    # Fallback to public industry-songs API - only when Spotify NOT linked
    # Use public API which uses client credentials
    spotify_token = get_spotify_token()
    
    if spotify_token:
        search_queries = []
        if language == "Global":
            search_queries = ["chart hits", "viral songs", "trending now", "popular music", "top charts", "new releases", "latest hits"]
        elif language == "Hindi":
            search_queries = ["hindi chart", "bollywood chart", "indian hits", "hindi trending", "bollywood viral", "latest hindi", "new bollywood"]
        elif language == "English":
            search_queries = ["chart top", "viral hits", "trending music", "popular chart", "top music", "new releases", "latest songs"]
        else:
            search_queries = [f"{language} chart", f"{language} viral", f"{language} trending", f"latest {language}", f"new {language}"]
        
        for query in search_queries:
            if len(songs_data) >= 15:
                break
            try:
                spotify_resp = requests.get(
                    f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=20",
                    headers={"Authorization": f"Bearer {spotify_token}"},
                    timeout=3
                )
                if spotify_resp.status_code == 200:
                    tracks = spotify_resp.json().get("tracks", {}).get("items", [])
                    for track in tracks:
                        if len(songs_data) >= 15:
                            break
                        track_id = track.get("id")
                        if not track_id or track_id in seen_track_ids:
                            continue
                        seen_track_ids.add(track_id)
                        
                        album = track.get("album", {})
                        images = album.get("images", [])
                        image_url = images[1].get("url") if len(images) > 1 else (images[0].get("url") if images else "/images/song-1.png")
                        artists = track.get("artists", [])
                        artist_name = ", ".join([a.get("name") for a in artists]) if artists else "Unknown"
                        
                        songs_data.append({
                            "id": track_id,
                            "title": track.get("name"),
                            "subtitle": artist_name,
                            "imageUrl": image_url,
                            "album": album.get("name"),
                            "artist": artist_name,
                            "spotifyId": track_id,
                            "spotifyUri": track.get("uri"),
                            "spotifyUrl": f"https://open.spotify.com/track/{track_id}",
                            "source": "Spotify"
                        })
            except Exception as e:
                print(f"Error with industry search query '{query}': {e}")
                continue
    
    # Return only 15 items max
    return jsonify(songs_data[:15]), 200


@app.route('/api/artists', methods=['GET'])
@jwt_required()
def get_artists():
    """Get popular artists"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    # Get language preference from query param or user settings
    language = request.args.get("language")
    if not language and user:
        language = user.language or "English"
    
    # Log for debugging
    print(f"[Artists API] Language received: {language}, Query param: {request.args.get('language')}, User language: {user.language if user else 'N/A'}")
    
    artists_data = []
    seen_artist_ids = set()  # Track unique artist IDs
    seen_artist_names = set()  # Track unique artist names (case-insensitive)
    
    # Try Spotify first
    if user and user.spotify_access_token:
        try:
            ensure_valid_spotify_token(user)
            # Search for popular artists based on language
            if language == "Global":
                # Global: Mix of popular artists from different languages and regions
                popular_artists = [
                    "Ed Sheeran", "Taylor Swift", "The Weeknd", "Drake", "Adele",
                    "Billie Eilish", "Post Malone", "Dua Lipa", "Justin Bieber",
                    "Ariana Grande", "Bruno Mars", "Coldplay", "Imagine Dragons",
                    "Arijit Singh", "Shreya Ghoshal", "A.R. Rahman", "The Weeknd",
                    "BTS", "Bad Bunny", "J Balvin", "Shakira", "Eminem",
                    "Kanye West", "Kendrick Lamar", "Lana Del Rey", "Rihanna",
                    "Beyoncé", "The Beatles", "Queen", "Drake"
                ]
            elif language == "Hindi":
                popular_artists = [
                    "Arijit Singh", "Sonu Nigam", "Shreya Ghoshal", "Atif Aslam",
                    "Kumar Sanu", "Udit Narayan", "Alka Yagnik", "Kishore Kumar",
                    "Lata Mangeshkar", "Mohammed Rafi", "A.R. Rahman", "Vishal-Shekhar"
                ]
            elif language == "Bengali":
                popular_artists = [
                    "Anupam Roy", "Rupam Islam", "Nachiketa", "Srikanto Acharya",
                    "Lopamudra Mitra", "Shreya Ghoshal", "Arijit Singh"
                ]
            elif language == "Marathi":
                popular_artists = [
                    "Ajay-Atul", "Shankar Mahadevan", "Sonu Nigam", "Shreya Ghoshal"
                ]
            elif language == "Telugu":
                popular_artists = [
                    "S.P. Balasubrahmanyam", "K.S. Chithra", "Sid Sriram", "Anirudh Ravichander"
                ]
            elif language == "Tamil":
                popular_artists = [
                    "A.R. Rahman", "Ilaiyaraaja", "Anirudh Ravichander", "Yuvan Shankar Raja",
                    "Sid Sriram", "Shreya Ghoshal"
                ]
            else:
                # Default English/International artists
                popular_artists = [
                    "Ed Sheeran", "Taylor Swift", "The Weeknd", "Drake", "Adele",
                    "Billie Eilish", "Post Malone", "Dua Lipa", "Justin Bieber",
                    "Ariana Grande", "Bruno Mars", "Coldplay", "Imagine Dragons",
                    "Eminem", "Kanye West", "Kendrick Lamar", "Lana Del Rey",
                    "Rihanna", "Beyoncé", "The Beatles", "Queen"
                ]
            for artist_name in popular_artists:
                if len(artists_data) >= 15:
                    break
                try:
                    spotify_resp = requests.get(
                        f"https://api.spotify.com/v1/search?q={urllib.parse.quote(artist_name)}&type=artist&limit=1",
                        headers={"Authorization": f"Bearer {user.spotify_access_token}"}
                    )
                    if spotify_resp.status_code == 200:
                        artists = spotify_resp.json().get("artists", {}).get("items", [])
                        if artists:
                            artist = artists[0]
                            artist_id = artist.get("id")
                            artist_name_lower = artist.get("name", "").lower().strip()
                            
                            # Skip if we've already seen this artist (by ID or name)
                            if artist_id in seen_artist_ids or artist_name_lower in seen_artist_names:
                                continue
                            
                            seen_artist_ids.add(artist_id)
                            seen_artist_names.add(artist_name_lower)
                            
                            images = artist.get("images", [])
                            image_url = images[0].get("url") if images else None
                            artists_data.append({
                                "id": artist_id,
                                "title": artist.get("name"),
                                "subtitle": f"{artist.get('followers', {}).get('total', 0)} followers",
                                "imageUrl": image_url,
                                "spotifyId": artist_id
                            })
                except Exception as e:
                    print(f"Error fetching artist {artist_name}: {e}")
                    continue
            
            # Return only 15 items max when Spotify is linked (no fallbacks)
            return jsonify(artists_data[:15]), 200
        except Exception as e:
            print(f"Error fetching Spotify artists: {e}")
            # When Spotify is linked but fails, return empty array (no fallback)
            return jsonify([]), 200
    
    # Use client credentials token when Spotify is not linked
    spotify_token = get_spotify_token()
    if not spotify_token:
        return jsonify([]), 200
    
    try:
        # Try to get artists using client credentials token
        # Search for popular artists based on language
        if language == "Global":
            # Global: Mix of popular artists from different languages and regions
            popular_artists = [
                "Ed Sheeran", "Taylor Swift", "The Weeknd", "Drake", "Adele",
                "Billie Eilish", "Post Malone", "Dua Lipa", "Justin Bieber",
                "Ariana Grande", "Bruno Mars", "Coldplay", "Imagine Dragons",
                "Arijit Singh", "Shreya Ghoshal", "A.R. Rahman",
                "BTS", "Bad Bunny", "J Balvin", "Shakira", "Eminem",
                "Kanye West", "Kendrick Lamar", "Lana Del Rey", "Rihanna",
                "Beyoncé", "The Beatles", "Queen"
            ]
        elif language == "Hindi":
            popular_artists = [
                "Arijit Singh", "Sonu Nigam", "Shreya Ghoshal", "Atif Aslam",
                "Kumar Sanu", "Udit Narayan", "Alka Yagnik", "Kishore Kumar",
                "Lata Mangeshkar", "Mohammed Rafi", "A.R. Rahman", "Vishal-Shekhar"
            ]
        elif language == "Bengali":
            popular_artists = [
                "Anupam Roy", "Rupam Islam", "Nachiketa", "Srikanto Acharya",
                "Lopamudra Mitra", "Shreya Ghoshal", "Arijit Singh"
            ]
        elif language == "Marathi":
            popular_artists = [
                "Ajay-Atul", "Shankar Mahadevan", "Sonu Nigam", "Shreya Ghoshal"
            ]
        elif language == "Telugu":
            popular_artists = [
                "S.P. Balasubrahmanyam", "K.S. Chithra", "Sid Sriram", "Anirudh Ravichander"
            ]
        elif language == "Tamil":
            popular_artists = [
                "A.R. Rahman", "Ilaiyaraaja", "Anirudh Ravichander", "Yuvan Shankar Raja",
                "Sid Sriram", "Shreya Ghoshal"
            ]
        else:
            # Default English/International artists
            popular_artists = [
                "Ed Sheeran", "Taylor Swift", "The Weeknd", "Drake", "Adele",
                "Billie Eilish", "Post Malone", "Dua Lipa", "Justin Bieber",
                "Ariana Grande", "Bruno Mars", "Coldplay", "Imagine Dragons",
                "Eminem", "Kanye West", "Kendrick Lamar", "Lana Del Rey",
                "Rihanna", "Beyoncé", "The Beatles", "Queen"
            ]
        for artist_name in popular_artists:
            if len(artists_data) >= 15:
                break
            try:
                spotify_resp = requests.get(
                    f"https://api.spotify.com/v1/search?q={urllib.parse.quote(artist_name)}&type=artist&limit=1",
                    headers={"Authorization": f"Bearer {spotify_token}"}
                )
                if spotify_resp.status_code == 200:
                    artists = spotify_resp.json().get("artists", {}).get("items", [])
                    if artists:
                        artist = artists[0]
                        artist_id = artist.get("id")
                        artist_name_lower = artist.get("name", "").lower().strip()
                        
                        # Skip if we've already seen this artist (by ID or name)
                        if artist_id in seen_artist_ids or artist_name_lower in seen_artist_names:
                            continue
                        
                        seen_artist_ids.add(artist_id)
                        seen_artist_names.add(artist_name_lower)
                        
                        images = artist.get("images", [])
                        image_url = images[0].get("url") if images else None
                        artists_data.append({
                            "id": artist_id,
                            "title": artist.get("name"),
                            "subtitle": f"{artist.get('followers', {}).get('total', 0)} followers",
                            "imageUrl": image_url,
                            "spotifyId": artist_id
                        })
            except Exception as e:
                print(f"Error fetching artist {artist_name}: {e}")
                continue
        
        # Return only 15 items max
        return jsonify(artists_data[:15]), 200
    except Exception as e:
        print(f"Error fetching Spotify artists with client credentials: {e}")
        import traceback
        traceback.print_exc()
        return jsonify([]), 200


@app.route('/api/playlists', methods=['POST'])
@jwt_required()
def create_playlist():
    user_id = get_jwt_identity()
    data = request.get_json()
    name = data.get("name")
    if not name:
        return jsonify({"error": "Missing playlist name"}), 400

    playlist = Playlist(user_id=user_id, name=name, description=data.get("description", ""))
    db.session.add(playlist)
    db.session.commit()
    return jsonify({"message": "Playlist created", "playlistId": playlist.id}), 201


# ======================================================
# 5️⃣  Gestures & Voice Commands
# ======================================================
@app.route('/api/gestures/map', methods=['POST'])
@jwt_required()
def map_gesture_to_action():
    user_id = get_jwt_identity()
    data = request.get_json()
    gesture, action = data.get("gestureName"), data.get("action")
    if not gesture or not action:
        return jsonify({"error": "Invalid gesture name or action"}), 400
    db.session.add(GestureLog(user_id=user_id, gesture=f"{gesture}:{action}"))
    db.session.commit()
    return jsonify({"message": "Gesture mapped successfully"}), 200


@app.route('/api/voice/command', methods=['POST'])
@jwt_required()
def process_voice_command():
    user_id = get_jwt_identity()
    data = request.get_json()
    command = data.get("commandPhrase")
    if not command:
        return jsonify({"error": "Missing command phrase"}), 400

    phrase_to_action = {
        "play next song": "next_song",
        "play previous song": "previous_song",
        "pause song": "pause",
        "play song": "play"
    }
    action = phrase_to_action.get(command.lower())
    if not action:
        return jsonify({"error": "Unrecognized command"}), 400

    db.session.add(VoiceCommandLog(user_id=user_id, command=command))
    db.session.commit()
    return jsonify({"message": "Voice command processed", "actionExecuted": action}), 200


# ======================================================
# 6️⃣  User Settings & Preferences
# ======================================================

@app.route('/api/settings/preferences', methods=['GET'])
@jwt_required()
def get_preferences():
    """Get user preferences"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({
        "theme": user.theme or "light",
        "language": user.language or "English",
        "camera_access_enabled": user.camera_access_enabled if user.camera_access_enabled is not None else True,
        "notifications_enabled": user.notifications_enabled if user.notifications_enabled is not None else True,
        "add_to_home_enabled": user.add_to_home_enabled if user.add_to_home_enabled is not None else False
    }), 200


@app.route('/api/settings/preferences', methods=['PUT'])
@jwt_required()
def update_preferences():
    """Update user preferences"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    data = request.get_json()
    
    if 'theme' in data:
        if data['theme'] in ['light', 'dark']:
            user.theme = data['theme']
        else:
            return jsonify({"error": "Invalid theme. Must be 'light' or 'dark'"}), 400
    
    if 'language' in data:
        user.language = data['language']
    
    if 'camera_access_enabled' in data:
        user.camera_access_enabled = bool(data['camera_access_enabled'])
    
    if 'notifications_enabled' in data:
        user.notifications_enabled = bool(data['notifications_enabled'])
    
    if 'add_to_home_enabled' in data:
        user.add_to_home_enabled = bool(data['add_to_home_enabled'])
    
    try:
        db.session.commit()
        return jsonify({"message": "Preferences updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to update preferences", "details": str(e)}), 500


@app.route('/api/settings/password', methods=['PUT'])
@jwt_required()
def change_password():
    """Change user password"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    data = request.get_json()
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    
    if not current_password or not new_password:
        return jsonify({"error": "Current password and new password required"}), 400
    
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400
    
    # Verify current password
    if not check_password_hash(user.password, current_password):
        return jsonify({"error": "Current password is incorrect"}), 401
    
    # Update password
    user.password = generate_password_hash(new_password)
    
    try:
        db.session.commit()
        return jsonify({"message": "Password changed successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to change password", "details": str(e)}), 500


@app.route('/api/settings/history/clear', methods=['DELETE'])
@jwt_required()
def clear_listening_history():
    """Clear user's listening history"""
    user_id = get_jwt_identity()
    
    try:
        # Delete all song history for the user
        SongHistory.query.filter_by(user_id=user_id).delete()
        db.session.commit()
        return jsonify({"message": "Listening history cleared successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to clear history", "details": str(e)}), 500


@app.route('/api/settings/account/delete', methods=['DELETE'])
@jwt_required()
def delete_account():
    """Delete user account and all associated data"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    try:
        # Delete all associated data
        EmotionLog.query.filter_by(user_id=user_id).delete()
        VoiceCommandLog.query.filter_by(user_id=user_id).delete()
        GestureLog.query.filter_by(user_id=user_id).delete()
        LikedSong.query.filter_by(user_id=user_id).delete()
        SongHistory.query.filter_by(user_id=user_id).delete()
        
        # Delete user playlists and their songs
        playlists = Playlist.query.filter_by(user_id=user_id).all()
        for playlist in playlists:
            PlaylistSong.query.filter_by(playlist_id=playlist.id).delete()
        Playlist.query.filter_by(user_id=user_id).delete()
        
        # Finally, delete the user
        db.session.delete(user)
        db.session.commit()
        
        return jsonify({"message": "Account deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to delete account", "details": str(e)}), 500


@app.route('/api/settings/spotify/unlink', methods=['DELETE'])
@jwt_required()
def unlink_spotify():
    """Unlink Spotify account from user"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    try:
        # Clear Spotify-related fields
        user.spotify_id = None
        user.spotify_display_name = None
        user.spotify_email = None
        user.spotify_access_token = None
        user.spotify_refresh_token = None
        
        db.session.commit()
        return jsonify({"message": "Spotify account unlinked successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to unlink Spotify account", "details": str(e)}), 500


@app.route('/api/settings/google/unlink', methods=['DELETE'])
@jwt_required()
def unlink_google():
    """Unlink Google account from user"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    try:
        # Clear Google-related fields
        user.google_id = None
        user.google_email = None
        user.google_name = None
        user.google_access_token = None
        user.google_refresh_token = None
        
        db.session.commit()
        return jsonify({"message": "Google account unlinked successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to unlink Google account", "details": str(e)}), 500


@app.route('/api/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """Get user profile information"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "username": user.username,
        "phone_number": user.phone_number,
        "bio": user.bio,
        "profile_picture_url": user.profile_picture_url,
        "spotifyLinked": bool(user.spotify_access_token),
        "spotifyUser": {
            "id": user.spotify_id,
            "name": user.spotify_display_name,
            "email": user.spotify_email
        } if user.spotify_access_token else None,
        "googleLinked": bool(user.google_id),
        "googleUser": {
            "id": user.google_id,
            "name": user.google_name,
            "email": user.google_email
        } if user.google_id else None
    }), 200


@app.route('/api/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """Update user profile information"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    data = request.get_json()
    
    if 'first_name' in data:
        user.first_name = data['first_name']
    
    if 'username' in data:
        # Skip check if username hasn't changed
        if user.username != data['username']:
            # Check if username is already taken by another user
            existing_user = User.query.filter_by(username=data['username']).first()
            if existing_user and existing_user.id != int(user_id):
                return jsonify({"error": "Username already taken"}), 409
        user.username = data['username']
    
    if 'phone_number' in data:
        user.phone_number = data['phone_number']
    
    if 'bio' in data:
        user.bio = data['bio']
    
    try:
        db.session.commit()
        return jsonify({"message": "Profile updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to update profile", "details": str(e)}), 500


@app.route('/api/profile/picture', methods=['POST'])
@jwt_required()
def upload_profile_picture():
    """Upload profile picture (base64 encoded)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    data = request.get_json()
    image_data = data.get("image")
    
    if not image_data:
        return jsonify({"error": "Image data required"}), 400
    
    # Store the base64 image data URL directly
    # In production, you might want to upload to S3 or similar and store the URL
    user.profile_picture_url = image_data
    
    try:
        db.session.commit()
        return jsonify({
            "message": "Profile picture uploaded successfully",
            "profile_picture_url": user.profile_picture_url
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to upload profile picture", "details": str(e)}), 500


# ======================================================
# 6️⃣  Global Error Handlers
# ======================================================
@app.errorhandler(Exception)
def handle_500(e):
    return jsonify({"error": "Internal Server Error", "message": str(e)}), 500


# ======================================================
# 7️⃣  Init DB
# ======================================================
with app.app_context():
    db.create_all()
    print("✅ Database initialized successfully!")

if __name__ == '__main__':
    print(f"------------ CONFIG DEBUG ------------")
    print(f"Loaded SPOTIFY_CLIENT_ID: {app.config['SPOTIFY_CLIENT_ID']}")
    print(f"Loaded SPOTIFY_REDIRECT_URI: '{app.config['SPOTIFY_REDIRECT_URI']}'")
    print(f"--------------------------------------")
    app.run(debug=True)
