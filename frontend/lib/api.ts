// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
console.log('🚀 [API] Configured API_BASE_URL:', API_BASE_URL);

// Helper function to get auth token from localStorage
const getAuthToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
};

// Helper function to make authenticated API requests
const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    // Token expired or invalid - clear it
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  return response;
};

// Authentication APIs
export const authAPI = {
  register: async (email: string, password: string) => {
    const response = await apiRequest('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    return response.json();
  },

  login: async (email: string, password: string) => {
    const response = await apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    if (data.token && typeof window !== 'undefined') {
      localStorage.setItem('auth_token', data.token);
    }
    return data;
  },

  getGoogleLoginUrl: async () => {
    const response = await apiRequest('/api/google/login');
    if (!response.ok) {
      throw new Error('Failed to get Google login URL');
    }
    return response.json();
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  },

  getMe: async () => {
    const response = await apiRequest('/api/me');
    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }
    return response.json();
  },

  getProfile: async () => {
    const response = await apiRequest('/api/profile');
    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }
    return response.json();
  },

  updateProfile: async (profileData: {
    first_name?: string;
    username?: string;
    phone_number?: string;
    bio?: string;
  }) => {
    const response = await apiRequest('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update profile');
    }
    return response.json();
  },

  uploadProfilePicture: async (imageData: string) => {
    const response = await apiRequest('/api/profile/picture', {
      method: 'POST',
      body: JSON.stringify({ image: imageData }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload profile picture');
    }
    return response.json();
  },
};

// Emotion Detection APIs
export const emotionAPI = {
  detectFromImage: async (imageData: string) => {
    const response = await apiRequest('/api/detect-emotion', {
      method: 'POST',
      body: JSON.stringify({ image: imageData }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Emotion detection failed');
    }

    return response.json();
  },

  logEmotion: async (emotion: string) => {
    const response = await apiRequest('/log_emotion', {
      method: 'POST',
      body: JSON.stringify({ emotion }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to log emotion');
    }

    return response.json();
  },
};

// Music Recommendation APIs
export const musicAPI = {
  getRecommendations: async (emotion?: string, language?: string, wellbeing?: boolean) => {
    const params = new URLSearchParams();
    if (emotion) params.append('emotion', emotion);
    if (language) params.append('language', language);
    if (wellbeing !== undefined) params.append('wellbeing', wellbeing.toString());

    const response = await apiRequest(`/api/recommendations?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch recommendations');
    }

    return response.json();
  },

  search: async (query: string, type: string = 'track') => {
    const params = new URLSearchParams();
    params.append('q', query);
    params.append('type', type);

    const response = await apiRequest(`/api/search?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Search failed');
    }

    return response.json();
  },
};

// Spotify Integration APIs
export const spotifyAPI = {
  getLoginUrl: async () => {
    const response = await apiRequest('/api/spotify/login-url');
    if (!response.ok) {
      throw new Error('Failed to get Spotify login URL');
    }
    return response.json();
  },

  completeCallback: async (code: string) => {
    const response = await apiRequest('/spotify/callback/complete', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to complete Spotify connection';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
        if (error.details) {
          console.error('Spotify callback error details:', error.details);
          // Include more details in development
          if (process.env.NODE_ENV === 'development') {
            errorMessage += `: ${JSON.stringify(error.details)}`;
          }
        }
      } catch (e) {
        // If response is not JSON, get text
        const text = await response.text();
        console.error('Spotify callback error (non-JSON):', text);
        errorMessage = text || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },
};

// Playlist APIs
export const playlistAPI = {
  getAll: async () => {
    const response = await apiRequest('/api/playlists');
    if (!response.ok) {
      throw new Error('Failed to fetch playlists');
    }
    return response.json();
  },

  create: async (name: string, description?: string) => {
    const response = await apiRequest('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create playlist');
    }

    return response.json();
  },
};

// Liked Songs APIs
export const likedSongsAPI = {
  like: async (song: {
    source: string;
    external_id: string;
    title: string;
    artist?: string;
    album?: string;
  }) => {
    const response = await apiRequest('/api/songs/like', {
      method: 'POST',
      body: JSON.stringify(song),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to like song');
    }

    return response.json();
  },

  unlike: async (source: string, external_id: string) => {
    const response = await apiRequest('/api/songs/like', {
      method: 'DELETE',
      body: JSON.stringify({ source, external_id }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unlike song');
    }

    return response.json();
  },

  getAll: async () => {
    const response = await apiRequest('/api/liked-songs');
    if (!response.ok) {
      throw new Error('Failed to fetch liked songs');
    }
    return response.json();
  },
};

// History API
export const historyAPI = {
  getAll: async () => {
    const response = await apiRequest('/api/song-history');
    if (!response.ok) {
      throw new Error('Failed to fetch song history');
    }
    return response.json();
  },
};

// Featured Content APIs
export const featuredAPI = {
  getPlaylists: async (language?: string) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const url = params.toString() ? `/api/featured-playlists?${params.toString()}` : '/api/featured-playlists';
    const response = await apiRequest(url);
    if (!response.ok) {
      throw new Error('Failed to fetch featured playlists');
    }
    return response.json();
  },

  getTrendingSongs: async (language?: string) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const url = params.toString() ? `/api/trending-songs?${params.toString()}` : '/api/trending-songs';
    const response = await apiRequest(url);
    if (!response.ok) {
      throw new Error('Failed to fetch trending songs');
    }
    return response.json();
  },

  getArtists: async (language?: string) => {
    const params = new URLSearchParams();
    if (language) {
      params.append('language', language);
      console.log('[getArtists API] Requesting artists with language:', language);
    } else {
      console.log('[getArtists API] No language provided, using default');
    }
    const url = params.toString() ? `/api/artists?${params.toString()}` : '/api/artists';
    const response = await apiRequest(url);
    if (!response.ok) {
      throw new Error('Failed to fetch artists');
    }
    const data = await response.json();
    console.log('[getArtists API] Received', data.length, 'artists');
    return data;
  },

  getIndustrySongs: async (language?: string, excludeIds?: (string | number)[]) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (excludeIds && excludeIds.length > 0) {
      const cleaned = excludeIds
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
      if (cleaned.length > 0) params.append('exclude_ids', cleaned.join(','));
    }
    const url = params.toString()
      ? `/api/industry-songs?${params.toString()}`
      : '/api/industry-songs';
    const response = await apiRequest(url);
    if (!response.ok) {
      throw new Error('Failed to fetch industry songs');
    }
    return response.json();
  },
};

// Public APIs (no authentication required)
export const publicAPI = {
  getTrendingSongs: async (language?: string) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const url = params.toString() ? `/api/public/trending-songs?${params.toString()}` : '/api/public/trending-songs';
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch trending songs');
    }
    return response.json();
  },

  getIndustrySongs: async (language?: string, excludeIds?: (string | number)[]) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (excludeIds && excludeIds.length > 0) {
      const cleaned = excludeIds
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
      if (cleaned.length > 0) params.append('exclude_ids', cleaned.join(','));
    }
    const url = params.toString()
      ? `/api/public/industry-songs?${params.toString()}`
      : '/api/public/industry-songs';
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch industry songs');
    }
    return response.json();
  },

  getFeaturedPlaylists: async (language?: string) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const url = params.toString() ? `/api/public/featured-playlists?${params.toString()}` : '/api/public/featured-playlists';
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch featured playlists');
    }
    return response.json();
  },

  getArtists: async (language?: string) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    const url = params.toString() ? `/api/public/artists?${params.toString()}` : '/api/public/artists';
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch artists');
    }
    return response.json();
  },
};

// Settings APIs
export const settingsAPI = {
  getPreferences: async () => {
    const response = await apiRequest('/api/settings/preferences');
    if (!response.ok) {
      throw new Error('Failed to fetch preferences');
    }
    return response.json();
  },

  updatePreferences: async (preferences: {
    theme?: string;
    language?: string;
    camera_access_enabled?: boolean;
    notifications_enabled?: boolean;
    add_to_home_enabled?: boolean;
  }) => {
    const response = await apiRequest('/api/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update preferences');
    }
    return response.json();
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await apiRequest('/api/settings/password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to change password');
    }
    return response.json();
  },

  clearHistory: async () => {
    const response = await apiRequest('/api/settings/history/clear', {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to clear history');
    }
    return response.json();
  },

  deleteAccount: async () => {
    const response = await apiRequest('/api/settings/account/delete', {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete account');
    }
    return response.json();
  },

  unlinkSpotify: async () => {
    const response = await apiRequest('/api/settings/spotify/unlink', {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unlink Spotify');
    }
    return response.json();
  },

  unlinkGoogle: async () => {
    const response = await apiRequest('/api/settings/google/unlink', {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unlink Google');
    }
    return response.json();
  },
};

