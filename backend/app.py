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
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return redirect(f"{frontend_url}/home?spotify_code={code}")


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
    playlists = Playlist.q
