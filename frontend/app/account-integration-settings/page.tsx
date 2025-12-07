'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { spotifyAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function AccountIntegrationSettings() {
  const { user, refreshUser, isAuthenticated, loading: authLoading } = useAuth()
  const router = useRouter()
  const [spotifyLinked, setSpotifyLinked] = useState(false)
  const [googleLinked, setGoogleLinked] = useState(false)
  const [isLinking, setIsLinking] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, authLoading, router])

  useEffect(() => {
    if (user) {
      setSpotifyLinked(user.spotifyLinked)
    }
  }, [user])

  useEffect(() => {
    // Check for Spotify callback code in URL
    const urlParams = new URLSearchParams(window.location.search)
    const spotifyCode = urlParams.get('spotify_code')
    
    if (spotifyCode) {
      handleSpotifyCallback(spotifyCode)
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleSpotifyCallback = async (code: string) => {
    try {
      setIsLinking(true)
      await spotifyAPI.completeCallback(code)
      await refreshUser()
      alert('Spotify account linked successfully!')
    } catch (error: any) {
      console.error('Spotify linking error:', error)
      alert(error.message || 'Failed to link Spotify account')
    } finally {
      setIsLinking(false)
    }
  }

  const handleSpotifyLink = async () => {
    if (spotifyLinked) {
      // Unlink Spotify (you may want to add an API endpoint for this)
      setSpotifyLinked(false)
      alert('Spotify account unlinked')
      return
    }

    try {
      setIsLinking(true)
      const { url } = await spotifyAPI.getLoginUrl()
      // Open Spotify OAuth in the same window
      window.location.href = url
    } catch (error: any) {
      console.error('Failed to get Spotify login URL:', error)
      alert(error.message || 'Failed to initiate Spotify linking')
      setIsLinking(false)
    }
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
              src="/images/camera-icon-home.svg"
              alt="Camera"
              width={58}
              height={53}
              unoptimized
            />
          </div>
          
          <Link href="/personalization-settings" className={styles.settingsIcon}>
            <Image
              src="/images/settings-icon.svg"
              alt="Settings"
              width={65}
              height={65}
              unoptimized
            />
          </Link>
          
          <Link href="/edit-profile" className={styles.profileIcon}>
            <Image
              src="/images/profile-icon.svg"
              alt="Profile"
              width={53}
              height={53}
              unoptimized
            />
          </Link>
        </div>
      </header>

      {/* Settings Section */}
      <section className={styles.settingsSection}>
        <div className={styles.settingsContent}>
          <h1 className={styles.settingsTitle}>Settings</h1>
          
          <div className={styles.profileSection}>
            <div className={styles.profileImageContainer}>
              <Image
                src="/images/profile-emily.png"
                alt="Emily Carter"
                width={331}
                height={332}
                className={styles.profileImage}
                unoptimized
              />
            </div>
            
            <div className={styles.profileInfo}>
              <h2 className={styles.profileName}>Emily Carter</h2>
              <p className={styles.profileUsername}>@emilytheone</p>
              <p className={styles.profileBio}>
                Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.
              </p>
            </div>
            
            <Link href="/edit-profile" className={styles.editButton}>
              Edit
            </Link>
          </div>

          {/* Navigation Tabs */}
          <nav className={styles.navTabs}>
            <Link href="/personalization-settings" className={styles.navTab}>
              Personalization
            </Link>
            <Link href="/privacy-security-settings" className={styles.navTab}>
              Privacy & Security
            </Link>
            <Link href="/account-integration-settings" className={styles.navTabActive}>
              Account & Integration
            </Link>
            <Link href="/app-experience-settings" className={styles.navTab}>
              App Experience
            </Link>
          </nav>
        </div>
      </section>

      {/* Main Content */}
      <main className={styles.mainContent}>
        <div className={styles.settingsContainer}>
          {/* Spotify Account Card */}
          <div className={styles.settingCard}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>
                {spotifyLinked ? 'Unlink Spotify Account' : 'Link Spotify Account'}
              </span>
              {isLinking ? (
                <span>Linking...</span>
              ) : (
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={spotifyLinked}
                    onChange={handleSpotifyLink}
                />
                <span className={styles.toggleSlider}></span>
              </label>
              )}
            </div>
            {spotifyLinked && user?.spotifyUser && (
              <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#f0f0f0', borderRadius: '5px' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  Connected as: <strong>{user.spotifyUser.name}</strong>
                </p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#666' }}>
                  {user.spotifyUser.email}
                </p>
              </div>
            )}
          </div>

          {/* Unlink Google Account Card */}
          <div className={styles.settingCard}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Unlink Google Account</span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={googleLinked}
                  onChange={(e) => setGoogleLinked(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.copyright}>
          Copyright © 2025 MoodTune - Your emotional Uplift. All Rights Reserved.
        </p>
      </footer>
    </div>
  )
}

