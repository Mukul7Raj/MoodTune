'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import styles from './page.module.css'

export default function AppExperienceSettings() {
  const [addToHome, setAddToHome] = useState(false)
  const [notification, setNotification] = useState(false)

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
            <Link href="/account-integration-settings" className={styles.navTab}>
              Account & Integration
            </Link>
            <Link href="/app-experience-settings" className={styles.navTabActive}>
              App Experience
            </Link>
          </nav>
        </div>
      </section>

      {/* Main Content */}
      <main className={styles.mainContent}>
        <div className={styles.settingsContainer}>
          {/* Add to Home Card */}
          <div className={styles.settingCard}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Add to Home</span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={addToHome}
                  onChange={(e) => setAddToHome(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>

          {/* Notification Card */}
          <div className={styles.settingCard}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Notification</span>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={notification}
                  onChange={(e) => setNotification(e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>

          {/* Feedback and Support Card */}
          <div className={styles.settingCard}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Feedback</span>
              <span className={styles.settingLabelRight}>Support</span>
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

