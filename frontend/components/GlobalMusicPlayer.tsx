'use client'

import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import MusicPlayer from './MusicPlayer'

export default function GlobalMusicPlayer() {
  const { currentSong, showPlayer, playQueue, closePlayer, playNext, playPrevious } = useMusicPlayer()

  return (
    <MusicPlayer
      song={currentSong}
      isVisible={showPlayer}
      onClose={closePlayer}
      onNext={playQueue.length > 0 ? playNext : undefined}
      onPrevious={playQueue.length > 0 ? playPrevious : undefined}
      queue={playQueue}
    />
  )
}
