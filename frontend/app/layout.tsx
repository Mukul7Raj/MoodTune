import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { MusicPlayerProvider } from '@/contexts/MusicPlayerContext'
import GlobalMusicPlayer from '@/components/GlobalMusicPlayer'

export const metadata: Metadata = {
  title: 'MoodTune - Home',
  description: 'Discover music that matches your mood',
  icons: {
    icon: '/images/logo.png',
    shortcut: '/images/logo.png',
    apple: '/images/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <MusicPlayerProvider>
            {children}
            <GlobalMusicPlayer />
          </MusicPlayerProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

