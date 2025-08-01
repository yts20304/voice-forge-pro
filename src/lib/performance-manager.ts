/**
 * Performance optimization utilities for audio processing
 * Handles memory management, concurrent operations, and blob cleanup
 */

interface BlobRegistry {
  [key: string]: {
    url: string
    blob: Blob
    createdAt: number
    lastAccessed: number
    size: number
  }
}

interface ProcessingTask {
  id: string
  type: 'tts' | 'clone' | 'analyze' | 'download'
  promise: Promise<any>
  startTime: number
  abortController?: AbortController
}

class PerformanceManager {
  private blobRegistry: BlobRegistry = {}
  private activeTasks = new Map<string, ProcessingTask>()
  private maxConcurrentTasks = 3
  private maxBlobAge = 30 * 60 * 1000 // 30 minutes
  private maxBlobSize = 100 * 1024 * 1024 // 100MB total
  private cleanupInterval: number | null = null

  constructor() {
    this.startCleanupTimer()
    this.setupMemoryWarnings()
  }

  /**
   * Create and register a blob URL with automatic cleanup
   */
  createBlobUrl(blob: Blob, id?: string): string {
    const blobId = id || this.generateId()
    const url = URL.createObjectURL(blob)
    
    this.blobRegistry[blobId] = {
      url,
      blob,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      size: blob.size
    }

    // Trigger cleanup if we're using too much memory
    this.checkMemoryUsage()
    
    return url
  }

  /**
   * Access a blob URL and update last accessed time
   */
  accessBlobUrl(id: string): string | null {
    const entry = this.blobRegistry[id]
    if (entry) {
      entry.lastAccessed = Date.now()
      return entry.url
    }
    return null
  }

  /**
   * Manually revoke a blob URL
   */
  revokeBlobUrl(id: string): void {
    const entry = this.blobRegistry[id]
    if (entry) {
      URL.revokeObjectURL(entry.url)
      delete this.blobRegistry[id]
    }
  }

  /**
   * Clean up old or unused blobs
   */
  cleanupBlobs(): void {
    const now = Date.now()
    const entries = Object.entries(this.blobRegistry)
    
    for (const [id, entry] of entries) {
      const age = now - entry.createdAt
      const timeSinceAccess = now - entry.lastAccessed
      
      // Remove old blobs or unused blobs
      if (age > this.maxBlobAge || timeSinceAccess > this.maxBlobAge / 2) {
        this.revokeBlobUrl(id)
      }
    }
  }

  /**
   * Check total memory usage and cleanup if needed
   */
  private checkMemoryUsage(): void {
    const totalSize = Object.values(this.blobRegistry)
      .reduce((sum, entry) => sum + entry.size, 0)

    if (totalSize > this.maxBlobSize) {
      // Remove oldest blobs first
      const entries = Object.entries(this.blobRegistry)
        .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)
      
      let removedSize = 0
      const targetReduction = totalSize - (this.maxBlobSize * 0.8) // Remove until 80% of limit
      
      for (const [id] of entries) {
        if (removedSize >= targetReduction) break
        
        const entry = this.blobRegistry[id]
        removedSize += entry.size
        this.revokeBlobUrl(id)
      }
    }
  }

  /**
   * Limit concurrent processing tasks
   */
  async executeWithConcurrencyLimit<T>(
    taskType: ProcessingTask['type'],
    taskFn: (abortSignal?: AbortSignal) => Promise<T>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<T> {
    // Wait for slot to become available
    await this.waitForSlot(priority)
    
    const taskId = this.generateId()
    const abortController = new AbortController()
    
    const task: ProcessingTask = {
      id: taskId,
      type: taskType,
      promise: taskFn(abortController.signal),
      startTime: Date.now(),
      abortController
    }
    
    this.activeTasks.set(taskId, task)
    
    try {
      const result = await task.promise
      return result
    } finally {
      this.activeTasks.delete(taskId)
    }
  }

  /**
   * Wait for a processing slot to become available
   */
  private async waitForSlot(priority: 'high' | 'normal' | 'low'): Promise<void> {
    while (this.activeTasks.size >= this.maxConcurrentTasks) {
      // For high priority tasks, cancel low priority tasks
      if (priority === 'high') {
        this.cancelLowPriorityTasks()
      }
      
      // Wait for a task to complete
      if (this.activeTasks.size >= this.maxConcurrentTasks) {
        await Promise.race(Array.from(this.activeTasks.values()).map(task => task.promise))
      }
    }
  }

  /**
   * Cancel low priority tasks to make room for high priority ones
   */
  private cancelLowPriorityTasks(): void {
    for (const [taskId, task] of this.activeTasks) {
      if (task.type === 'analyze' || task.type === 'download') {
        task.abortController?.abort()
        this.activeTasks.delete(taskId)
        break
      }
    }
  }

  /**
   * Get current performance stats
   */
  getStats(): {
    activeTasks: number
    totalBlobSize: number
    blobCount: number
    oldestBlob: number
  } {
    const now = Date.now()
    const blobs = Object.values(this.blobRegistry)
    
    return {
      activeTasks: this.activeTasks.size,
      totalBlobSize: blobs.reduce((sum, blob) => sum + blob.size, 0),
      blobCount: blobs.length,
      oldestBlob: blobs.length > 0 
        ? Math.max(...blobs.map(blob => now - blob.createdAt))
        : 0
    }
  }

  /**
   * Cancel all active tasks
   */
  cancelAllTasks(): void {
    for (const task of this.activeTasks.values()) {
      task.abortController?.abort()
    }
    this.activeTasks.clear()
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    this.cancelAllTasks()
    
    // Revoke all blob URLs
    for (const id of Object.keys(this.blobRegistry)) {
      this.revokeBlobUrl(id)
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupBlobs()
    }, 60000) // Clean up every minute
  }

  /**
   * Setup memory warnings
   */
  private setupMemoryWarnings(): void {
    // Monitor memory usage if available
    if ('memory' in performance) {
      const checkMemory = () => {
        const memInfo = (performance as any).memory
        const usedMB = memInfo.usedJSHeapSize / 1024 / 1024
        const totalMB = memInfo.totalJSHeapSize / 1024 / 1024
        
        // Warn if using more than 80% of available memory
        if (usedMB > totalMB * 0.8) {
          console.warn('High memory usage detected:', {
            used: `${usedMB.toFixed(1)}MB`,
            total: `${totalMB.toFixed(1)}MB`,
            blobStats: this.getStats()
          })
          
          // Aggressive cleanup
          this.cleanupBlobs()
        }
      }
      
      setInterval(checkMemory, 30000) // Check every 30 seconds
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
}

// Export singleton instance
export const performanceManager = new PerformanceManager()

/**
 * Compress audio for better performance
 */
export async function compressAudio(
  audioBuffer: AudioBuffer,
  targetSampleRate: number = 22050,
  targetChannels: number = 1
): Promise<AudioBuffer> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  
  // Create a new buffer with target specifications
  const compressedBuffer = audioContext.createBuffer(
    targetChannels,
    Math.floor(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate),
    targetSampleRate
  )
  
  // Simple downsampling - take every nth sample
  const ratio = audioBuffer.sampleRate / targetSampleRate
  
  for (let channel = 0; channel < Math.min(targetChannels, audioBuffer.numberOfChannels); channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = compressedBuffer.getChannelData(channel)
    
    for (let i = 0; i < outputData.length; i++) {
      const sourceIndex = Math.floor(i * ratio)
      outputData[i] = inputData[sourceIndex] || 0
    }
  }
  
  await audioContext.close()
  return compressedBuffer
}

/**
 * Create chunked audio processor for large files
 */
export async function* processAudioInChunks(
  audioBuffer: AudioBuffer,
  chunkDuration: number = 30 // seconds
): AsyncGenerator<AudioBuffer, void, unknown> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  const samplesPerChunk = Math.floor(audioBuffer.sampleRate * chunkDuration)
  const totalSamples = audioBuffer.length
  
  for (let offset = 0; offset < totalSamples; offset += samplesPerChunk) {
    const chunkLength = Math.min(samplesPerChunk, totalSamples - offset)
    const chunkBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      chunkLength,
      audioBuffer.sampleRate
    )
    
    // Copy chunk data
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel)
      const outputData = chunkBuffer.getChannelData(channel)
      
      for (let i = 0; i < chunkLength; i++) {
        outputData[i] = inputData[offset + i]
      }
    }
    
    yield chunkBuffer
    
    // Allow other tasks to run
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  
  await audioContext.close()
}

/**
 * Debounced function creator for performance
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = window.setTimeout(() => func(...args), wait)
  }
}

/**
 * Throttled function creator for performance
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    performanceManager.cleanup()
  })
}