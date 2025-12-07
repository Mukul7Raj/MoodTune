'use client'

import Image from 'next/image'
import Link from 'next/link'
import styles from './page.module.css'

export default function Signup() {
  return (
    <div className={styles.container}>
      {/* Main content container */}
      <div className={styles.mainContainer}>
        {/* Left side content */}
        <div className={styles.leftContent}>
          <h1 className={styles.title}>
            Create your account and start tuning in
          </h1>
          
          <div className={styles.continueSection}>
            <p className={styles.continueText}>Continue with</p>
            <div className={styles.arrowIcon}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.5 9L22.5 18L13.5 27M22.5 18H4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <Link href="/email-signup" className={styles.emailPasswordButton}>
            Email & Password
          </Link>
        </div>

        {/* Right side image */}
        <div className={styles.rightImage}>
          <Image
            src="/images/signup-background.png"
            alt="Signup background"
            width={796}
            height={1157}
            className={styles.backgroundImage}
            unoptimized
            priority
          />
          {/* Close button on top right of image */}
          <Link href="/" className={styles.closeButton}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}

