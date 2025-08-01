/**
 * Centralized audio management utility
 * Handles audio lifecycle, memory cleanup, and prevents multiple audio playback issues
 */

interface AudioInstance {
  id: string
  audio: HTMLAudioElement
  url: string
  cleanup: () => void
}

class AudioManager {
  private instances = new Map<string, AudioInstance>()
  private currentPlayingId: string | null = null
  private globalVolume = 1.0

  /**
   * Create a new audio instance with proper cleanup
   */
  createAudio(id: string, url: string, options?: {
    volume?: number
    onEnded?: () => void
    onError?: (error: Event) => void
    onLoadStart?: () => void
    onCanPlay?: () => void
  }): HTMLAudioElement {
    // Stop any existing audio with the same ID
    this.stopAudio(id)

    const audio = new Audio(url)
    audio.volume = (options?.volume ?? 1.0) * this.globalVolume
    audio.preload = 'metadata'

    // Add event listeners
    const cleanup = () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
      
      if (audio.src) {
        audio.pause()
        audio.currentTime = 0
        audio.src = ''
        audio.load()
      }

      // Revoke blob URL if it's a blob
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }

      this.instances.delete(id)
      if (this.currentPlayingId === id) {
        this.currentPlayingId = null
      }
    }

    const handleEnded = () => {
      this.currentPlayingId = null
      options?.onEnded?.()
    }

    const handleError = (error: Event) => {
      console.error(`Audio error for ${id}:`, error)
      options?.onError?.(error)
      cleanup()
    }

    const handleLoadStart = () => {
      options?.onLoadStart?.()
    }

    const handleCanPlay = () => {
      options?.onCanPlay?.()
    }

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)

    // Store the instance
    this.instances.set(id, {
      id,
      audio,
      url,
      cleanup
    })

    return audio
  }

  /**
   * Play audio with single instance guarantee
   */
  async playAudio(id: string, url?: string): Promise<void> {
    try {
      // Stop any currently playing audio
      if (this.currentPlayingId && this.currentPlayingId !== id) {
        this.pauseAudio(this.currentPlayingId)
      }

      let instance = this.instances.get(id)
      
      // Create new instance if needed
      if (!instance && url) {
        this.createAudio(id, url)
        instance = this.instances.get(id)
      }

      if (!instance) {
        throw new Error(`Audio instance ${id} not found`)
      }

      this.currentPlayingId = id
      await instance.audio.play()
    } catch (error) {
      console.error(`Failed to play audio ${id}:`, error)
      this.currentPlayingId = null
      throw error
    }
  }

  /**
   * Pause specific audio
   */
  pauseAudio(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.audio.pause()
      if (this.currentPlayingId === id) {
        this.currentPlayingId = null
      }
    }
  }

  /**
   * Stop and cleanup specific audio
   */
  stopAudio(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.cleanup()
    }
  }

  /**
   * Stop all audio instances
   */
  stopAllAudio(): void {
    this.instances.forEach(instance => {
      instance.cleanup()
    })
    this.instances.clear()
    this.currentPlayingId = null
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(id: string): boolean {
    return this.currentPlayingId === id
  }

  /**
   * Get currently playing audio ID
   */
  getCurrentlyPlaying(): string | null {
    return this.currentPlayingId
  }

  /**
   * Set global volume (affects all future audio instances)
   */
  setGlobalVolume(volume: number): void {
    this.globalVolume = Math.max(0, Math.min(1, volume))
    
    // Update existing instances
    this.instances.forEach(instance => {
      instance.audio.volume = instance.audio.volume * this.globalVolume
    })
  }

  /**
   * Get global volume
   */
  getGlobalVolume(): number {
    return this.globalVolume
  }

  /**
   * Set volume for specific audio instance
   */
  setVolume(id: string, volume: number): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.audio.volume = Math.max(0, Math.min(1, volume)) * this.globalVolume
    }
  }

  /**
   * Get audio duration
   */
  getDuration(id: string): number {
    const instance = this.instances.get(id)
    return instance?.audio.duration || 0
  }

  /**
   * Get audio current time
   */
  getCurrentTime(id: string): number {
    const instance = this.instances.get(id)
    return instance?.audio.currentTime || 0
  }

  /**
   * Seek to specific time
   */
  seekTo(id: string, time: number): void {
    const instance = this.instances.get(id)
    if (instance && instance.audio.duration) {
      instance.audio.currentTime = Math.max(0, Math.min(time, instance.audio.duration))
    }
  }

  /**
   * Cleanup all audio instances (call on component unmount)
   */
  cleanup(): void {
    this.stopAllAudio()
  }
}

// Export singleton instance
export const audioManager = new AudioManager()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    audioManager.cleanup()
  })
}