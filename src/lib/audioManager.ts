/**
 * AudioManager - Centralized audio handling service
 * Fixes voice sound problems and improves audio handling
 */

export interface AudioInstance {
  id: string
  audio: HTMLAudioElement
  cleanup: () => void
}

export interface VoicePreviewConfig {
  voiceId: string
  category: string
  gender: 'male' | 'female'
  pitch?: number
  duration?: number
}

export class AudioManager {
  private static instance: AudioManager
  private activeAudio: Map<string, AudioInstance> = new Map()
  private audioContext: AudioContext | null = null

  private constructor() {
    // Initialize audio context lazily
    this.initializeAudioContext()
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager()
    }
    return AudioManager.instance
  }

  private async initializeAudioContext(): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        
        // Resume context if suspended (required by browser policies)
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume()
        }
      }
    } catch (error) {
      console.warn('AudioContext not available:', error)
    }
  }

  /**
   * Create and manage audio instance with proper cleanup
   */
  async playAudio(audioUrl: string, id: string): Promise<void> {
    try {
      // Stop any existing audio with same ID
      this.stopAudio(id)

      const audio = new Audio(audioUrl)
      
      // Set audio properties for better quality
      audio.preload = 'auto'
      audio.crossOrigin = 'anonymous'
      
      // Setup event listeners
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        audio.removeEventListener('pause', onPause)
        this.activeAudio.delete(id)
      }

      const onEnded = () => cleanup()
      const onError = (error: any) => {
        console.error('Audio playback error:', error)
        cleanup()
        throw new Error('Audio playback failed')
      }
      const onPause = () => cleanup()

      audio.addEventListener('ended', onEnded)
      audio.addEventListener('error', onError)
      audio.addEventListener('pause', onPause)

      // Store audio instance
      this.activeAudio.set(id, { id, audio, cleanup })

      // Play audio
      await audio.play()
      
    } catch (error) {
      console.error('Failed to play audio:', error)
      this.stopAudio(id)
      throw error
    }
  }

  /**
   * Stop specific audio instance
   */
  stopAudio(id: string): void {
    const instance = this.activeAudio.get(id)
    if (instance) {
      instance.audio.pause()
      instance.audio.currentTime = 0
      instance.cleanup()
    }
  }

  /**
   * Stop all audio instances
   */
  stopAllAudio(): void {
    for (const [id] of this.activeAudio) {
      this.stopAudio(id)
    }
  }

  /**
   * Get audio instance for external use (e.g., visualization)
   */
  getAudioInstance(id: string): AudioInstance | null {
    return this.activeAudio.get(id) || null
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(id: string): boolean {
    const instance = this.activeAudio.get(id)
    return instance ? !instance.audio.paused : false
  }

  /**
   * Generate realistic voice preview using Web Audio API
   */
  async generateVoicePreview(config: VoicePreviewConfig): Promise<void> {
    if (!this.audioContext) {
      await this.initializeAudioContext()
    }

    if (!this.audioContext) {
      throw new Error('Audio context not available')
    }

    try {
      // Stop any existing preview
      this.stopAudio(`preview-${config.voiceId}`)

      const duration = config.duration || 2
      const sampleRate = this.audioContext.sampleRate
      const bufferLength = sampleRate * duration

      // Create audio buffer
      const buffer = this.audioContext.createBuffer(1, bufferLength, sampleRate)
      const data = buffer.getChannelData(0)

      // Generate more realistic voice-like synthesis
      const fundamentalFreq = this.getVoiceFundamentalFreq(config)
      const formants = this.getVoiceFormants(config)

      for (let i = 0; i < bufferLength; i++) {
        const t = i / sampleRate
        let sample = 0

        // Generate fundamental frequency with harmonics
        for (let harmonic = 1; harmonic <= 5; harmonic++) {
          const freq = fundamentalFreq * harmonic
          const amplitude = 1 / harmonic * Math.exp(-harmonic * 0.1)
          sample += amplitude * Math.sin(2 * Math.PI * freq * t)
        }

        // Apply formant filtering (simplified)
        for (const formant of formants) {
          const formantFactor = Math.exp(-Math.pow((fundamentalFreq - formant.freq) / formant.bandwidth, 2))
          sample *= (1 + formantFactor * formant.amplitude)
        }

        // Apply envelope and noise for naturalness
        const envelope = Math.exp(-t * 2) * (1 - t / duration)
        const noise = (Math.random() - 0.5) * 0.02
        data[i] = (sample * envelope + noise) * 0.1
      }

      // Create and play buffer
      const source = this.audioContext.createBufferSource()
      const gainNode = this.audioContext.createGain()
      
      source.buffer = buffer
      source.connect(gainNode)
      gainNode.connect(this.audioContext.destination)
      
      // Apply fade in/out
      const now = this.audioContext.currentTime
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.1)
      gainNode.gain.linearRampToValueAtTime(0.3, now + duration - 0.1)
      gainNode.gain.linearRampToValueAtTime(0, now + duration)

      source.start(now)
      source.stop(now + duration)

      // Track for cleanup
      const cleanup = () => {
        source.disconnect()
        gainNode.disconnect()
        this.activeAudio.delete(`preview-${config.voiceId}`)
      }

      source.addEventListener('ended', cleanup)
      
      this.activeAudio.set(`preview-${config.voiceId}`, {
        id: `preview-${config.voiceId}`,
        audio: { pause: () => source.stop(), currentTime: 0 } as any,
        cleanup
      })

    } catch (error) {
      console.error('Failed to generate voice preview:', error)
      throw error
    }
  }

  /**
   * Set volume for specific audio instance
   */
  setVolume(id: string, volume: number): void {
    const instance = this.activeAudio.get(id)
    if (instance) {
      instance.audio.volume = Math.max(0, Math.min(1, volume))
    }
  }

  /**
   * Set playback rate for specific audio instance
   */
  setPlaybackRate(id: string, rate: number): void {
    const instance = this.activeAudio.get(id)
    if (instance) {
      instance.audio.playbackRate = Math.max(0.5, Math.min(2, rate))
    }
  }

  /**
   * Get voice fundamental frequency based on characteristics
   */
  private getVoiceFundamentalFreq(config: VoicePreviewConfig): number {
    let baseFreq: number

    // Set base frequency by gender and category
    if (config.gender === 'male') {
      baseFreq = config.category === 'celebrity' ? 85 : 110
    } else {
      baseFreq = config.category === 'celebrity' ? 180 : 200
    }

    // Apply pitch adjustment
    if (config.pitch) {
      baseFreq *= config.pitch
    }

    return baseFreq
  }

  /**
   * Get voice formants for more realistic synthesis
   */
  private getVoiceFormants(config: VoicePreviewConfig) {
    const isDeep = config.gender === 'male' || config.category === 'celebrity'
    
    return [
      { freq: isDeep ? 730 : 850, bandwidth: 100, amplitude: 0.8 },
      { freq: isDeep ? 1090 : 1220, bandwidth: 150, amplitude: 0.6 },
      { freq: isDeep ? 2440 : 2810, bandwidth: 200, amplitude: 0.4 }
    ]
  }

  /**
   * Validate audio file format and quality
   */
  async validateAudioFile(file: File): Promise<{ isValid: boolean; error?: string; metadata?: any }> {
    return new Promise((resolve) => {
      const audio = new Audio()
      const url = URL.createObjectURL(file)
      
      const cleanup = () => {
        URL.revokeObjectURL(url)
        audio.removeEventListener('loadedmetadata', onLoad)
        audio.removeEventListener('error', onError)
      }

      const onLoad = () => {
        const metadata = {
          duration: audio.duration,
          hasAudio: true
        }
        
        cleanup()
        
        if (audio.duration < 1) {
          resolve({ isValid: false, error: 'Audio file too short (minimum 1 second)' })
        } else if (audio.duration > 300) {
          resolve({ isValid: false, error: 'Audio file too long (maximum 5 minutes)' })
        } else {
          resolve({ isValid: true, metadata })
        }
      }

      const onError = () => {
        cleanup()
        resolve({ isValid: false, error: 'Invalid audio file or unsupported format' })
      }

      audio.addEventListener('loadedmetadata', onLoad)
      audio.addEventListener('error', onError)
      audio.src = url
    })
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.stopAllAudio()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

export const audioManager = AudioManager.getInstance()