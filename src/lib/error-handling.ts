/**
 * Enhanced error handling and retry mechanisms for audio operations
 */

export interface RetryOptions {
  maxAttempts?: number
  delay?: number
  backoff?: boolean
  onRetry?: (attempt: number, error: Error) => void
}

export interface AudioError extends Error {
  code?: string
  type: 'network' | 'decode' | 'playback' | 'recording' | 'validation' | 'unknown'
  retryable: boolean
  details?: any
}

/**
 * Create a typed audio error
 */
export function createAudioError(
  message: string,
  type: AudioError['type'] = 'unknown',
  retryable: boolean = false,
  details?: any
): AudioError {
  const error = new Error(message) as AudioError
  error.type = type
  error.retryable = retryable
  error.details = details
  return error
}

/**
 * Classify errors from audio operations
 */
export function classifyAudioError(error: any): AudioError {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return createAudioError(
          'Microphone access denied. Please grant permission and try again.',
          'recording',
          false,
          { originalError: error }
        )
      case 'NotFoundError':
        return createAudioError(
          'No microphone found. Please connect a microphone and try again.',
          'recording',
          false,
          { originalError: error }
        )
      case 'NotSupportedError':
        return createAudioError(
          'Audio recording not supported in this browser.',
          'recording',
          false,
          { originalError: error }
        )
      case 'AbortError':
        return createAudioError(
          'Audio operation was aborted.',
          'playback',
          true,
          { originalError: error }
        )
      case 'NetworkError':
        return createAudioError(
          'Network error occurred while loading audio.',
          'network',
          true,
          { originalError: error }
        )
      case 'DecodingError':
        return createAudioError(
          'Audio file could not be decoded. Please check the file format.',
          'decode',
          false,
          { originalError: error }
        )
      default:
        return createAudioError(
          `Audio operation failed: ${error.message}`,
          'unknown',
          true,
          { originalError: error }
        )
    }
  }

  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
    return createAudioError(
      'Failed to download audio. Please check your internet connection.',
      'network',
      true,
      { originalError: error }
    )
  }

  // MediaRecorder specific errors
  if (error.name === 'InvalidStateError') {
    return createAudioError(
      'Recording is in an invalid state.',
      'recording',
      true,
      { originalError: error }
    )
  }

  // Fallback for unknown errors
  return createAudioError(
    error.message || 'An unknown audio error occurred',
    'unknown',
    true,
    { originalError: error }
  )
}

/**
 * Retry wrapper for async operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = true,
    onRetry
  } = options

  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Check if error is retryable
      const audioError = classifyAudioError(lastError)
      if (!audioError.retryable || attempt === maxAttempts) {
        throw audioError
      }

      onRetry?.(attempt, audioError)

      // Wait before retry with optional backoff
      const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw classifyAudioError(lastError!)
}

/**
 * Enhanced audio loading with retry and timeout
 */
export async function loadAudioWithRetry(
  url: string,
  options: RetryOptions & { timeout?: number } = {}
): Promise<HTMLAudioElement> {
  const { timeout = 10000, ...retryOptions } = options

  return withRetry(async () => {
    return new Promise<HTMLAudioElement>((resolve, reject) => {
      const audio = new Audio()
      let timeoutId: number

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        audio.removeEventListener('canplaythrough', handleSuccess)
        audio.removeEventListener('error', handleError)
        audio.removeEventListener('abort', handleAbort)
      }

      const handleSuccess = () => {
        cleanup()
        resolve(audio)
      }

      const handleError = () => {
        cleanup()
        reject(createAudioError(
          'Failed to load audio file',
          'network',
          true,
          { url, readyState: audio.readyState, networkState: audio.networkState }
        ))
      }

      const handleAbort = () => {
        cleanup()
        reject(createAudioError(
          'Audio loading was aborted',
          'network',
          true,
          { url }
        ))
      }

      // Set up timeout
      timeoutId = window.setTimeout(() => {
        cleanup()
        reject(createAudioError(
          `Audio loading timed out after ${timeout}ms`,
          'network',
          true,
          { url, timeout }
        ))
      }, timeout)

      // Set up event listeners
      audio.addEventListener('canplaythrough', handleSuccess)
      audio.addEventListener('error', handleError)
      audio.addEventListener('abort', handleAbort)

      // Start loading
      audio.preload = 'auto'
      audio.src = url
      audio.load()
    })
  }, retryOptions)
}

/**
 * Download audio file with retry mechanism
 */
export async function downloadAudioWithRetry(
  url: string,
  filename: string,
  options: RetryOptions = {}
): Promise<void> {
  return withRetry(async () => {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw createAudioError(
          `Download failed: ${response.status} ${response.statusText}`,
          'network',
          response.status >= 500 || response.status === 429
        )
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    } catch (error) {
      throw classifyAudioError(error)
    }
  }, options)
}

/**
 * Graceful error handling with user-friendly messages
 */
export function getErrorMessage(error: AudioError | Error): string {
  if ('type' in error) {
    const audioError = error as AudioError
    switch (audioError.type) {
      case 'recording':
        return audioError.message
      case 'network':
        return 'Network connection issue. Please check your internet and try again.'
      case 'decode':
        return 'Unable to process this audio file. Please try a different file format.'
      case 'playback':
        return 'Unable to play audio. Please try again.'
      case 'validation':
        return audioError.message
      default:
        return 'An unexpected error occurred. Please try again.'
    }
  }

  return error.message || 'An unexpected error occurred.'
}

/**
 * Error reporting utility
 */
export function reportAudioError(error: AudioError | Error, context?: string): void {
  const errorData = {
    message: error.message,
    type: 'type' in error ? error.type : 'unknown',
    retryable: 'retryable' in error ? error.retryable : false,
    context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    details: 'details' in error ? error.details : undefined
  }

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Audio Error:', errorData)
  }

  // In production, you might want to send this to an error tracking service
  // Example: analytics.track('audio_error', errorData)
}

/**
 * Check browser audio capabilities and provide recommendations
 */
export function checkBrowserCapabilities(): {
  supported: boolean
  issues: string[]
  recommendations: string[]
} {
  const issues: string[] = []
  const recommendations: string[] = []

  // Check for HTTPS (required for getUserMedia in most browsers)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    issues.push('HTTPS required for microphone access')
    recommendations.push('Serve your application over HTTPS')
  }

  // Check MediaRecorder support
  if (typeof MediaRecorder === 'undefined') {
    issues.push('MediaRecorder API not supported')
    recommendations.push('Use a modern browser like Chrome, Firefox, or Safari')
  }

  // Check AudioContext support
  if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
    issues.push('Web Audio API not supported')
    recommendations.push('Use a modern browser for full audio functionality')
  }

  // Check getUserMedia support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    issues.push('Microphone access not supported')
    recommendations.push('Use a modern browser and ensure HTTPS')
  }

  return {
    supported: issues.length === 0,
    issues,
    recommendations
  }
}