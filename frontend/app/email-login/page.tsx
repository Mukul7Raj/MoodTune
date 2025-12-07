'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import styles from './page.module.css'

export default function EmailLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    setIsLoading(true)

    try {
      await login(email, password)
      // Check if there's a Spotify code to handle after login
      const spotifyCode = typeof window !== 'undefined' ? sessionStorage.getItem('spotify_code') : null
      if (spotifyCode) {
        router.push(`/home?spotify_code=${spotifyCode}`)
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('spotify_code')
        }
      } else {
        // On successful login, redirect to home page
        router.push('/home')
      }
    } catch (error: any) {
      console.error('Login error:', error)
      setError(error.message || 'Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* Main content container */}
      <div className={styles.mainContainer}>
        {/* Left side content */}
        <div className={styles.leftContent}>
          <h1 className={styles.title}>Login</h1>
          
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ color: 'red', marginBottom: '1rem', fontSize: '0.9rem' }}>
                {error}
              </div>
            )}
            
            {/* Email input field */}
            <div className={styles.inputGroup}>
              <label className={styles.label}>Enter Your Email Address</label>
              <input 
                type="email" 
                className={styles.inputField}
                placeholder=""
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {/* Password input field */}
            <div className={styles.inputGroup}>
              <label className={styles.label}>Enter the Password</label>
              <input 
                type="password" 
                className={styles.inputField}
                placeholder=""
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {/* Arrow button */}
            <button 
              type="submit"
              className={styles.arrowButton}
              disabled={isLoading}
            >
              <Image
                src="/images/arrow-up-login.svg"
                alt="Arrow up"
                width={123}
                height={123}
                className={styles.arrowButtonImage}
                unoptimized
              />
            </button>
          </form>
        </div>

        {/* Right side image */}
        <div className={styles.rightImage}>
          <Image
            src="/images/email-login-background.png"
            alt="Email login background"
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

