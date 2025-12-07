import requests
import urllib.parse
import json
import base64
import numpy as np
from io import BytesIO
from PIL import Image
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.exceptions import BadRequest, Unauthorized, Forbidden, NotFound, MethodNotAllowed, Conflict
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
from config import Config
from models import db, User, EmotionLog, VoiceCommandLog, GestureLog, Playlist, PlaylistSong, LikedSong, SongHistory
from utils.spotify import get_playlist_for_emotion

# Try to import FER for emotion detection (optional - will fallback if not available)
try:
    from fer import FER
    fer_detector = FER(mtcnn=True)
    FER_AVAILABLE = True
except ImportError:
    FER_AVAILABLE = False
    print("⚠️ FER library not available. Emotion detection from images will be limited.")

app = Flask(__name__)
app.config.from_object(Config)
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"], supports_credentials=True)
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
        "spotifyLinked": bool(user.spotify_access_token),
        "spotifyUser": {
            "id": user.spotify_id,
            "name": user.spotify_display_name,
            "email": user.spotify_email
        } if user.spotify_access_token else None
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


@app.route('/spotify/callback')
def spotify_callback():
    """Handle Spotify OAuth callback - redirects to frontend with code"""
    code = request.args.get("code")
    state = request.args.get("state")  # Contains user_id
    
    if not code:
        return jsonify({"error": "Missing code in callback"}), 400

    # Redirect to frontend home page with the code - frontend will handle the connection
    return redirect(f"http://localhost:3000/home?spotify_code={code}")


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
        emotions = fer_detector.detect_emotions(image_bgr)
        
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
            "available_languages": ["Hindi", "English", "Bengali", "Marathi", "Telugu", "Tamil"]
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
    query = f"{query_emotion} {language}"

    # ✅ Spotify path
    if user and user.spotify_access_token:
        ensure_valid_spotify_token(user)
        spotify_resp = requests.get(
            f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=10",
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
            return jsonify(results), 200

    # 🧠 JioSaavn fallback
    saavn_resp = requests.get(f"https://saavn.dev/api/search/songs?query={urllib.parse.quote(query)}&limit=10")
    if saavn_resp.status_code != 200:
        return jsonify({"error": "Failed to fetch recommendations"}), 502

    saavn_data = saavn_resp.json().get("data", [])
    results = []
    seen_song_ids = set()
    
    for s in saavn_data:
        song_id = s.get("id")
        # Skip duplicates
        if song_id in seen_song_ids:
            continue
        seen_song_ids.add(song_id)
        
        # Get image from JioSaavn response
        images = s.get("image", [])
        image_url = None
        if images:
            # Get the highest quality image (usually the last one or largest)
            if isinstance(images, list) and len(images) > 0:
                image_url = images[-1].get("link") if isinstance(images[-1], dict) else images[-1]
            elif isinstance(images, dict):
                image_url = images.get("link")
        
        results.append({
            "id": song_id,
            "title": s.get("name"),
            "artist": ", ".join(a["name"] for a in s.get("artists", [])),
            "album": s.get("album", {}).get("name"),
            "url": s.get("url"),
            "imageUrl": image_url,
            "language": language,
            "emotion": query_emotion,
            "source": "JioSaavn",
            "wellbeing_mode": wellbeing_mode
        })
    return jsonify(results), 200


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

    # JioSaavn fallback
    resp = requests.get(f"https://saavn.dev/api/search/songs?query={urllib.parse.quote(query)}&limit=10")
    data = resp.json().get("data", [])
    results = []
    for s in data:
        # Get image from JioSaavn response
        images = s.get("image", [])
        image_url = None
        if images:
            # Get the highest quality image (usually the last one or largest)
            if isinstance(images, list) and len(images) > 0:
                image_url = images[-1].get("link") if isinstance(images[-1], dict) else images[-1]
            elif isinstance(images, dict):
                image_url = images.get("link")
        
        results.append({
            "id": s.get("id"),
            "title": s.get("name"),
            "artist": ", ".join(a["name"] for a in s.get("artists", [])),
            "album": s.get("album", {}).get("name"),
            "url": s.get("url"),
            "imageUrl": image_url,
            "source": "JioSaavn"
        })
    return jsonify(results), 200

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


@app.route('/api/featured-playlists', methods=['GET'])
@jwt_required()
def get_featured_playlists():
    """Get featured playlists based on various genres"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    playlists_data = []
    
    # Define genres to fetch playlists for
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
    
    # If user has Spotify, fetch genre-based playlists
    if user and user.spotify_access_token:
        try:
            ensure_valid_spotify_token(user)
            
            # Fetch featured playlists from Spotify's browse API
            spotify_resp = requests.get(
                "https://api.spotify.com/v1/browse/featured-playlists?limit=50",
                headers={"Authorization": f"Bearer {user.spotify_access_token}"}
            )
            
            if spotify_resp.status_code == 200:
                featured = spotify_resp.json().get("playlists", {}).get("items", [])
                for playlist in featured:
                    images = playlist.get("images", [])
                    image_url = images[0].get("url") if images else "/images/playlist-1.png"
                    playlists_data.append({
                        "id": playlist.get("id"),
                        "title": playlist.get("name"),
                        "subtitle": playlist.get("description", "")[:50] or f"{playlist.get('tracks', {}).get('total', 0)} tracks",
                        "imageUrl": image_url,
                        "spotifyId": playlist.get("id"),
                        "genre": "Featured"
                    })
            
            # Also search for genre-specific playlists
            for genre in genres[:12]:  # Get playlists for all genres
                try:
                    genre_resp = requests.get(
                        f"https://api.spotify.com/v1/search?q={urllib.parse.quote(genre['query'])}&type=playlist&limit=1",
                        headers={"Authorization": f"Bearer {user.spotify_access_token}"}
                    )
                    if genre_resp.status_code == 200:
                        playlists = genre_resp.json().get("playlists", {}).get("items", [])
                        if playlists:
                            playlist = playlists[0]
                            images = playlist.get("images", [])
                            image_url = images[0].get("url") if images else "/images/playlist-1.png"
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
                    
        except Exception as e:
            print(f"Error fetching Spotify playlists: {e}")
    
    # If no playlists from Spotify, try JioSaavn or use defaults
    if not playlists_data:
        try:
            # Try to get some playlists from JioSaavn
            saavn_genres = ["bollywood", "hindi", "english", "punjabi"]
            for genre in saavn_genres[:4]:
                try:
                    saavn_resp = requests.get(f"https://saavn.dev/api/search/playlists?query={urllib.parse.quote(genre)}&limit=1")
                    if saavn_resp.status_code == 200:
                        saavn_data = saavn_resp.json().get("data", {}).get("results", [])
                        if saavn_data:
                            playlist = saavn_data[0]
                            images = playlist.get("image", [])
                            image_url = images[0].get("link") if images else f"/images/playlist-{len(playlists_data) % 4 + 1}.png"
                            playlists_data.append({
                                "id": playlist.get("id"),
                                "title": playlist.get("title", playlist.get("name", "Playlist")),
                                "subtitle": f"{genre.capitalize()} • {playlist.get('songCount', 0)} songs",
                                "imageUrl": image_url,
                                "url": playlist.get("url"),
                                "genre": genre.capitalize()
                            })
                except Exception as e:
                    print(f"Error fetching JioSaavn {genre} playlist: {e}")
                    continue
        except Exception as e:
            print(f"Error with JioSaavn fallback: {e}")
    
    # Final fallback to default genre-based playlists
    if not playlists_data:
        playlists_data = [
            {"id": 1, "title": "Pop Hits 2024", "subtitle": "Top pop songs", "imageUrl": "/images/playlist-1.png", "genre": "Pop"},
            {"id": 2, "title": "Rock Classics", "subtitle": "Best rock songs", "imageUrl": "/images/playlist-2.png", "genre": "Rock"},
            {"id": 3, "title": "Hip Hop Essentials", "subtitle": "Hip hop favorites", "imageUrl": "/images/playlist-3.png", "genre": "Hip Hop"},
            {"id": 4, "title": "Electronic Dance", "subtitle": "EDM hits", "imageUrl": "/images/playlist-4.png", "genre": "Electronic"},
            {"id": 5, "title": "Jazz Collection", "subtitle": "Smooth jazz", "imageUrl": "/images/playlist-1.png", "genre": "Jazz"},
            {"id": 6, "title": "Classical Masterpieces", "subtitle": "Classical music", "imageUrl": "/images/playlist-2.png", "genre": "Classical"},
            {"id": 7, "title": "Bollywood Hits", "subtitle": "Top Hindi songs", "imageUrl": "/images/playlist-3.png", "genre": "Bollywood"},
            {"id": 8, "title": "R&B Soul", "subtitle": "Soulful R&B", "imageUrl": "/images/playlist-4.png", "genre": "R&B"}
        ]
    
    # Return all playlists (up to 50)
    return jsonify(playlists_data[:50]), 200


@app.route('/api/trending-songs', methods=['GET'])
@jwt_required()
def get_trending_songs():
    """Get trending/popular songs"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    songs_data = []
    
    # Try Spotify first
    if user and user.spotify_access_token:
        try:
            ensure_valid_spotify_token(user)
            # Get featured playlists or new releases
            spotify_resp = requests.get(
                "https://api.spotify.com/v1/browse/new-releases?limit=50",
                headers={"Authorization": f"Bearer {user.spotify_access_token}"}
            )
            if spotify_resp.status_code == 200:
                albums = spotify_resp.json().get("albums", {}).get("items", [])
                for album in albums:
                    images = album.get("images", [])
                    image_url = images[0].get("url") if images else "/images/song-1.png"
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
        except Exception as e:
            print(f"Error fetching Spotify trending: {e}")
    
    # Fallback to JioSaavn or default
    if not songs_data:
        try:
            saavn_resp = requests.get("https://saavn.dev/api/search/songs?query=trending&limit=50", timeout=5)
            if saavn_resp.status_code == 200:
                saavn_data = saavn_resp.json().get("data", [])
                for song in saavn_data:
                    images = song.get("image", [])
                    image_url = None
                    if images:
                        if isinstance(images, list) and len(images) > 0:
                            image_url = images[-1].get("link") if isinstance(images[-1], dict) else images[-1]
                        elif isinstance(images, dict):
                            image_url = images.get("link")
                    
                    if not image_url:
                        image_url = "/images/song-1.png"
                    
                    artist_names = ", ".join([a.get("name", "") for a in song.get("artists", [])]) if song.get("artists") else "Unknown Artist"
                    
                    songs_data.append({
                        "id": song.get("id"),
                        "title": song.get("name", "Unknown Song"),
                        "subtitle": artist_names,
                        "imageUrl": image_url,
                        "url": song.get("url"),
                        "artist": artist_names,
                        "album": song.get("album", {}).get("name", "") if isinstance(song.get("album"), dict) else ""
                    })
        except Exception as e:
            print(f"Error fetching JioSaavn trending: {e}")
    
    # Default fallback
    if not songs_data:
        songs_data = [
            {"id": 1, "title": "Blue Eyes", "subtitle": "Honey Singh", "imageUrl": "/images/song-1.png"},
            {"id": 2, "title": "Photograph", "subtitle": "Ed Sheeran", "imageUrl": "/images/song-2.png"},
            {"id": 3, "title": "Dil Jhoom", "subtitle": "Arijjit Singh", "imageUrl": "/images/song-3.png"},
            {"id": 4, "title": "APT", "subtitle": "Rose & Bruno Mars", "imageUrl": "/images/song-4.png"}
        ]
    
    return jsonify(songs_data), 200


@app.route('/api/artists', methods=['GET'])
@jwt_required()
def get_artists():
    """Get popular artists"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    artists_data = []
    seen_artist_ids = set()  # Track unique artist IDs
    seen_artist_names = set()  # Track unique artist names (case-insensitive)
    
    # Try Spotify first
    if user and user.spotify_access_token:
        try:
            ensure_valid_spotify_token(user)
            # Search for popular artists
            popular_artists = [
                "Arijit Singh", "Sonu Nigam", "Shreya Ghoshal", "Atif Aslam", 
                "Ed Sheeran", "Taylor Swift", "The Weeknd", "Drake", "Adele",
                "Billie Eilish", "Post Malone", "Dua Lipa", "Justin Bieber",
                "Ariana Grande", "Bruno Mars", "Coldplay", "Imagine Dragons",
                "Eminem", "Kanye West", "Kendrick Lamar", "Lana Del Rey",
                "Rihanna", "Beyoncé", "The Beatles", "Queen"
            ]
            for artist_name in popular_artists:
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
                            image_url = images[0].get("url") if images else f"/images/artist-{artist_name.lower().replace(' ', '-')}-circle.png"
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
        except Exception as e:
            print(f"Error fetching Spotify artists: {e}")
    
    # Default fallback
    if not artists_data:
        artists_data = [
            {"id": 1, "title": "Arijit Singh", "subtitle": "Bollywood Singer", "imageUrl": "/images/artist-arijit-circle.png"},
            {"id": 2, "title": "Sonu Nigam", "subtitle": "Bollywood Singer", "imageUrl": "/images/artist-sonu-circle.png"},
            {"id": 3, "title": "Shreya Ghoshal", "subtitle": "Bollywood Singer", "imageUrl": "/images/artist-shreya-circle.png"},
            {"id": 4, "title": "Atif Aslam", "subtitle": "Bollywood Singer", "imageUrl": "/images/artist-atif-circle.png"}
        ]
    
    return jsonify(artists_data), 200


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
    app.run(debug=True)
