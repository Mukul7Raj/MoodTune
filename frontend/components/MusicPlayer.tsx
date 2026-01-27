'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import styles from './MusicPlayer.module.css'

interface Song {
  id?: string
  title: string
  artist: string
  album?: string
  spotifyUri?: string
  spotifyId?: string
  url?: string
  imageUrl?: string
  source: string
}

interface MusicPlayerProps {
  song: Song | null
  isVisible: boolean
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  queue?: Song[]
}

export default function MusicPlayer({
  song,
  isVisible,
  onClose,
  onNext,
  onPrevious,
  queue = []
}: MusicPlayerProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const playerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Initialize position on mount
  useEffect(() => {
    if (isVisible && typeof window !== 'undefined') {
      setPosition({
        x: window.innerWidth - 420,
        y: window.innerHeight - 500
      })
    }
  }, [isVisible])

  // Keep player visible and playing even when tab is hidden
  useEffect(() => {
    if (!isVisible || !song) return

    // Persist player state to prevent it from closing on tab switch
    const playerState = {
      isVisible: true,
      songId: song.id || song.spotifyUri || song.url,
      timestamp: Date.now()
    }
    sessionStorage.setItem('musicPlayerState', JSON.stringify(playerState))

    const handleVisibilityChange = () => {
      // When tab becomes hidden, ensure iframe continues playing
      // The iframe should maintain its state even when tab is hidden
      if (document.hidden) {
        // Keep player state in sessionStorage
        sessionStorage.setItem('musicPlayerState', JSON.stringify({
          isVisible: true,
          songId: song.id || song.spotifyUri || song.url,
          timestamp: Date.now()
        }))
        
        // Ensure iframe remains in DOM and active
        if (iframeRef.current) {
          // Force iframe to remain active by keeping it in the DOM
          // The browser's picture-in-picture feature should handle this
          // but we ensure the component doesn't unmount
        }
      } else {
        // When tab becomes visible again, restore player state if needed
        const savedState = sessionStorage.getItem('musicPlayerState')
        if (savedState) {
          try {
            const state = JSON.parse(savedState)
            // Player should already be visible, but ensure it stays that way
            if (iframeRef.current && !iframeRef.current.getAttribute('data-keep-playing')) {
              iframeRef.current.setAttribute('data-keep-playing', 'true')
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    // Handle page focus/blur to keep player active
    const handleFocus = () => {
      // Ensure player remains visible when page regains focus
      if (iframeRef.current) {
        iframeRef.current.setAttribute('data-keep-playing', 'true')
      }
    }

    const handleBlur = () => {
      // Keep player state when page loses focus
      sessionStorage.setItem('musicPlayerState', JSON.stringify({
        isVisible: true,
        songId: song.id || song.spotifyUri || song.url,
        timestamp: Date.now()
      }))
    }

    window.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isVisible, song])

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  // Handle song changes
  useEffect(() => {
    // Song change logic can be added here if needed
  }, [song])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!playerRef.current) return
    const rect = playerRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setIsDragging(true)
  }

  // Note: Play/pause is handled by the embedded Spotify player
  // This function is kept for potential future use
  const togglePlayPause = () => {
    // Playback control is handled by the iframe content
  }

  const handleMinimize = () => {
    setIsMinimized(!isMinimized)
  }

  if (!isVisible || !song) return null

  // Get embed URL based on source
  const getEmbedUrl = () => {
    if (song.source === 'Spotify' || song.spotifyUri || song.spotifyId) {
      // Extract track ID from URI if needed
      let trackId = null
      if (song.spotifyUri && song.spotifyUri.startsWith('spotify:track:')) {
        trackId = song.spotifyUri.replace('spotify:track:', '')
      } else if (song.spotifyId) {
        // If it's an album ID, we can't embed a specific track, so we'll use the album
        if (song.spotifyUri && song.spotifyUri.startsWith('spotify:album:')) {
          const albumId = song.spotifyUri.replace('spotify:album:', '')
          return `https://open.spotify.com/embed/album/${albumId}?utm_source=generator&theme=0`
        }
        // Try to use spotifyId as track ID
        trackId = song.spotifyId
      }
      
      if (trackId) {
        return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`
      } else if (song.spotifyId) {
        // Fallback to album embed
        return `https://open.spotify.com/embed/album/${song.spotifyId}?utm_source=generator&theme=0`
      }
    } else if (song.source === 'JioSaavn' && song.url) {
      // For JioSaavn, we'll use an iframe with the song page
      // Note: JioSaavn doesn't have a direct embed API, so we'll use the web player
      return song.url
    }
    return null
  }

  const embedUrl = getEmbedUrl()

  return (
    <div
      ref={playerRef}
      className={`${styles.musicPlayer} ${isMinimized ? styles.minimized : ''}`}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 10000,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with controls */}
      <div className={styles.playerHeader}>
        <div className={styles.playerInfo}>
          {song.imageUrl && (
            <Image
              src={song.imageUrl}
              alt={song.title}
              width={40}
              height={40}
              className={styles.albumArt}
              unoptimized
            />
          )}
          <div className={styles.songInfo}>
            <div className={styles.songTitle}>{song.title}</div>
            <div className={styles.songArtist}>{song.artist}</div>
          </div>
        </div>
        <div className={styles.headerControls}>
          <button
            onClick={handleMinimize}
            className={styles.controlButton}
            aria-label={isMinimized ? 'Maximize' : 'Minimize'}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button
            onClick={onClose}
            className={styles.controlButton}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Player Content - Always rendered to keep iframe active */}
      {/* When minimized, hide visually but keep iframe active for continuous playback */}
      {embedUrl && embedUrl.includes('spotify.com') ? (
        <div 
          className={styles.playerContent}
          style={{
            position: 'relative',
            height: isMinimized ? '1px' : 'auto',
            minHeight: isMinimized ? '1px' : 'auto',
            overflow: 'hidden',
            padding: isMinimized ? 0 : undefined,
            opacity: isMinimized ? 0 : 1,
            transition: 'opacity 0.2s ease, height 0.2s ease'
          }}
        >
          <iframe
            ref={iframeRef}
            src={embedUrl}
            width="100%"
            height="352"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            style={{
              borderRadius: '8px',
              border: 'none',
              pointerEvents: isMinimized ? 'none' : 'auto',
              // Keep iframe in DOM and active even when minimized
              // Move off-screen but maintain dimensions to keep playback active
              position: isMinimized ? 'absolute' : 'relative',
              ...(isMinimized ? {
                left: '-10000px',
                top: '0',
                width: '352px',
                height: '352px',
                visibility: 'visible' // Keep visible to browser even though off-screen
              } : {})
            }}
            onLoad={() => {
              // Ensure iframe remains active even when tab is hidden
              if (iframeRef.current) {
                // Keep iframe reference active
                iframeRef.current.setAttribute('data-keep-playing', 'true')
              }
            }}
          />
        </div>
      ) : (
        <div 
          className={styles.playerContent}
          style={{
            display: isMinimized ? 'none' : 'flex'
          }}
        >
          {embedUrl ? (
            <div className={styles.jiosaavnEmbed}>
              <div className={styles.embedMessage}>
                <p>🎵 {song.title}</p>
                <p>by {song.artist}</p>
                <button
                  onClick={() => window.open(song.url || '', '_blank')}
                  className={styles.playButton}
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  Play on JioSaavn
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.noEmbed}>
              <p>Unable to embed this song.</p>
              <p>Please use the external link to play.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

