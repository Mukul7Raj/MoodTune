'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function PrivacySecuritySettings() {
  const [cameraAccess, setCameraAccess] = useState(true)
  const [clearHistory, setClearHistory] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const router = useRouter()

  const handleDeleteAccount = async () => {
    try {
      // Delete account from backend
      // In a real app, this would call an API endpoint to delete the account
      // Example: await fetch('/api/account/delete', { method: 'DELETE' })
      
      // For now, we'll simulate the deletion process
      // In production, you would:
      // 1. Call your API to delete the account
      // 2. Clear any local storage/session data
      // 3. Clear authentication tokens
      // 4. Redirect to sign-up page
      
      // Clear any local storage
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
      }
      
      // Close the modal
      setShowDeleteModal(false)
      
      // Redirect to sign-up page (user account is deleted and logged out)
      router.push('/signup')
    } catch (error) {
      console.error('Error deleting account:', error)
      // In a real app, you would show an error message to the user
      alert('Failed to delete account. Please try again.')
    }
  }

  const handleLogout = () => {
    // Logout user
    // In a real app, this would clear session/tokens
    // For now, we'll just redirect to the login page
    router.push('/login')
  }

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false)
  }

  const handleCloseLogoutModal = () => {
    setShowLogoutModal(false)
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
            <Link href="/privacy-security-settings" className={styles.navTabActive}>
              Privacy & Security
            </Link>
            <Link href="/account-integration-settings" className={styles.navTab}>
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
          {/* Camera Access Card */}
          <div className={styles.settingCard}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Camera Access</span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={cameraAccess}
                  onChange={(e) => setCameraAccess(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>

          {/* Clear listening History Card */}
          <div className={styles.settingCard}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Clear listening History</span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={clearHistory}
                  onChange={(e) => setClearHistory(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>

          {/* Delete Account Card */}
          <div className={styles.settingCard} onClick={() => setShowDeleteModal(true)}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Delete Account</span>
            </div>
          </div>

          {/* Log Out Card */}
          <button className={styles.settingCardLogOut} onClick={() => setShowLogoutModal(true)}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabelLogOut}>Log Out</span>
            </div>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.copyright}>
          Copyright © 2025 MoodTune - Your emotional Uplift. All Rights Reserved.
        </p>
      </footer>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={handleCloseDeleteModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={handleCloseDeleteModal}>
              <svg width="38" height="40" viewBox="0 0 38 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="19" cy="20" r="19" fill="rgba(193, 229, 255, 0.5)"/>
                <path d="M14.35 14.35L23.65 23.65M23.65 14.35L14.35 23.65" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            <p className={styles.modalText}>
              We'll miss having you here.<br />
              Are you sure you want to leave MoodTune so soon
            </p>

            <div className={styles.modalButtons}>
              <button className={styles.laterButton} onClick={handleCloseDeleteModal}>
                Later
              </button>
              <button className={styles.deleteButton} onClick={handleDeleteAccount}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Out Modal */}
      {showLogoutModal && (
        <div className={styles.modalOverlay} onClick={handleCloseLogoutModal}>
          <div className={styles.modalContentLogout} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButtonLogout} onClick={handleCloseLogoutModal}>
              <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="19" cy="19" r="19" fill="rgba(193, 229, 255, 0.5)"/>
                <path d="M14.35 14.35L23.65 23.65M23.65 14.35L14.35 23.65" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            <p className={styles.modalTextLogout}>
              Everything okay<br />
              Do you want to leave MoodTune now
            </p>

            <div className={styles.modalButtonsLogout}>
              <button className={styles.laterButtonLogout} onClick={handleCloseLogoutModal}>
                Later
              </button>
              <button className={styles.logoutButton} onClick={handleLogout}>
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

