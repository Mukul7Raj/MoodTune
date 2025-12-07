'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { emotionAPI, musicAPI, spotifyAPI, featuredAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import HorizontalCarousel from '@/components/HorizontalCarousel'
import MusicPlayer from '@/components/MusicPlayer'
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
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [showLanguageModal, setShowLanguageModal] = useState(false)
  const [showSpotifyPrompt, setShowSpotifyPrompt] = useState(false)
  const [showWellbeingPrompt, setShowWellbeingPrompt] = useState(false)
  const [isLinkingSpotify, setIsLinkingSpotify] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [detectedEmotion, setDetectedEmotion] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<Song[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState<string>('')
  const [wellbeingMode, setWellbeingMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Song[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchSuggestions, setSearchSuggestions] = useState<Song[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [featuredPlaylists, setFeaturedPlaylists] = useState<any[]>([])
  const [trendingSongs, setTrendingSongs] = useState<any[]>([])
  const [artists, setArtists] = useState<any[]>([])
  const [loadingFeatured, setLoadingFeatured] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const [playQueue, setPlayQueue] = useState<Song[]>([])

  const languages = ['Hindi', 'English', 'Bengali', 'Marathi', 'Telugu', 'Tamil']
  
  // Mental well-being triggers (negative emotions)
  const MENTAL_WELLBEING_TRIGGERS = ["sad", "depressed", "angry", "stressed", "fear", "anxious"]

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, authLoading, router])

  // Fetch featured content on mount
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchFeaturedContent()
      // Also fetch trending songs for Recommended Songs section
      fetchTrendingForRecommended()
    }
  }, [isAuthenticated, authLoading])

  const fetchTrendingForRecommended = async () => {
    try {
      setLoadingRecommendations(true)
      const songs = await featuredAPI.getTrendingSongs()
      // Set trending songs as recommendations
      setRecommendations(songs.slice(0, 20)) // Limit to 20 trending songs
    } catch (error) {
      console.error('Error fetching trending songs for recommendations:', error)
      setRecommendations([])
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const fetchFeaturedContent = async () => {
    try {
      setLoadingFeatured(true)
      const [playlists, songs, artistsData] = await Promise.all([
        featuredAPI.getPlaylists().catch(() => []),
        featuredAPI.getTrendingSongs().catch(() => []),
        featuredAPI.getArtists().catch(() => [])
      ])
      setFeaturedPlaylists(playlists)
      setTrendingSongs(songs)
      setArtists(artistsData)
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
      alert('Spotify account linked successfully!')
    } catch (error: any) {
      console.error('Spotify linking error:', error)
      const errorMessage = error.message || 'Failed to link Spotify account'
      alert(`Error: ${errorMessage}\n\nPlease check:\n1. Spotify credentials are configured in backend .env\n2. Redirect URI matches in Spotify app settings\n3. Backend server is running`)
    } finally {
      setIsLinkingSpotify(false)
    }
  }, [refreshUser])

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

  const handleAllowCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      })
      streamRef.current = stream
      setShowCameraModal(false)
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
        alert(result.message || 'No face detected. Please try again.')
      }
    } catch (error: any) {
      console.error('Emotion detection error:', error)
      alert(error.message || 'Failed to detect emotion. Please try again.')
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
      
      setPlayQueue(queue)
      
      // Open in picture-in-picture player
      setCurrentSong({
        id: song.id || song.spotifyUri || song.url,
        title: song.title,
        artist: song.artist || song.subtitle || 'Unknown Artist',
        album: song.album,
        spotifyUri: song.spotifyUri,
        spotifyId: song.spotifyId,
        url: song.url,
        imageUrl: song.imageUrl,
        source: song.source || 'Unknown'
      })
      setShowPlayer(true)
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

  const handlePlayerClose = () => {
    setShowPlayer(false)
    setCurrentSong(null)
  }

  const handleNextSong = () => {
    // Find current song index in queue
    if (!currentSong || playQueue.length === 0) return
    
    const currentIndex = playQueue.findIndex(s => s.id === currentSong.id)
    if (currentIndex < playQueue.length - 1) {
      setCurrentSong(playQueue[currentIndex + 1])
    }
  }

  const handlePreviousSong = () => {
    // Find current song index in queue
    if (!currentSong || playQueue.length === 0) return
    
    const currentIndex = playQueue.findIndex(s => s.id === currentSong.id)
    if (currentIndex > 0) {
      setCurrentSong(playQueue[currentIndex - 1])
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
      // Search for artist's songs
      try {
        setSearchQuery(artistName)
        const results = await musicAPI.search(artistName)
        if (results && results.length > 0) {
          setSearchResults(results)
          setShowSearchResults(true)
          // Scroll to search results
          setTimeout(() => {
            const searchSection = document.getElementById('search-results')
            if (searchSection) {
              searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }, 100)
        } else {
          alert(`No songs found for ${artistName}`)
        }
      } catch (error) {
        console.error('Error searching for artist songs:', error)
        alert(`Could not load songs for ${artistName}`)
      }
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
    if (!detectedEmotion && !selectedLanguage) {
      // Clear recommendations and wellbeing mode, then fetch trending songs
      setRecommendations([])
      setWellbeingMode(false)
      fetchTrendingForRecommended()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedEmotion, selectedLanguage])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setShowSuggestions(false)
      return
    }

    try {
      setShowSuggestions(false)
      const results = await musicAPI.search(searchQuery)
      setSearchResults(results)
      setShowSearchResults(true)
    } catch (error: any) {
      console.error('Search error:', error)
      alert(error.message || 'Search failed')
    }
  }

  // Fetch search suggestions as user types (debounced)
  useEffect(() => {
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
  }, [searchQuery])

  const handleSuggestionClick = async (e: React.MouseEvent, suggestion: Song) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Hide suggestions immediately
    setShowSuggestions(false)
    
    // Update search query and show results (don't play directly)
    const query = `${suggestion.title} ${suggestion.artist}`.trim()
    setSearchQuery(query)
    
    try {
      setLoadingSuggestions(true)
      const results = await musicAPI.search(query)
      setSearchResults(results)
      setShowSearchResults(true)
      setLoadingSuggestions(false)
      
      // Scroll to search results
      setTimeout(() => {
        const searchSection = document.getElementById('search-results')
        if (searchSection) {
          searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } catch (error: any) {
      console.error('Search error:', error)
      setLoadingSuggestions(false)
      alert(error.message || 'Search failed')
    }
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
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowCameraModal(true)
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
            <Image
              src="/images/profile-icon.svg"
              alt="Profile"
              width={53}
              height={53}
              unoptimized
              style={{ pointerEvents: 'none' }}
            />
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
          onClick={() => setShowCameraModal(true)}
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
              onClick={() => {
                setDetectedEmotion(null)
                setSelectedLanguage('')
                setRecommendations([])
                setWellbeingMode(false)
                setShowCameraModal(true)
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

        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <section id="search-results" className={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className={styles.sectionTitle}>Search Results</h2>
              <button 
                onClick={() => {
                  setShowSearchResults(false)
                  setSearchQuery('')
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}
              >
                Close
              </button>
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '53.64px',
              marginLeft: '111px',
              marginRight: '111px',
              maxWidth: 'calc(100vw - 222px)',
              justifyContent: 'flex-start',
              overflowX: 'hidden'
            }}>
              {searchResults.map((song, index) => (
                <div key={song.id || index} className={styles.songCard} style={{ width: '252.38px', flexShrink: 0 }}>
                  <div 
                    onClick={() => handleSongClick(song, searchResults)}
                    style={{ 
                      width: '252.38px', 
                      height: '199px', 
                      borderRadius: '20px',
                      overflow: 'hidden',
                      marginBottom: '11px',
                      background: '#f0f0f0',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {song.imageUrl ? (
                      <Image
                        src={song.imageUrl}
                        alt={song.title}
                        width={252}
                        height={199}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          pointerEvents: 'none'
                        }}
                        unoptimized
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f0f0f0'
                      }}>
                        <Image
                          src="/images/play-icon.png"
                          alt="Play"
                          width={50}
                          height={50}
                          unoptimized
                          style={{ pointerEvents: 'none' }}
                        />
                      </div>
                    )}
                  </div>
                  <p className={styles.songInfo}>
                    {song.title}<br />
                    {song.artist}<br />
                    {song.album && <span style={{ opacity: 0.8 }}>{song.album}</span>}
                  </p>
                </div>
              ))}
            </div>
          </section>
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
        ) : loadingFeatured ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recommended Songs - Most Heard Today</h2>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading trending songs...</div>
          </section>
        ) : (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recommended Songs</h2>
            <div className={styles.featuredSongContainer}>
              <div className={styles.featuredSongImage}>
                <Image
                  src="/images/featured-song-home.png"
                  alt="Featured Song"
                  width={1170}
                  height={331}
                  className={styles.featuredImage}
                  unoptimized
                  priority
                />
                <div className={styles.playButtonOverlay}>
                  <Image
                    src="/images/play-icon-home.svg"
                    alt="Play"
                    width={42}
                    height={42}
                    className={styles.playIcon}
                    unoptimized
                  />
                </div>
              </div>
              <div className={styles.featuredSongInfo}>
                <p className={styles.featuredSongText}>
                  {detectedEmotion && !selectedLanguage 
                    ? "Please select a language to get personalized recommendations!"
                    : "Click the camera icon to detect your mood and get personalized recommendations!"
                  }
                </p>
              </div>
            </div>
            <div className={styles.navArrow}>
              <Image
                src="/images/nav-arrow-1.png"
                alt="Next"
                width={70}
                height={30}
                unoptimized
              />
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

        {/* Industry Section (Trending Songs) */}
        {loadingFeatured ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Industry</h2>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>Loading trending songs...</div>
          </section>
        ) : (
          <HorizontalCarousel
            title="Industry"
            items={trendingSongs.map((song, index) => ({
              ...song,
              subtitle: song.subtitle || song.artist || ''
            }))}
            onItemClick={(item) => {
              handleSongClick(item, trendingSongs)
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

      {/* Music Player - Picture in Picture */}
      <MusicPlayer
        song={currentSong}
        isVisible={showPlayer}
        onClose={handlePlayerClose}
        onNext={playQueue.length > 0 ? handleNextSong : undefined}
        onPrevious={playQueue.length > 0 ? handlePreviousSong : undefined}
        queue={playQueue}
      />

      {/* Footer */}
      <footer className={styles.footer}>
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
              To get personalized music recommendations based on your mood, please link your Spotify account.
              This will give you access to millions of songs and better recommendations!
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
                onClick={async () => {
                  setShowSpotifyPrompt(false)
                  // If language was already selected, fetch recommendations
                  if (selectedLanguage) {
                    await fetchRecommendations(selectedLanguage)
                  } else {
                    // Otherwise, show language selection again
                    setShowLanguageModal(true)
                  }
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
                Maybe Later
              </button>
            </div>
            <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#999' }}>
              You can still use JioSaavn without linking, but Spotify provides better recommendations!
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
