/**
 * Recording manager with browser compatibility, constraints, and duration limits
 */

import { checkAudioCompatibility, getRecordingConstraints } from './audio-validation'
import { useState, useEffect } from 'react'

export interface RecordingOptions {
  maxDuration?: number // seconds
  mimeType?: string
  audioBitsPerSecond?: number
  onDataAvailable?: (data: Blob) => void
  onMaxDurationReached?: () => void
  onError?: (error: Error) => void
  onStart?: () => void
  onStop?: () => void
}

export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  isSupported: boolean
  stream: MediaStream | null
}

export class RecordingManager {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private startTime: number = 0
  private pausedDuration: number = 0
  private durationTimer: number | null = null
  private maxDuration: number
  private options: RecordingOptions
  private stateChangeCallback?: (state: RecordingState) => void

  constructor(options: RecordingOptions = {}) {
    this.maxDuration = options.maxDuration || 300 // 5 minutes default
    this.options = options
  }

  /**
   * Check if recording is supported in current browser
   */
  static isSupported(): boolean {
    const compatibility = checkAudioCompatibility()
    return compatibility.mediaRecorder && compatibility.getUserMedia
  }

  /**
   * Get optimal MIME type for recording
   */
  static getOptimalMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/wav'
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    return 'audio/webm' // fallback
  }

  /**
   * Set state change callback
   */
  setStateChangeCallback(callback: (state: RecordingState) => void): void {
    this.stateChangeCallback = callback
  }

  /**
   * Get current recording state
   */
  getState(): RecordingState {
    return {
      isRecording: this.mediaRecorder?.state === 'recording',
      isPaused: this.mediaRecorder?.state === 'paused',
      duration: this.getCurrentDuration(),
      isSupported: RecordingManager.isSupported(),
      stream: this.stream
    }
  }

  /**
   * Start recording with browser compatibility checks
   */
  async startRecording(): Promise<void> {
    try {
      // Check browser support
      if (!RecordingManager.isSupported()) {
        throw new Error('Recording not supported in this browser')
      }

      // Clean up any existing recording
      await this.stopRecording()

      // Get user media with optimized constraints
      const constraints = getRecordingConstraints()
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)

      // Setup MediaRecorder with optimal settings
      const mimeType = this.options.mimeType || RecordingManager.getOptimalMimeType()
      const recorderOptions: MediaRecorderOptions = {
        mimeType
      }

      if (this.options.audioBitsPerSecond) {
        recorderOptions.audioBitsPerSecond = this.options.audioBitsPerSecond
      }

      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions)
      this.chunks = []
      this.startTime = Date.now()
      this.pausedDuration = 0

      // Setup event listeners
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data)
          this.options.onDataAvailable?.(event.data)
        }
      }

      this.mediaRecorder.onstop = () => {
        this.options.onStop?.()
        this.emitStateChange()
        this.stopDurationTimer()
      }

      this.mediaRecorder.onstart = () => {
        this.options.onStart?.()
        this.emitStateChange()
        this.startDurationTimer()
      }

      this.mediaRecorder.onerror = (event) => {
        const error = new Error(`Recording error: ${event.type}`)
        this.options.onError?.(error)
        this.cleanup()
      }

      // Start recording
      this.mediaRecorder.start(1000) // Record in 1-second chunks
      this.emitStateChange()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown recording error'
      const recordingError = new Error(`Failed to start recording: ${errorMessage}`)
      this.options.onError?.(recordingError)
      this.cleanup()
      throw recordingError
    }
  }

  /**
   * Pause recording
   */
  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      this.pausedDuration += Date.now() - this.startTime
      this.stopDurationTimer()
      this.emitStateChange()
    }
  }

  /**
   * Resume recording
   */
  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
      this.startTime = Date.now()
      this.startDurationTimer()
      this.emitStateChange()
    }
  }

  /**
   * Stop recording and return the recorded blob
   */
  async stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanup()
        resolve(null)
        return
      }

      // Setup one-time listener for stop event
      const handleStop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { 
          type: this.mediaRecorder?.mimeType || 'audio/webm' 
        }) : null
        
        this.cleanup()
        resolve(blob)
      }

      this.mediaRecorder.addEventListener('stop', handleStop, { once: true })
      this.mediaRecorder.stop()
    })
  }

  /**
   * Get current recording duration in seconds
   */
  getCurrentDuration(): number {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return 0
    }

    const currentTime = Date.now()
    const activeDuration = this.mediaRecorder.state === 'recording' 
      ? currentTime - this.startTime 
      : 0

    return (this.pausedDuration + activeDuration) / 1000
  }

  /**
   * Check if max duration is reached
   */
  private checkMaxDuration(): void {
    if (this.getCurrentDuration() >= this.maxDuration) {
      this.options.onMaxDurationReached?.()
      this.stopRecording()
    }
  }

  /**
   * Start duration monitoring timer
   */
  private startDurationTimer(): void {
    this.stopDurationTimer()
    this.durationTimer = window.setInterval(() => {
      this.checkMaxDuration()
      this.emitStateChange()
    }, 1000)
  }

  /**
   * Stop duration monitoring timer
   */
  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer)
      this.durationTimer = null
    }
  }

  /**
   * Emit state change to callback
   */
  private emitStateChange(): void {
    this.stateChangeCallback?.(this.getState())
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.stopDurationTimer()

    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop()
      })
      this.stream = null
    }

    this.mediaRecorder = null
    this.chunks = []
    this.startTime = 0
    this.pausedDuration = 0
    this.emitStateChange()
  }

  /**
   * Destroy the recording manager
   */
  destroy(): void {
    this.stopRecording()
    this.cleanup()
  }
}

/**
 * Hook for easy React integration
 */
export function useRecordingManager(options: RecordingOptions = {}) {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    isSupported: RecordingManager.isSupported(),
    stream: null
  })

  const [manager] = useState(() => {
    const mgr = new RecordingManager(options)
    mgr.setStateChangeCallback(setState)
    return mgr
  })

  useEffect(() => {
    return () => {
      manager.destroy()
    }
  }, [manager])

  return {
    state,
    startRecording: () => manager.startRecording(),
    pauseRecording: () => manager.pauseRecording(),
    resumeRecording: () => manager.resumeRecording(),
    stopRecording: () => manager.stopRecording(),
    isSupported: state.isSupported
  }
}