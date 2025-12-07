// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
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
  getPlaylists: async () => {
    const response = await apiRequest('/api/featured-playlists');
    if (!response.ok) {
      throw new Error('Failed to fetch featured playlists');
    }
    return response.json();
  },

  getTrendingSongs: async () => {
    const response = await apiRequest('/api/trending-songs');
    if (!response.ok) {
      throw new Error('Failed to fetch trending songs');
    }
    return response.json();
  },

  getArtists: async () => {
    const response = await apiRequest('/api/artists');
    if (!response.ok) {
      throw new Error('Failed to fetch artists');
    }
    return response.json();
  },
};

