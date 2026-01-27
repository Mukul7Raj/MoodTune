'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

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

interface MusicPlayerContextType {
  currentSong: Song | null
  showPlayer: boolean
  playQueue: Song[]
  setCurrentSong: (song: Song | null) => void
  setShowPlayer: (show: boolean) => void
  setPlayQueue: (queue: Song[]) => void
  playSong: (song: Song, queue?: Song[]) => void
  closePlayer: () => void
  playNext: () => void
  playPrevious: () => void
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined)

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const [playQueue, setPlayQueue] = useState<Song[]>([])

  // Persist player state to sessionStorage
  useEffect(() => {
    if (showPlayer && currentSong) {
      sessionStorage.setItem('musicPlayerState', JSON.stringify({
        isVisible: true,
        songId: currentSong.id || currentSong.spotifyUri || currentSong.url,
        timestamp: Date.now()
      }))
    } else {
      sessionStorage.removeItem('musicPlayerState')
    }
  }, [showPlayer, currentSong])

  // Restore player state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedState = sessionStorage.getItem('musicPlayerState')
      if (savedState) {
        try {
          const state = JSON.parse(savedState)
          // Only restore if state is recent (within last 5 minutes)
          if (Date.now() - state.timestamp < 5 * 60 * 1000) {
            // State will be restored by the component that needs it
            // We just ensure the sessionStorage is maintained
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, [])

  const playSong = (song: Song, queue: Song[] = []) => {
    setCurrentSong(song)
    setPlayQueue(queue)
    setShowPlayer(true)
    sessionStorage.setItem('musicPlayerState', JSON.stringify({
      isVisible: true,
      songId: song.id || song.spotifyUri || song.url,
      timestamp: Date.now()
    }))
  }

  const closePlayer = () => {
    setShowPlayer(false)
    setCurrentSong(null)
    setPlayQueue([])
    sessionStorage.removeItem('musicPlayerState')
  }

  const playNext = () => {
    if (!currentSong || playQueue.length === 0) return
    
    const currentIndex = playQueue.findIndex(
      s => (s.id || s.spotifyUri || s.url) === (currentSong.id || currentSong.spotifyUri || currentSong.url)
    )
    if (currentIndex < playQueue.length - 1) {
      setCurrentSong(playQueue[currentIndex + 1])
    }
  }

  const playPrevious = () => {
    if (!currentSong || playQueue.length === 0) return
    
    const currentIndex = playQueue.findIndex(
      s => (s.id || s.spotifyUri || s.url) === (currentSong.id || currentSong.spotifyUri || currentSong.url)
    )
    if (currentIndex > 0) {
      setCurrentSong(playQueue[currentIndex - 1])
    }
  }

  return (
    <MusicPlayerContext.Provider
      value={{
        currentSong,
        showPlayer,
        playQueue,
        setCurrentSong,
        setShowPlayer,
        setPlayQueue,
        playSong,
        closePlayer,
        playNext,
        playPrevious
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext)
  if (context === undefined) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider')
  }
  return context
}
