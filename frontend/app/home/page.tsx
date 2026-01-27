'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import { emotionAPI, musicAPI, spotifyAPI, featuredAPI, settingsAPI, authAPI } from '@/lib/api'
import { useRouter, usePathname } from 'next/navigation'
import HorizontalCarousel from '@/components/HorizontalCarousel'
import styles from './page.module.css'

interface Song {
  title: string
  artist: string
  album?: string
  spotifyUri?: string
  url?: string
  source: string
  emotion?: string
  language?: string
}

export default function HomeAfterLogin() {
  const { isAuthenticated, loading: authLoading, user, refreshUser } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [showLanguageModal, setShowLanguageModal] = useState(false)
  const [showSpotifyPrompt, setShowSpotifyPrompt] = useState(false)
  const [showWellbeingPrompt, setShowWellbeingPrompt] = useState(false)
  const [showFaceDetectionError, setShowFaceDetectionError] = useState(false)
  const [isLinkingSpotify, setIsLinkingSpotify] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [detectedEmotion, setDetectedEmotion] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<Song[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState<string>('')
  const [wellbeingMode, setWellbeingMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState<Song[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [featuredPlaylists, setFeaturedPlaylists] = useState<any[]>([])
  const [trendingSongs, setTrendingSongs] = useState<any[]>([])
  const [industrySongs, setIndustrySongs] = useState<any[]>([])
  const [artists, setArtists] = useState<any[]>([])
  const [loadingFeatured, setLoadingFeatured] = useState(true)
  const [userLanguage, setUserLanguage] = useState<string | null>(null) // Start with null to indicate not loaded yet
  const fetchingLanguageRef = useRef<boolean>(false)
  const hasFetchedContentRef = useRef<string>('')
  const languageLoadedRef = useRef<boolean>(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const { playSong } = useMusicPlayer()
  const [profile, setProfile] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  const languages = ['Hindi', 'English', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Global']
  
  // Mental well-being triggers (negative emotions)
  const MENTAL_WELLBEING_TRIGGERS = ["sad", "depressed", "angry", "stressed", "fear", "anxious"]

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, authLoading, router])

  // Fetch user language preference on mount
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchUserLanguage()
    }
  }, [isAuthenticated, authLoading])

  // Fetch featured content when language is available
  // Only fetch after language has been loaded from API (not default)
  useEffect(() => {
    if (isAuthenticated && !authLoading && userLanguage && languageLoadedRef.current) {
      // Only fetch if language has actually changed
      if (hasFetchedContentRef.current !== userLanguage) {
        console.log('[Content] Fetching for language:', userLanguage)
        hasFetchedContentRef.current = userLanguage
        fetchFeaturedContent()
        // Also fetch trending songs for Recommended Songs section
        if (!detectedEmotion) {
          fetchTrendingForRecommended()
        }
      }
    }
  }, [isAuthenticated, authLoading, userLanguage])

  // Fetch language preference from user settings
  const fetchUserLanguage = async () => {
    // Prevent multiple simultaneous calls
    if (fetchingLanguageRef.current) {
      return
    }
    
    try {
      fetchingLanguageRef.current = true
      const prefs = await settingsAPI.getPreferences()
      const newLanguage = prefs.language || 'English'
      
      console.log('[Language] Fetched from API:', newLanguage)
      
      // Mark language as loaded and update state
      languageLoadedRef.current = true
      setUserLanguage(newLanguage)
    } catch (error) {
      console.error('Failed to fetch language preference:', error)
      // Set default only if we don't have one yet
      if (!languageLoadedRef.current) {
        languageLoadedRef.current = true
        setUserLanguage('English')
      }
    } finally {
      fetchingLanguageRef.current = false
    }
  }

  // Refresh language when window regains focus (e.g., returning from settings)
  // Add delay to ensure backend has saved the preference
  useEffect(() => {
    const handleFocus = () => {
      if (isAuthenticated && !authLoading) {
        // Delay to ensure backend has processed the update
        setTimeout(() => {
          fetchUserLanguage()
          fetchProfile() // Also refresh profile when returning from edit profile
        }, 500)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isAuthenticated, authLoading])

  // Fetch profile on mount
  useEffect(() => {
    if (user) {
      fetchProfile()
    }
  }, [user])

  // Refetch profile when page becomes visible (e.g., when returning from edit profile)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Add delay to ensure backend has processed the update
        setTimeout(() => {
          fetchProfile()
        }, 500)
      }
    }

    window.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user])

  // Refetch profile when pathname changes (e.g., returning from edit-profile)
  useEffect(() => {
    if (pathname === '/home' && user) {
      // Small delay to ensure navigation is complete
      const timer = setTimeout(() => {
        fetchProfile()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [pathname, user])

  const fetchProfile = async () => {
    try {
      setProfileLoading(true)
      const profileData = await authAPI.getProfile()
      setProfile(profileData)
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    } finally {
      setProfileLoading(false)
    }
  }

  const getDisplayName = () => {
    if (profile?.first_name) return profile.first_name
    if (profile?.username) return profile.username
    if (user?.email) return user.email.split('@')[0]
    return 'User'
  }

  const getProfilePicture = () => {
    // Don't show fallback while loading - wait for profile data
    if (profileLoading) return undefined
    if (profile?.profile_picture_url) return profile.profile_picture_url
    // No static fallback - return null or empty string when Spotify is linked
    if (user?.spotifyLinked) {
      return null
    }
    return '/images/profile-emily.png'
  }

  const fetchTrendingForRecommended = async () => {
    if (!userLanguage) {
      console.warn('[fetchTrendingForRecommended] No language set, skipping fetch')
      return
    }
    
    try {
      setLoadingRecommendations(true)
      const songs = await featuredAPI.getTrendingSongs(userLanguage)
      // Set trending songs as recommendations - limit to 15 items
      setRecommendations(songs.slice(0, 15))
    } catch (error) {
      console.error('Error fetching trending songs for recommendations:', error)
      setRecommendations([])
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const fetchFeaturedContent = async () => {
    if (!userLanguage) {
      console.warn('[fetchFeaturedContent] No language set, skipping fetch')
      return
    }
    
    try {
      setLoadingFeatured(true)
      console.log('[fetchFeaturedContent] Fetching with language:', userLanguage)
      const [playlists, songs, artistsData] = await Promise.all([
        featuredAPI.getPlaylists(userLanguage).catch((e) => {
          console.error('Error fetching playlists:', e)
          return []
        }),
        featuredAPI.getTrendingSongs(userLanguage).catch((e) => {
          console.error('Error fetching trending songs:', e)
          return []
        }),
        featuredAPI.getArtists(userLanguage).catch((e) => {
          console.error('Error fetching artists:', e)
          return []
        })
      ])
      console.log('[fetchFeaturedContent] Received artists:', artistsData.length, 'for language:', userLanguage)
      // Limit to 15 items per section for better loading speed
      setFeaturedPlaylists(playlists.slice(0, 15))
      setTrendingSongs(songs.slice(0, 15))
      setArtists(artistsData.slice(0, 15))
      
      // Fetch industry songs separately, excluding trending song IDs to ensure different content
      const trendingSongIds = songs
        .slice(0, 15)
        .map(s => s.id || s.spotifyId || s.spotifyUri)
        .filter(Boolean)
      
      try {
        const industrySongsData = await featuredAPI.getIndustrySongs(userLanguage, trendingSongIds)
        setIndustrySongs(industrySongsData.slice(0, 15))
      } catch (e) {
        console.error('Error fetching industry songs:', e)
        setIndustrySongs([])
      }
    } catch (error) {
      console.error('Error fetching featured content:', error)
    } finally {
      setLoadingFeatured(false)
    }
  }

  const handleSpotifyCallback = useCallback(async (code: string) => {
    try {
      setIsLinkingSpotify(true)
      await spotifyAPI.completeCallback(code)
      await refreshUser()
      setShowSpotifyPrompt(false)
      
      // Reset the fetched content ref to force re-fetch of featured content
      hasFetchedContentRef.current = ''
      
      // Refresh featured content if language is available
      if (userLanguage && languageLoadedRef.current) {
        console.log('[Spotify Link] Refreshing featured content after Spotify link')
        await fetchFeaturedContent()
        // Also refresh trending songs for Recommended Songs section
        if (!detectedEmotion) {
          await fetchTrendingForRecommended()
        }
      }
      
      alert('Spotify account linked successfully!')
    } catch (error: any) {
      console.error('Spotify linking error:', error)
      const errorMessage = error.message || 'Failed to link Spotify account'
      alert(`Error: ${errorMessage}\n\nPlease check:\n1. Spotify credentials are configured in backend .env\n2. Redirect URI matches in Spotify app settings\n3. Backend server is running`)
    } finally {
      setIsLinkingSpotify(false)
    }
  }, [refreshUser, userLanguage, fetchFeaturedContent, fetchTrendingForRecommended, detectedEmotion])

  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    
    // Check for Spotify callback code in URL or sessionStorage
    const urlParams = new URLSearchParams(window.location.search)
    let spotifyCode = urlParams.get('spotify_code')
    
    // Also check sessionStorage (in case user was redirected from login)
    if (!spotifyCode && typeof window !== 'undefined') {
      spotifyCode = sessionStorage.getItem('spotify_code')
      if (spotifyCode) {
        sessionStorage.removeItem('spotify_code')
      }
    }
    
    if (spotifyCode) {
      handleSpotifyCallback(spotifyCode)
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [authLoading, isAuthenticated, handleSpotifyCallback]) // Re-run when auth state changes

  const handleLinkSpotify = async () => {
    try {
      setIsLinkingSpotify(true)
      const { url } = await spotifyAPI.getLoginUrl()
      // Open Spotify OAuth in the same window
      window.location.href = url
    } catch (error: any) {
      console.error('Failed to get Spotify login URL:', error)
      alert(error.message || 'Failed to initiate Spotify linking')
      setIsLinkingSpotify(false)
    }
  }

  // Check camera permission status
  const checkCameraPermission = async (): Promise<'granted' | 'denied' | 'prompt'> => {
    try {
      // Check if Permissions API is available
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
        return result.state as 'granted' | 'denied' | 'prompt'
      }
      // If Permissions API is not available, return 'prompt' to show modal
      return 'prompt'
    } catch (error) {
      // If permission query fails, return 'prompt' to show modal
      console.error('Error checking camera permission:', error)
      return 'prompt'
    }
  }

  // Start camera stream directly (used when permission is already granted)
  const startCameraStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      })
      streamRef.current = stream
      // Small delay to ensure modal closes before showing video
      setTimeout(() => {
        setIsCapturing(true)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err)
          })
        }
      }, 100)
    } catch (error) {
      console.error('Camera access denied:', error)
      alert('Camera access is required for emotion detection')
      setShowCameraModal(false)
    }
  }

  const handleAllowCamera = async () => {
    setShowCameraModal(false)
    await startCameraStream()
  }

  // Handle camera icon click - check permission first
  const handleCameraIconClick = async () => {
    // Check if Spotify is linked first - show prompt if not
    if (!user?.spotifyLinked) {
      setShowSpotifyPrompt(true)
      return
    }
    
    const permissionStatus = await checkCameraPermission()
    
    if (permissionStatus === 'granted') {
      // Permission already granted, start camera directly
      await startCameraStream()
    } else if (permissionStatus === 'denied') {
      // Permission denied, show alert
      alert('Camera access has been denied. Please enable camera access in your browser settings to use emotion detection.')
    } else {
      // Permission not determined yet, show modal
      setShowCameraModal(true)
    }
  }

  // Ensure video plays when capturing starts
  useEffect(() => {
    if (isCapturing && videoRef.current && streamRef.current) {
      if (!videoRef.current.srcObject) {
        videoRef.current.srcObject = streamRef.current
      }
      videoRef.current.play().catch(err => {
        console.error('Error playing video:', err)
      })
    }
  }, [isCapturing])

  const handleDeclineCamera = () => {
    setShowCameraModal(false)
  }

  const capturePhoto = async () => {
    if (!videoRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(videoRef.current, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg')

    // Stop the camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCapturing(false)

    try {
      setLoadingRecommendations(true)
      const result = await emotionAPI.detectFromImage(imageData)
      
      if (result.emotion) {
        setDetectedEmotion(result.emotion)
        await emotionAPI.logEmotion(result.emotion)
        
        // Check if emotion triggers mental well-being mode
        const emotionLower = result.emotion.toLowerCase()
        if (MENTAL_WELLBEING_TRIGGERS.includes(emotionLower)) {
          // Show wellbeing prompt before language selection
          setShowWellbeingPrompt(true)
        } else {
          // Go directly to language selection
          setShowLanguageModal(true)
        }
      } else {
        // Show helpful error modal instead of alert
        setShowFaceDetectionError(true)
      }
    } catch (error: any) {
      console.error('Emotion detection error:', error)
      // Show helpful error modal for detection failures
      setShowFaceDetectionError(true)
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const handleLanguageSelect = async (language: string, skipSpotifyCheck = false) => {
    setSelectedLanguage(language)
    setShowLanguageModal(false)
    setShowSpotifyPrompt(false)
    
    // Check if Spotify is linked, if not, prompt user (unless skipping)
    if (!skipSpotifyCheck && !user?.spotifyLinked) {
      setShowSpotifyPrompt(true)
      return
    }
    
    // Fetch recommendations with wellbeing mode
    await fetchRecommendations(detectedEmotion, language, wellbeingMode)
  }

  const handleWellbeingChoice = (enable: boolean) => {
    setWellbeingMode(enable)
    setShowWellbeingPrompt(false)
    // Proceed to language selection
    setShowLanguageModal(true)
  }

  const fetchRecommendations = async (emotion: string | null, language: string, wellbeing: boolean = false) => {
    if (emotion && language) {
      try {
        setLoadingRecommendations(true)
        const songs = await musicAPI.getRecommendations(emotion, language, wellbeing)
        setRecommendations(songs)
      } catch (error: any) {
        console.error('Failed to fetch recommendations:', error)
        // Don't show alert, just log the error
        setRecommendations([])
      } finally {
        setLoadingRecommendations(false)
      }
    }
  }

  // Handle song click - open in player or external link
  const handleSongClick = (song: any, context?: Song[]) => {
    // Check if we can embed (Spotify or JioSaavn with URL)
    const canEmbed = (song.spotifyUri || song.spotifyId) || (song.url && (song.source === 'JioSaavn' || song.source === 'jiosaavn'))
    
    if (canEmbed) {
      // Build play queue from context (recommendations, trending, search results)
      const queue = context && context.length > 0 
        ? context.map(s => ({
            id: s.id || s.spotifyUri || s.url,
            title: s.title,
            artist: s.artist || s.subtitle || 'Unknown Artist',
            album: s.album,
            spotifyUri: s.spotifyUri,
            spotifyId: s.spotifyId,
            url: s.url,
            imageUrl: s.imageUrl,
            source: s.source || 'Unknown'
          }))
        : []
      
      // Open in picture-in-picture player using global context
      const songData = {
        id: song.id || song.spotifyUri || song.url,
        title: song.title,
        artist: song.artist || song.subtitle || 'Unknown Artist',
        album: song.album,
        spotifyUri: song.spotifyUri,
        spotifyId: song.spotifyId,
        url: song.url,
        imageUrl: song.imageUrl,
        source: song.source || 'Unknown'
      }
      playSong(songData, queue)
    } else {
      // Fallback to external link if embedding not possible
      if (song.spotifyUrl) {
        window.open(song.spotifyUrl, '_blank')
      } else if (song.spotifyUri) {
        if (song.spotifyUri.startsWith('spotify:track:')) {
          const trackId = song.spotifyUri.replace('spotify:track:', '')
          window.open(`https://open.spotify.com/track/${trackId}`, '_blank')
        } else if (song.spotifyUri.startsWith('spotify:album:')) {
          const albumId = song.spotifyUri.replace('spotify:album:', '')
          window.open(`https://open.spotify.com/album/${albumId}`, '_blank')
        }
      } else if (song.spotifyId) {
        window.open(`https://open.spotify.com/album/${song.spotifyId}`, '_blank')
      } else if (song.url) {
        window.open(song.url, '_blank')
      } else {
        alert(`Song: ${song.title}\nArtist: ${song.artist || song.subtitle}\n${song.album ? `Album: ${song.album}` : ''}\n\nNo playable link available.`)
      }
    }
  }


  // Handle artist click - search for artist's songs or show artist details
  const handleArtistClick = async (artist: any) => {
    const artistName = artist.title || artist.name || 'Unknown Artist'
    
    if (artist.spotifyId) {
      // Open Spotify artist page
      const spotifyUrl = `https://open.spotify.com/artist/${artist.spotifyId}`
      window.open(spotifyUrl, '_blank')
    } else if (artist.url) {
      // Open JioSaavn artist URL
      window.open(artist.url, '_blank')
    } else {
      // Navigate to search results page for artist
      router.push(`/search?q=${encodeURIComponent(artistName)}`)
    }
  }

  // Handle playlist click - open in Spotify or JioSaavn
  const handlePlaylistClick = (playlist: any) => {
    if (playlist.spotifyId) {
      // Open Spotify playlist
      const spotifyUrl = `https://open.spotify.com/playlist/${playlist.spotifyId}`
      window.open(spotifyUrl, '_blank')
    } else if (playlist.url) {
      // Open JioSaavn playlist URL
      window.open(playlist.url, '_blank')
    } else {
      // Show playlist info
      alert(`Playlist: ${playlist.title}\n${playlist.subtitle || ''}\n${playlist.genre ? `Genre: ${playlist.genre}` : ''}\n\nNo playable link available.`)
    }
  }

  // Auto-fetch recommendations when emotion and language are both available
  useEffect(() => {
    if (detectedEmotion && selectedLanguage && !loadingRecommendations) {
      fetchRecommendations(detectedEmotion, selectedLanguage, wellbeingMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedEmotion, selectedLanguage, wellbeingMode])

  // Reset to trending songs when emotion is cleared
  useEffect(() => {
    // If no emotion detected and no language selected, show trending songs
    if (!detectedEmotion && !selectedLanguage && userLanguage) {
      // Clear recommendations and wellbeing mode, then fetch trending songs
      setRecommendations([])
      setWellbeingMode(false)
      fetchTrendingForRecommended()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedEmotion, selectedLanguage, userLanguage])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check if Spotify is linked first - show prompt if not
    if (!user?.spotifyLinked) {
      setShowSpotifyPrompt(true)
      return
    }
    
    if (!searchQuery.trim()) {
      setShowSuggestions(false)
      return
    }

    // Hide suggestions immediately when submitting search
    setShowSuggestions(false)
    setSearchSuggestions([])
    
    // Navigate to search results page
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  // Fetch search suggestions as user types (debounced)
  useEffect(() => {
    // Check if Spotify is linked first - don't fetch suggestions if not linked
    if (!user?.spotifyLinked) {
      setSearchSuggestions([])
      setShowSuggestions(false)
      return
    }
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // If search query is empty, clear suggestions
    if (!searchQuery.trim()) {
      setSearchSuggestions([])
      setShowSuggestions(false)
      return
    }

    // Set loading state
    setLoadingSuggestions(true)

    // Debounce the search - wait 300ms after user stops typing
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const suggestions = await musicAPI.search(searchQuery)
        setSearchSuggestions(suggestions.slice(0, 5)) // Limit to 5 suggestions
        // Update position after suggestions are set
        setTimeout(() => {
          if (searchBarRef.current) {
            const rect = searchBarRef.current.getBoundingClientRect()
            setDropdownPosition({
              top: rect.bottom + window.scrollY + 4,
              left: rect.left + window.scrollX,
              width: rect.width
            })
          }
        }, 0)
        setShowSuggestions(true)
      } catch (error: any) {
        console.error('Search suggestions error:', error)
        setSearchSuggestions([])
      } finally {
        setLoadingSuggestions(false)
      }
    }, 300)

    // Cleanup function
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, user?.spotifyLinked])

  const handleSuggestionClick = async (e: React.MouseEvent, suggestion: Song) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Check if Spotify is linked first - show prompt if not
    if (!user?.spotifyLinked) {
      setShowSuggestions(false)
      setSearchSuggestions([])
      setShowSpotifyPrompt(true)
      return
    }
    
    // Hide suggestions immediately and clear the array
    setShowSuggestions(false)
    setSearchSuggestions([])
    
    // Navigate to search results page
    const query = `${suggestion.title} ${suggestion.artist}`.trim()
    setSearchQuery(query)
    router.push(`/search?q=${encodeURIComponent(query)}`)
  }

  const updateDropdownPosition = () => {
    if (searchBarRef.current) {
      const rect = searchBarRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      })
    }
  }

  const handleSearchInputFocus = () => {
    // Check if Spotify is linked first - show prompt if not
    if (!user?.spotifyLinked) {
      setShowSpotifyPrompt(true)
      return
    }
    
    if (searchSuggestions.length > 0 && searchQuery.trim()) {
      updateDropdownPosition()
      setShowSuggestions(true)
    }
  }

  const handleSearchInputBlur = (e: React.FocusEvent) => {
    // Check if the blur is caused by clicking on a suggestion
    const relatedTarget = e.relatedTarget as HTMLElement
    if (relatedTarget && relatedTarget.closest('[data-suggestion-item]')) {
      // Don't hide suggestions if clicking on a suggestion
      return
    }
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      setShowSuggestions(false)
    }, 300)
  }

  if (authLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/home" className={styles.logoContainer}>
            <Image
              src="/images/logo.png"
              alt="MoodTune Logo"
              width={77}
              height={77}
              className={styles.logo}
              unoptimized
              priority
            />
          </Link>
          
          <div className={styles.searchContainer} style={{ position: 'relative' }}>
            <form onSubmit={handleSearch}>
              <div ref={searchBarRef} className={styles.searchBar} style={{ position: 'relative' }}>
                <Image
                  src="/images/search-icon.png"
                  alt="Search"
                  width={51}
                  height={30}
                  className={styles.searchIcon}
                  unoptimized
                />
                <input
                  type="text"
                  className={styles.searchText}
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={handleSearchInputFocus}
                  onBlur={handleSearchInputBlur}
                  style={{ 
                    border: 'none', 
                    background: 'transparent', 
                    outline: 'none',
                    flex: 1,
                    padding: '0 10px'
                  }}
                />
                
                {/* Search Suggestions Dropdown */}
                {showSuggestions && searchQuery.trim() && (
                  <div style={{
                    position: 'fixed',
                    top: `${dropdownPosition.top}px`,
                    left: `${dropdownPosition.left}px`,
                    width: `${dropdownPosition.width || 481.26}px`,
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    zIndex: 9999,
                    border: '1px solid #e0e0e0'
                  }}>
                    {loadingSuggestions ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
                        Searching...
            </div>
                    ) : searchSuggestions.length > 0 ? (
                      searchSuggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          data-suggestion-item
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleSuggestionClick(e, suggestion)
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleSuggestionClick(e, suggestion)
                          }}
                          style={{
                            padding: '0.75rem 1rem',
                            cursor: 'pointer',
                            borderBottom: index < searchSuggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            transition: 'background 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <div style={{
                            width: '40px',
                            height: '40px',
                            background: '#f0f0f0',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <Image
                              src="/images/play-icon.png"
                              alt="Song"
                              width={20}
                              height={20}
                              unoptimized
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontWeight: '500',
                              color: '#333',
                              fontSize: '0.95rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {suggestion.title}
                            </div>
                            <div style={{
                              color: '#666',
                              fontSize: '0.85rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '2px'
                            }}>
                              {suggestion.artist}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
                        No suggestions found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>
          
          <div 
            className={styles.cameraIcon} 
            onClick={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              await handleCameraIconClick()
            }}
            style={{ zIndex: 300, pointerEvents: 'auto' }}
          >
            <Image
              src="/images/camera-icon-home.svg"
              alt="Camera"
              width={58}
              height={53}
              unoptimized
              style={{ pointerEvents: 'none' }}
            />
          </div>
          
          <Link 
            href="/personalization-settings" 
            className={styles.settingsIcon}
            style={{ zIndex: 300, pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src="/images/settings-icon.svg"
              alt="Settings"
              width={65}
              height={65}
              className={styles.settingsIconImage}
              unoptimized
            />
          </Link>
          
          <Link 
            href="/edit-profile" 
            className={styles.profileIcon}
            style={{ zIndex: 300, pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {getProfilePicture() ? (
              <Image
                src={getProfilePicture()}
                alt="Profile"
                width={53}
                height={53}
                className={styles.profileIconImage}
                unoptimized
              />
            ) : getProfilePicture() === null || (!profileLoading && profile) ? (
              <div
                style={{
                  width: '53px',
                  height: '53px',
                  borderRadius: '50%',
                  background: '#ccc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  pointerEvents: 'none'
                }}
              >
                {getDisplayName().charAt(0).toUpperCase()}
              </div>
            ) : (
              <Image
                src="/images/profile-icon.svg"
                alt="Profile"
                width={53}
                height={53}
                unoptimized
                style={{ pointerEvents: 'none' }}
              />
            )}
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Emotion Detection Banner */}
        {!detectedEmotion && (
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '1.5rem 2rem',
            borderRadius: '15px',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }}
          onClick={handleCameraIconClick}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div>
              <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📸 Detect Your Mood
              </h3>
              <p style={{ margin: 0, fontSize: '1rem', opacity: 0.95 }}>
                Click here to capture your emotion and get personalized music recommendations!
              </p>
            </div>
            <div style={{
              width: '60px',
              height: '60px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              lineHeight: '60px',
              textAlign: 'center',
              padding: 0,
              margin: 0,
              boxSizing: 'border-box',
              flexShrink: 0
            }}>
              📷
            </div>
          </div>
        )}

        {/* Detected Emotion Display */}
        {detectedEmotion && (
          <div style={{
            background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
            color: 'white',
            padding: '1rem 1.5rem',
            borderRadius: '10px',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1.2rem' }}>
                🎭 Detected Emotion: <strong>{detectedEmotion}</strong>
              </h3>
              {selectedLanguage ? (
                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.95 }}>
                  Language: {selectedLanguage} • Recommendations ready!
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.95 }}>
                  Select a language to get recommendations
                </p>
              )}
            </div>
            <button
              onClick={async () => {
                setDetectedEmotion(null)
                setSelectedLanguage('')
                setRecommendations([])
                setWellbeingMode(false)
                await handleCameraIconClick()
              }}
              style={{
                padding: '0.5rem 1rem',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '5px',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              Detect Again
            </button>
          </div>
        )}

        {/* Spotify Linking Banner */}
        {user && !user.spotifyLinked && !showSpotifyPrompt && (
          <div style={{
            background: 'linear-gradient(135deg, #1DB954 0%, #1ed760 100%)',
            color: 'white',
            padding: '1rem 1.5rem',
            borderRadius: '10px',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.2rem' }}>
                🎵 Link Your Spotify Account
              </h3>
              <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.95 }}>
                Get personalized recommendations and access to millions of songs
              </p>
            </div>
            <button
              onClick={handleLinkSpotify}
              disabled={isLinkingSpotify}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#1DB954',
                border: 'none',
                borderRadius: '5px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: isLinkingSpotify ? 'not-allowed' : 'pointer',
                opacity: isLinkingSpotify ? 0.7 : 1
              }}
            >
              {isLinkingSpotify ? 'Linking...' : 'Link Now'}
            </button>
          </div>
        )}


        {/* Recommended Songs Section */}
        {loadingRecommendations ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Recommended Songs
              {detectedEmotion && ` (${detectedEmotion})`}
              {selectedLanguage && ` - ${selectedLanguage}`}
            </h2>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading recommendations...</div>
          </section>
        ) : recommendations.length > 0 ? (
          <HorizontalCarousel
            title={`Recommended Songs${detectedEmotion ? ` (${detectedEmotion})` : ' - Most Heard Today'}${wellbeingMode ? ' 💚 Well-being Mode' : ''}${selectedLanguage ? ` - ${selectedLanguage}` : ''}`}
            items={recommendations.map((song, index) => ({
              id: song.id || song.spotifyUri || song.url || `song-${index}`,
              title: song.title,
              subtitle: song.subtitle || song.artist,
              imageUrl: song.imageUrl || null, // Use null instead of fallback to show placeholder
              ...song
            }))}
            onItemClick={(item) => {
              handleSongClick(item, recommendations)
            }}
            itemWidth={252}
            itemHeight={199}
          />
        ) : (
          // Show empty state if no recommendations yet (no static fallback)
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recommended Songs</h2>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
              {detectedEmotion && !selectedLanguage 
                ? "Please select a language to get personalized recommendations!"
                : "Click the camera icon to detect your mood and get personalized recommendations!"
              }
            </div>
          </section>
        )}

        {/* Artist List Section */}
        {loadingFeatured ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Artist List</h2>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading artists...</div>
        </section>
        ) : (
          <HorizontalCarousel
            title="Artist List"
            items={artists}
            onItemClick={(item) => {
              handleArtistClick(item)
            }}
            itemWidth={226}
            itemHeight={217}
            circularImages={true}
          />
        )}

        {/* Industry Section */}
        {loadingFeatured ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Industry</h2>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading industry songs...</div>
        </section>
        ) : (
          <HorizontalCarousel
            title="Industry"
            items={industrySongs.map((song, index) => ({
              ...song,
              subtitle: song.subtitle || song.artist || ''
            }))}
            onItemClick={(item) => {
              handleSongClick(item, industrySongs)
            }}
            itemWidth={252}
            itemHeight={199}
          />
        )}

        {/* Playlists Section */}
        {loadingFeatured ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Playlists</h2>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading playlists...</div>
        </section>
        ) : (
          <HorizontalCarousel
            title="Playlists"
            items={featuredPlaylists}
            onItemClick={(item) => {
              handlePlaylistClick(item)
            }}
            itemWidth={252}
            itemHeight={202}
          />
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="/about-us" className={styles.footerLink}>About Us</Link>
          <span className={styles.footerDivider}>|</span>
          <Link href="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link>
          <span className={styles.footerDivider}>|</span>
          <Link href="/support" className={styles.footerLink}>Support</Link>
          <span className={styles.footerDivider}>|</span>
          <Link href="/terms-conditions" className={styles.footerLink}>Terms & Conditions</Link>
        </div>
        <p className={styles.copyright}>
          Copyright © 2025 MoodTune. All Rights Reserved.
        </p>
      </footer>

      {/* Camera Access Modal */}
      {showCameraModal && (
        <div className={styles.cameraModalOverlay} onClick={handleDeclineCamera}>
          <div className={styles.cameraModalContent} onClick={(e) => e.stopPropagation()}>
            <p className={styles.cameraModalText}>
              To continue, MoodTune needs permission to use your camera for mood detection.<br />
              <br />
              Would you like to grant access
            </p>

            <div className={styles.cameraModalButtons}>
              <button className={styles.allowButton} onClick={handleAllowCamera}>
                Allow
              </button>
              <button className={styles.declineButton} onClick={handleDeclineCamera}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture View */}
      {isCapturing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.95)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div style={{
            textAlign: 'center',
            marginBottom: '1.5rem',
            color: 'white'
          }}>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>📸 Capture Your Emotion</h2>
            <p style={{ margin: 0, opacity: 0.8 }}>Position your face in the frame and click Capture</p>
    </div>
          
          <div style={{
            position: 'relative',
            borderRadius: '15px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            width: '100%',
            maxWidth: '800px',
            aspectRatio: '16/9',
            background: '#000'
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                transform: 'scaleX(-1)' // Mirror the video for better UX
              }}
            />
            {loadingRecommendations && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem',
                color: 'white',
                zIndex: 10
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  border: '4px solid rgba(255,255,255,0.3)',
                  borderTop: '4px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <p style={{ margin: 0, fontSize: '1.1rem' }}>Detecting your emotion...</p>
              </div>
            )}
          </div>
          
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={capturePhoto}
              disabled={loadingRecommendations}
              style={{
                padding: '1rem 2.5rem',
                fontSize: '1.2rem',
                background: loadingRecommendations ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: loadingRecommendations ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!loadingRecommendations) {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.6)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)'
              }}
            >
              {loadingRecommendations ? 'Processing...' : '📷 Capture'}
            </button>
            <button
              onClick={() => {
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(track => track.stop())
                  streamRef.current = null
                }
                setIsCapturing(false)
              }}
              disabled={loadingRecommendations}
              style={{
                padding: '1rem 2.5rem',
                fontSize: '1.2rem',
                background: loadingRecommendations ? '#ccc' : '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: loadingRecommendations ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(244, 67, 54, 0.4)'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Mental Well-being Mode Prompt */}
      {showWellbeingPrompt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
            padding: '2.5rem',
            borderRadius: '15px',
            maxWidth: '500px',
            width: '90%',
            color: 'white',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💚</div>
              <h2 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.8rem' }}>
                Mental Well-being Mode
              </h2>
              <p style={{ margin: 0, fontSize: '1.1rem', opacity: 0.95 }}>
                We detected that you seem <strong>{detectedEmotion}</strong>.
              </p>
              <p style={{ marginTop: '1rem', fontSize: '1rem', opacity: 0.9 }}>
                Would you like to activate Mental Well-being Mode? This will recommend uplifting and calming music to help improve your mood.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => handleWellbeingChoice(true)}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  background: 'white',
                  color: '#4CAF50',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'transform 0.2s ease',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Yes, Activate
              </button>
              <button
                onClick={() => handleWellbeingChoice(false)}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  border: '2px solid white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'transform 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                No, Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h2 style={{ marginBottom: '1rem' }}>Select Language</h2>
            <p style={{ marginBottom: '1.5rem' }}>
              We detected your emotion as: <strong>{detectedEmotion}</strong>
              {wellbeingMode && (
                <span style={{ 
                  display: 'inline-block', 
                  marginLeft: '0.5rem', 
                  padding: '0.25rem 0.75rem', 
                  background: '#4CAF50', 
                  color: 'white', 
                  borderRadius: '15px', 
                  fontSize: '0.85rem',
                  fontWeight: 'bold'
                }}>
                  💚 Well-being Mode Active
                </span>
              )}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {languages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleLanguageSelect(lang)}
                  style={{
                    padding: '1rem',
                    fontSize: '1rem',
                    background: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                >
                  {lang}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowLanguageModal(false)}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spotify Linking Prompt Modal */}
      {showSpotifyPrompt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎵</div>
            <h2 style={{ marginBottom: '1rem' }}>Link Your Spotify Account</h2>
            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
              To use face detection and get personalized music recommendations based on your mood, please link your Spotify account.
              This will give you access to emotion-based recommendations and millions of songs!
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={handleLinkSpotify}
                disabled={isLinkingSpotify}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1rem',
                  background: '#1DB954',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: isLinkingSpotify ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: isLinkingSpotify ? 0.7 : 1
                }}
              >
                {isLinkingSpotify ? 'Linking...' : 'Link Spotify'}
              </button>
              <button
                onClick={() => {
                  setShowSpotifyPrompt(false)
                }}
                disabled={isLinkingSpotify}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1rem',
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: isLinkingSpotify ? 'not-allowed' : 'pointer',
                  opacity: isLinkingSpotify ? 0.7 : 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Face Detection Error Modal */}
      {showFaceDetectionError && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'white',
            padding: '2.5rem',
            borderRadius: '15px',
            maxWidth: '550px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📸</div>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.8rem', color: '#333' }}>
              Face Not Detected
            </h2>
            <div style={{ 
              background: '#fff3cd', 
              border: '1px solid #ffc107', 
              borderRadius: '8px', 
              padding: '1rem', 
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}>
              <p style={{ margin: 0, color: '#856404', fontSize: '1rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                <strong>Possible reasons:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#856404', fontSize: '0.95rem', lineHeight: '1.6' }}>
                <li>Your face may not be fully visible in the frame</li>
                <li>Lighting might be too bright or too dim</li>
                <li>The camera may be too close or too far from your face</li>
                <li>Your face might be at an angle or partially obscured</li>
              </ul>
            </div>
            <div style={{ 
              background: '#d1ecf1', 
              border: '1px solid #bee5eb', 
              borderRadius: '8px', 
              padding: '1rem', 
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}>
              <p style={{ margin: 0, color: '#0c5460', fontSize: '1rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                <strong>💡 Tips for better detection:</strong>
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#0c5460', fontSize: '0.95rem', lineHeight: '1.6' }}>
                <li>Ensure your face is well-lit (avoid direct bright light or shadows)</li>
                <li>Position your face directly facing the camera</li>
                <li>Move closer or farther to find the optimal distance</li>
                <li>Remove anything covering your face (masks, hands, etc.)</li>
                <li>Try adjusting your screen brightness or room lighting</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={async () => {
                  setShowFaceDetectionError(false)
                  // Restart camera for another attempt
                  await handleCameraIconClick()
                }}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1rem',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'transform 0.2s ease',
                  boxShadow: '0 4px 8px rgba(76, 175, 80, 0.3)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  setShowFaceDetectionError(false)
                }}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'transform 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
