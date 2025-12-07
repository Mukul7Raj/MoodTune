'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import styles from './CoverFlowCarousel.module.css'

interface CarouselItem {
  id: string | number
  title: string
  subtitle?: string
  imageUrl?: string
  [key: string]: any
}

interface CoverFlowCarouselProps {
  items: CarouselItem[]
  title: string
  onItemClick?: (item: CarouselItem) => void
  renderItem?: (item: CarouselItem, isActive: boolean) => React.ReactNode
  imageKey?: string
  titleKey?: string
  subtitleKey?: string
}

export default function CoverFlowCarousel({
  items,
  title,
  onItemClick,
  renderItem,
  imageKey = 'imageUrl',
  titleKey = 'title',
  subtitleKey = 'subtitle'
}: CoverFlowCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  const visibleItems = 5 // Number of items visible at once
  const itemWidth = 280 // Width of each item

  useEffect(() => {
    if (items.length > 0 && currentIndex >= items.length) {
      setCurrentIndex(0)
    }
  }, [items.length, currentIndex])

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1))
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    if (carouselRef.current) {
      setStartX(e.pageX - carouselRef.current.offsetLeft)
      setScrollLeft(carouselRef.current.scrollLeft)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !carouselRef.current) return
    e.preventDefault()
    const x = e.pageX - carouselRef.current.offsetLeft
    const walk = (x - startX) * 2
    carouselRef.current.scrollLeft = scrollLeft - walk
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const getItemPosition = (index: number) => {
    const diff = index - currentIndex
    const absDiff = Math.abs(diff)
    
    if (absDiff === 0) {
      return { transform: 'scale(1.1) translateZ(0)', zIndex: 10, opacity: 1 }
    } else if (absDiff === 1) {
      return { 
        transform: `scale(0.9) translateX(${diff * 120}px) translateZ(-50px)`, 
        zIndex: 5, 
        opacity: 0.8 
      }
    } else if (absDiff === 2) {
      return { 
        transform: `scale(0.8) translateX(${diff * 100}px) translateZ(-100px)`, 
        zIndex: 3, 
        opacity: 0.6 
      }
    } else {
      return { 
        transform: `scale(0.7) translateX(${diff * 80}px) translateZ(-150px)`, 
        zIndex: 1, 
        opacity: 0.3 
      }
    }
  }

  const defaultRenderItem = (item: CarouselItem, isActive: boolean) => {
    const imageUrl = item[imageKey] || '/images/play-icon.png'
    const itemTitle = item[titleKey] || 'Unknown'
    const itemSubtitle = item[subtitleKey] || ''

    return (
      <div
        className={`${styles.carouselItem} ${isActive ? styles.active : ''}`}
        onClick={() => onItemClick?.(item)}
        style={{ cursor: onItemClick ? 'pointer' : 'default' }}
      >
        <div className={styles.itemImage}>
          {imageUrl.startsWith('http') || imageUrl.startsWith('/') ? (
            <Image
              src={imageUrl}
              alt={itemTitle}
              width={252}
              height={252}
              className={styles.image}
              unoptimized
            />
          ) : (
            <div className={styles.placeholderImage}>
              <Image
                src="/images/play-icon.png"
                alt="Placeholder"
                width={100}
                height={100}
                unoptimized
              />
            </div>
          )}
        </div>
        <div className={styles.itemInfo}>
          <h3 className={styles.itemTitle}>{itemTitle}</h3>
          {itemSubtitle && <p className={styles.itemSubtitle}>{itemSubtitle}</p>}
        </div>
      </div>
    )
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
            onClick={handlePrev}
            aria-label="Previous"
          >
            ‹
          </button>
          <button 
            className={styles.navButton} 
            onClick={handleNext}
            aria-label="Next"
          >
            ›
          </button>
        </div>
      </div>
      
      <div 
        className={styles.carouselContainer}
        ref={carouselRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className={styles.carouselTrack}>
          {items.map((item, index) => {
            const position = getItemPosition(index)
            const isActive = index === currentIndex
            
            return (
              <div
                key={item.id || index}
                className={styles.carouselItemWrapper}
                style={{
                  ...position,
                  transition: isDragging ? 'none' : 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {renderItem ? renderItem(item, isActive) : defaultRenderItem(item, isActive)}
              </div>
            )
          })}
        </div>
      </div>
      
      <div className={styles.carouselIndicators}>
        {items.slice(0, Math.min(items.length, 10)).map((_, index) => (
          <button
            key={index}
            className={`${styles.indicator} ${index === currentIndex % items.length ? styles.active : ''}`}
            onClick={() => setCurrentIndex(index)}
            aria-label={`Go to item ${index + 1}`}
          />
        ))}
      </div>
    </section>
  )
}

