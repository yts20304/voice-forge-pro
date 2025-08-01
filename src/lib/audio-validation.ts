/**
 * Audio format validation and quality checks
 */

export interface AudioInfo {
  duration: number
  sampleRate: number
  numberOfChannels: number
  bitRate?: number
  format: string
  size: number
}

export interface AudioValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  info?: AudioInfo
}

// Supported audio formats
const SUPPORTED_FORMATS = [
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac'
]

// Quality constraints
const QUALITY_CONSTRAINTS = {
  minDuration: 1, // seconds
  maxDuration: 300, // 5 minutes
  minSampleRate: 16000, // Hz
  maxSampleRate: 48000, // Hz
  maxFileSize: 50 * 1024 * 1024, // 50MB
  preferredSampleRate: 22050, // Hz for voice cloning
  preferredChannels: 1 // mono for voice cloning
}

/**
 * Check browser compatibility for audio features
 */
export function checkAudioCompatibility() {
  const compatibility = {
    mediaRecorder: false,
    audioContext: false,
    getUserMedia: false,
    supportedFormats: [] as string[]
  }

  // Check MediaRecorder support
  if (typeof MediaRecorder !== 'undefined') {
    compatibility.mediaRecorder = true
  }

  // Check AudioContext support
  if (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined') {
    compatibility.audioContext = true
  }

  // Check getUserMedia support
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    compatibility.getUserMedia = true
  }

  // Check supported audio formats
  const audio = document.createElement('audio')
  for (const format of SUPPORTED_FORMATS) {
    if (audio.canPlayType(format)) {
      compatibility.supportedFormats.push(format)
    }
  }

  return compatibility
}

/**
 * Validate audio file format and basic properties
 */
export function validateAudioFile(file: File): AudioValidationResult {
  const result: AudioValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  }

  // Check file type
  if (!SUPPORTED_FORMATS.includes(file.type)) {
    result.errors.push(`Unsupported format: ${file.type}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`)
    result.isValid = false
  }

  // Check file size
  if (file.size > QUALITY_CONSTRAINTS.maxFileSize) {
    result.errors.push(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${QUALITY_CONSTRAINTS.maxFileSize / 1024 / 1024}MB`)
    result.isValid = false
  }

  // Check minimum file size (basic sanity check)
  if (file.size < 1000) { // Less than 1KB
    result.errors.push('File too small to be a valid audio file')
    result.isValid = false
  }

  return result
}

/**
 * Analyze audio file properties using AudioContext
 */
export async function analyzeAudioFile(file: File): Promise<AudioValidationResult> {
  const result = validateAudioFile(file)
  
  if (!result.isValid) {
    return result
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    const info: AudioInfo = {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      format: file.type,
      size: file.size
    }

    result.info = info

    // Validate duration
    if (info.duration < QUALITY_CONSTRAINTS.minDuration) {
      result.errors.push(`Audio too short: ${info.duration.toFixed(2)}s. Minimum required: ${QUALITY_CONSTRAINTS.minDuration}s`)
      result.isValid = false
    }

    if (info.duration > QUALITY_CONSTRAINTS.maxDuration) {
      result.errors.push(`Audio too long: ${info.duration.toFixed(2)}s. Maximum allowed: ${QUALITY_CONSTRAINTS.maxDuration}s`)
      result.isValid = false
    }

    // Validate sample rate
    if (info.sampleRate < QUALITY_CONSTRAINTS.minSampleRate) {
      result.errors.push(`Sample rate too low: ${info.sampleRate}Hz. Minimum required: ${QUALITY_CONSTRAINTS.minSampleRate}Hz`)
      result.isValid = false
    }

    if (info.sampleRate > QUALITY_CONSTRAINTS.maxSampleRate) {
      result.warnings.push(`Sample rate very high: ${info.sampleRate}Hz. Consider using ${QUALITY_CONSTRAINTS.maxSampleRate}Hz or lower for better compatibility`)
    }

    // Check preferred settings for voice cloning
    if (info.sampleRate !== QUALITY_CONSTRAINTS.preferredSampleRate) {
      result.warnings.push(`For best voice cloning results, use ${QUALITY_CONSTRAINTS.preferredSampleRate}Hz sample rate (current: ${info.sampleRate}Hz)`)
    }

    if (info.numberOfChannels !== QUALITY_CONSTRAINTS.preferredChannels) {
      result.warnings.push(`For voice cloning, mono audio (1 channel) is preferred (current: ${info.numberOfChannels} channels)`)
    }

    await audioContext.close()
  } catch (error) {
    result.errors.push(`Failed to analyze audio file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    result.isValid = false
  }

  return result
}

/**
 * Check if multiple audio files have consistent properties
 */
export function checkAudioConsistency(audioInfos: AudioInfo[]): AudioValidationResult {
  const result: AudioValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  }

  if (audioInfos.length < 2) {
    return result
  }

  const firstInfo = audioInfos[0]
  const sampleRates = new Set(audioInfos.map(info => info.sampleRate))
  const channels = new Set(audioInfos.map(info => info.numberOfChannels))

  // Check sample rate consistency
  if (sampleRates.size > 1) {
    result.warnings.push(`Inconsistent sample rates detected: ${Array.from(sampleRates).join(', ')}Hz. For best results, use consistent sample rate across all files.`)
  }

  // Check channel consistency
  if (channels.size > 1) {
    result.warnings.push(`Inconsistent channel counts detected: ${Array.from(channels).join(', ')}. For best results, use consistent channel count across all files.`)
  }

  return result
}

/**
 * Normalize audio level (basic peak normalization)
 */
export async function normalizeAudioLevel(audioBuffer: AudioBuffer, targetLevel: number = 0.9): Promise<AudioBuffer> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  const normalizedBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = normalizedBuffer.getChannelData(channel)

    // Find peak amplitude
    let peak = 0
    for (let i = 0; i < inputData.length; i++) {
      peak = Math.max(peak, Math.abs(inputData[i]))
    }

    // Calculate normalization factor
    const normalizationFactor = peak > 0 ? targetLevel / peak : 1

    // Apply normalization
    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[i] * normalizationFactor
    }
  }

  await audioContext.close()
  return normalizedBuffer
}

/**
 * Detect background noise level
 */
export async function detectBackgroundNoise(audioBuffer: AudioBuffer): Promise<{
  noiseLevel: number
  isNoisy: boolean
  recommendation: string
}> {
  // Simple noise detection based on RMS in quiet sections
  const channel0 = audioBuffer.getChannelData(0)
  const sampleSize = Math.min(audioBuffer.sampleRate * 2, channel0.length) // First 2 seconds
  
  let sum = 0
  for (let i = 0; i < sampleSize; i++) {
    sum += channel0[i] * channel0[i]
  }
  
  const rms = Math.sqrt(sum / sampleSize)
  const noiseLevel = rms
  
  // Threshold for considering audio as noisy (this is a basic heuristic)
  const noiseThreshold = 0.01
  const isNoisy = noiseLevel > noiseThreshold
  
  let recommendation = 'Audio quality appears good'
  if (isNoisy) {
    recommendation = 'High background noise detected. Consider recording in a quieter environment or using noise reduction.'
  }
  
  return {
    noiseLevel,
    isNoisy,
    recommendation
  }
}

/**
 * Get recommended recording constraints for browser compatibility
 */
export function getRecordingConstraints(): MediaStreamConstraints {
  const compatibility = checkAudioCompatibility()
  
  const constraints: MediaStreamConstraints = {
    audio: {
      sampleRate: QUALITY_CONSTRAINTS.preferredSampleRate,
      channelCount: QUALITY_CONSTRAINTS.preferredChannels,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  }

  // Fallback for older browsers
  if (!compatibility.getUserMedia) {
    console.warn('getUserMedia not supported, recording may not work')
  }

  return constraints
}

export { QUALITY_CONSTRAINTS, SUPPORTED_FORMATS }