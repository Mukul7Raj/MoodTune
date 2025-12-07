'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Image from 'next/image'
import Link from 'next/link'
import styles from './page.module.css'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, loading: authLoading } = useAuth()

  useEffect(() => {
    // Check for Spotify callback code in URL
    const urlParams = new URLSearchParams(window.location.search)
    const spotifyCode = urlParams.get('spotify_code')
    
    if (spotifyCode) {
      // If authenticated, redirect to home page with the code
      if (isAuthenticated) {
        router.push(`/home?spotify_code=${spotifyCode}`)
        return
      } else {
        // If not authenticated, store code and redirect to login
        // After login, redirect to home with code
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('spotify_code', spotifyCode)
        }
        router.push('/login')
        return
      }
    }
    
    // If authenticated and no callback, redirect to home
    if (isAuthenticated && !authLoading) {
      router.push('/home')
    }
  }, [isAuthenticated, authLoading, router])

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/" className={styles.logoContainer}>
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
            <div className={styles.searchBar}>
                <Image
                  src="/images/search-icon.png"
                  alt="Search"
                  width={51}
                  height={30}
                  className={styles.searchIcon}
                  unoptimized
                />
              <span className={styles.searchText}>Search</span>
            </div>
          </div>
          
          <div className={styles.cameraIcon}>
            <Image
              src="/images/camera-icon.png"
              alt="Camera"
              width={65}
              height={65}
              unoptimized
            />
          </div>
          
          <Link href="/signup" className={styles.signupButton}>
            Signup
          </Link>
          <Link href="/login" className={styles.loginButton}>
            Login
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Recommended Songs Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recommended Songs</h2>
          <div className={styles.featuredSongContainer}>
            <div className={styles.featuredSongImage}>
              <Image
                src="/images/featured-song.png"
                alt="Featured Song"
                width={1170}
                height={331}
                className={styles.featuredImage}
                unoptimized
                priority
              />
              <div className={styles.playButtonOverlay}>
                <Image
                  src="/images/play-icon.png"
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
                Song: Dance Basanti<br />
                Singer: Arijjit Singh<br />
                Movie: Ungli
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

        {/* Artist List Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Artist List</h2>
          <div className={styles.artistList}>
            <div className={styles.artistCard}>
              <div className={styles.artistImage}>
                <Image
                  src="/images/artist-arijit-circle.png"
                  alt="Arijit Singh"
                  width={226}
                  height={217}
                  className={styles.artistImg}
                  unoptimized
                />
              </div>
              <p className={styles.artistName}>Arijit Singh</p>
            </div>
            <div className={styles.artistCard}>
              <div className={styles.artistImage}>
                <Image
                  src="/images/artist-sonu-circle.png"
                  alt="Sonu Nigam"
                  width={226}
                  height={217}
                  className={styles.artistImg}
                  unoptimized
                />
              </div>
              <p className={styles.artistName}>Sonu Nigam</p>
            </div>
            <div className={styles.artistCard}>
              <div className={styles.artistImage}>
                <Image
                  src="/images/artist-shreya-circle.png"
                  alt="Shreya Ghoshal"
                  width={226}
                  height={217}
                  className={styles.artistImg}
                  unoptimized
                />
              </div>
              <p className={styles.artistName}>Shreya Ghoshal</p>
            </div>
            <div className={styles.artistCard}>
              <div className={styles.artistImage}>
                <Image
                  src="/images/artist-atif-circle.png"
                  alt="Atif Aslam"
                  width={226}
                  height={217}
                  className={styles.artistImg}
                  unoptimized
                />
              </div>
              <p className={styles.artistName}>Atif Aslam</p>
            </div>
          </div>
          <div className={styles.navArrow}>
            <Image
              src="/images/nav-arrow-2.png"
              alt="Next"
              width={70}
              height={30}
              unoptimized
            />
          </div>
        </section>

        {/* Industry Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Industry</h2>
          <div className={styles.songGrid}>
            <div className={styles.songCard}>
              <Image
                src="/images/song-1.png"
                alt="Song 1"
                width={252}
                height={199}
                className={styles.songImage}
                unoptimized
              />
              <p className={styles.songInfo}>
                Song: Blue Eyes<br />
                Singer: Honey Singh<br />
                Album Song
              </p>
            </div>
            <div className={styles.songCard}>
              <Image
                src="/images/song-2.png"
                alt="Song 2"
                width={252}
                height={199}
                className={styles.songImage}
                unoptimized
              />
              <p className={styles.songInfo}>
                Song: Photograph<br />
                Singer: Ed Sheeran<br />
                Album Song
              </p>
            </div>
            <div className={styles.songCard}>
              <Image
                src="/images/song-3.png"
                alt="Song 3"
                width={252}
                height={199}
                className={styles.songImage}
                unoptimized
              />
              <p className={styles.songInfo}>
                Song: Dil Jhoom<br />
                Singer: Arijjit Singh<br />
                Movie: Gadar 2
              </p>
            </div>
            <div className={styles.songCard}>
              <Image
                src="/images/song-4.png"
                alt="Song 4"
                width={252}
                height={199}
                className={styles.songImage}
                unoptimized
              />
              <p className={styles.songInfo}>
                Song: APT<br />
                Singer: Rose & Bruno Mars<br />
                Album Song
              </p>
            </div>
          </div>
          <div className={styles.navArrow}>
            <Image
              src="/images/nav-arrow-3.png"
              alt="Next"
              width={70}
              height={30}
              unoptimized
            />
          </div>
        </section>

        {/* Playlists Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Playlists</h2>
          <div className={styles.playlistGrid}>
            <div className={styles.playlistCard}>
              <Image
                src="/images/playlist-1.png"
                alt="India's hit"
                width={252}
                height={202}
                className={styles.playlistImage}
                unoptimized
              />
              <p className={styles.playlistName}>India's hit</p>
            </div>
            <div className={styles.playlistCard}>
              <Image
                src="/images/playlist-2.png"
                alt="International Hiits"
                width={252}
                height={202}
                className={styles.playlistImage}
                unoptimized
              />
              <p className={styles.playlistName}>International Hiits</p>
            </div>
            <div className={styles.playlistCard}>
              <Image
                src="/images/playlist-3.png"
                alt="Divine Journey"
                width={253}
                height={202}
                className={styles.playlistImage}
                unoptimized
              />
              <p className={styles.playlistName}>Divine Journey</p>
            </div>
            <div className={styles.playlistCard}>
              <Image
                src="/images/playlist-4.png"
                alt="Romantic Hits"
                width={254}
                height={202}
                className={styles.playlistImage}
                unoptimized
              />
              <p className={styles.playlistName}>Romantic Hits</p>
            </div>
          </div>
          <div className={styles.navArrow}>
            <Image
              src="/images/nav-arrow-4.png"
              alt="Next"
              width={70}
              height={30}
              unoptimized
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.copyright}>
          Copyright © 2025 MoodTune. All Rights Reserved.
        </p>
      </footer>
    </div>
  )
}

