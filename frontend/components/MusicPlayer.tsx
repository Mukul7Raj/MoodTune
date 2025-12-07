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
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [progress, setProgress] = useState(0)
  const playerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize position on mount
  useEffect(() => {
    if (isVisible && typeof window !== 'undefined') {
      setPosition({
        x: window.innerWidth - 420,
        y: window.innerHeight - 500
      })
    }
  }, [isVisible])

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
    if (song) {
      setIsPlaying(true)
      setProgress(0)
      // Reset progress tracking
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
      // Simulate progress (in real implementation, this would come from the player)
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
            }
            return 100
          }
          return prev + 0.5
        })
      }, 1000)
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
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

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying)
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

      {!isMinimized && (
        <>
          {/* Player Content */}
          <div className={styles.playerContent}>
            {embedUrl ? (
              embedUrl.includes('spotify.com') ? (
                <iframe
                  ref={iframeRef}
                  src={embedUrl}
                  width="100%"
                  height="352"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  style={{
                    borderRadius: '8px',
                    border: 'none'
                  }}
                />
              ) : (
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
              )
            ) : (
              <div className={styles.noEmbed}>
                <p>Unable to embed this song.</p>
                <p>Please use the external link to play.</p>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Player Controls */}
          <div className={styles.playerControls}>
            <button
              onClick={onPrevious}
              className={styles.controlButton}
              disabled={!onPrevious}
              aria-label="Previous"
            >
              ⏮
            </button>
            <button
              onClick={togglePlayPause}
              className={styles.playButton}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              onClick={onNext}
              className={styles.controlButton}
              disabled={!onNext}
              aria-label="Next"
            >
              ⏭
            </button>
          </div>
        </>
      )}
    </div>
  )
}

