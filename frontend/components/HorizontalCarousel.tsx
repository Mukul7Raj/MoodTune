'use client'

import { useRef } from 'react'
import Image from 'next/image'
import styles from './HorizontalCarousel.module.css'

interface CarouselItem {
  id: string | number
  title: string
  subtitle?: string
  imageUrl?: string
  [key: string]: any
}

interface HorizontalCarouselProps {
  items: CarouselItem[]
  title: string
  onItemClick?: (item: CarouselItem) => void
  imageKey?: string
  titleKey?: string
  subtitleKey?: string
  itemWidth?: number
  itemHeight?: number
  circularImages?: boolean // For artist images
}

export default function HorizontalCarousel({
  items,
  title,
  onItemClick,
  imageKey = 'imageUrl',
  titleKey = 'title',
  subtitleKey = 'subtitle',
  itemWidth = 252,
  itemHeight = 199,
  circularImages = false
}: HorizontalCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -itemWidth - 20, behavior: 'smooth' })
    }
  }

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: itemWidth + 20, behavior: 'smooth' })
    }
  }

  if (items.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <div className={styles.emptyState}>No items available</div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <div className={styles.navigationButtons}>
          <button 
            className={styles.navButton} 
            onClick={scrollLeft}
            aria-label="Scroll left"
          >
            ‹
          </button>
          <button 
            className={styles.navButton} 
            onClick={scrollRight}
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      </div>
      
      <div className={styles.carouselContainer} ref={scrollContainerRef}>
        <div className={styles.carouselTrack}>
          {items.map((item, index) => {
            const imageUrl = item[imageKey] || '/images/play-icon.png'
            const itemTitle = item[titleKey] || 'Unknown'
            const itemSubtitle = item[subtitleKey] || ''
            
            // Truncate title if too long (max 30 characters)
            const truncatedTitle = itemTitle.length > 30 ? itemTitle.substring(0, 27) + '...' : itemTitle
            const truncatedSubtitle = itemSubtitle.length > 35 ? itemSubtitle.substring(0, 32) + '...' : itemSubtitle

            return (
              <div
                key={item.id || index}
                className={styles.carouselItem}
                onClick={() => onItemClick?.(item)}
                style={{ 
                  cursor: onItemClick ? 'pointer' : 'default',
                  '--item-width': `${itemWidth}px`
                } as React.CSSProperties}
              >
                <div 
                  className={`${styles.itemImage} ${circularImages ? styles.circular : ''}`}
                  style={{ width: itemWidth, height: itemHeight }}
                >
                  {imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/')) ? (
                    <Image
                      src={imageUrl}
                      alt={truncatedTitle}
                      width={itemWidth}
                      height={itemHeight}
                      className={styles.image}
                      unoptimized
                    />
                  ) : (
                    <div className={styles.placeholderImage}>
                      <Image
                        src="/images/play-icon.png"
                        alt="Placeholder"
                        width={50}
                        height={50}
                        unoptimized
                      />
                    </div>
                  )}
                </div>
                <div className={styles.itemInfo} style={{ '--item-width': `${itemWidth}px` } as React.CSSProperties}>
                  <h3 className={styles.itemTitle} title={itemTitle}>{truncatedTitle}</h3>
                  {itemSubtitle && <p className={styles.itemSubtitle} title={itemSubtitle}>{truncatedSubtitle}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

