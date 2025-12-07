'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function EditProfile() {
  const router = useRouter()

  const handleCancel = () => {
    router.back()
  }

  const handleSave = () => {
    // TODO: Implement save functionality
    router.back()
  }

  return (
    <div className={styles.container}>
      <div className={styles.mainContainer}>
        {/* Profile Image */}
        <div className={styles.profileImageContainer}>
          <Image
            src="/images/profile-edit-image-453fd6.png"
            alt="Profile"
            width={270}
            height={269}
            className={styles.profileImage}
            unoptimized
          />
        </div>

        {/* Form Fields */}
        <div className={styles.formContainer}>
          {/* First Name */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>First Name</label>
            <input
              type="text"
              className={styles.input}
              placeholder=""
            />
          </div>

          {/* Username */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Username</label>
            <input
              type="text"
              className={styles.input}
              placeholder=""
            />
          </div>

          {/* Email */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              className={styles.input}
              placeholder=""
            />
          </div>

          {/* Phone Number */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Phone Number</label>
            <input
              type="tel"
              className={styles.input}
              placeholder=""
            />
          </div>

          {/* Bio */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Bio</label>
            <textarea
              className={styles.textarea}
              placeholder=""
              rows={4}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={handleCancel}>
            CANCEL
          </button>
          <button className={styles.saveButton} onClick={handleSave}>
            SAVE
          </button>
        </div>
      </div>
    </div>
  )
}

