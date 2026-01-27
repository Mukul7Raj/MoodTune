'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import { musicAPI, authAPI } from '@/lib/api'
import { useRouter, useSearchParams } from 'next/navigation'
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
  imageUrl?: string
  id?: string
}

export default function SearchResults() {
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const { playSong } = useMusicPlayer()
  const [profile, setProfile] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [searchSuggestions, setSearchSuggestions] = useState<Song[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })

  // Get query from URL params
  useEffect(() => {
    const query = searchParams.get('q') || ''
    setSearchQuery(query)
    // Scroll to top when page loads
    window.scrollTo(0, 0)
    if (query.trim()) {
      performSearch(query)
    }
  }, [searchParams])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, authLoading, router])

  // Fetch profile
  useEffect(() => {
    if (user) {
      fetchProfile()
    }
  }, [user])

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

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      setLoading(true)
      const results = await musicAPI.search(query)
      setSearchResults(results)
    } catch (error: any) {
      console.error('Search error:', error)
      alert(error.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setShowSuggestions(false)
      return
    }

    // Hide suggestions immediately when submitting search
    setShowSuggestions(false)
    setSearchSuggestions([])
    
    // Update URL with new query
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    performSearch(searchQuery.trim())
  }

  // Fetch search suggestions as user types (debounced)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!searchQuery.trim()) {
      setSearchSuggestions([])
      setShowSuggestions(false)
      return
    }

    setLoadingSuggestions(true)

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const suggestions = await musicAPI.search(searchQuery)
        setSearchSuggestions(suggestions.slice(0, 5))
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

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  const handleSuggestionClick = (suggestion: Song) => {
    const query = `${suggestion.title} ${suggestion.artist}`.trim()
    setSearchQuery(query)
    // Hide suggestions immediately and clear the array
    setShowSuggestions(false)
    setSearchSuggestions([])
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

  const handleSongClick = (song: Song, allSongs: Song[] = []) => {
    // Check if we can embed (Spotify or JioSaavn with URL)
    const canEmbed = (song.spotifyUri || song.spotifyId) || (song.url && (song.source === 'JioSaavn' || song.source === 'jiosaavn'))
    
    if (canEmbed) {
      // Build play queue from context (search results)
      const songsToPlay = allSongs.length > 0 ? allSongs : searchResults
      
      // Format song data for player
      const songData = {
        id: song.id || song.spotifyUri || song.url,
        title: song.title,
        artist: song.artist || 'Unknown Artist',
        album: song.album,
        spotifyUri: song.spotifyUri,
        spotifyId: (song as any).spotifyId,
        url: song.url,
        imageUrl: song.imageUrl,
        source: song.source || 'Unknown'
      }
      
      // Format queue for player
      const queue = songsToPlay.map(s => ({
        id: s.id || s.spotifyUri || s.url,
        title: s.title,
        artist: s.artist || 'Unknown Artist',
        album: s.album,
        spotifyUri: s.spotifyUri,
        spotifyId: (s as any).spotifyId,
        url: s.url,
        imageUrl: s.imageUrl,
        source: s.source || 'Unknown'
      }))
      
      playSong(songData, queue)
    } else {
      alert('This song cannot be played in the player. Please try another song.')
    }
  }

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  if (authLoading) {
    return <div className={styles.loading}>Loading...</div>
  }

  if (!isAuthenticated) {
    return null
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
          
          <div className={styles.searchContainer}>
            <form onSubmit={handleSearch}>
              <div ref={searchBarRef} className={styles.searchBar}>
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
                  onChange={handleSearchInputChange}
                  onFocus={handleSearchInputFocus}
                  onBlur={(e) => handleSearchInputBlur(e)}
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
                            handleSuggestionClick(suggestion)
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleSuggestionClick(suggestion)
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
                              whiteSpace: 'nowrap'
                            }}>
                              {suggestion.artist}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
                        No results found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </form>
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
        <div className={styles.contentWrapper}>
          {/* Search Results */}
          {loading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner}></div>
              <p>Searching...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className={styles.resultsContainer}>
              <h1 className={styles.resultsTitle}>
                Search results for &quot;{searchQuery}&quot;
              </h1>
              <p className={styles.resultsCount}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
              </p>
              
              <div className={styles.resultsList}>
                {searchResults.map((song, index) => (
                  <div 
                    key={song.id || index} 
                    className={styles.resultItem}
                    onClick={() => handleSongClick(song, searchResults)}
                  >
                    <div className={styles.resultImageContainer}>
                      {song.imageUrl ? (
                        <Image
                          src={song.imageUrl}
                          alt={song.title}
                          width={180}
                          height={180}
                          className={styles.resultImage}
                          unoptimized
                        />
                      ) : (
                        <div className={styles.resultImagePlaceholder}>
                          <Image
                            src="/images/play-icon.png"
                            alt="Play"
                            width={60}
                            height={60}
                            unoptimized
                            style={{ opacity: 0.6 }}
                          />
                        </div>
                      )}
                      <div className={styles.playOverlay}>
                        <Image
                          src="/images/play-icon.png"
                          alt="Play"
                          width={50}
                          height={50}
                          unoptimized
                        />
                      </div>
                    </div>
                    <div className={styles.resultInfo}>
                      <h3 className={styles.resultTitle}>{song.title}</h3>
                      <p className={styles.resultArtist}>{song.artist}</p>
                      {song.album && (
                        <p className={styles.resultAlbum}>{song.album}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : searchQuery.trim() ? (
            <div className={styles.noResults}>
              <div className={styles.noResultsIcon}>🔍</div>
              <h2>No results found</h2>
              <p>Try searching for something else or check your spelling.</p>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🔍</div>
              <h2>Start searching</h2>
              <p>Enter a song name, artist, or album to find music.</p>
            </div>
          )}
        </div>
      </main>

    </div>
  )
}
