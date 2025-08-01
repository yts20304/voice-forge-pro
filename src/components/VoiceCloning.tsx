import { useState, useRef, useEffect } from 'react'
import { Upload, Microphone, Play, Pause, Trash, CheckCircle, XCircle, Clock, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { RecordingManager } from '@/lib/recording-manager'
import { validateAudioFile, analyzeAudioFile, checkAudioConsistency, checkAudioCompatibility, AudioValidationResult } from '@/lib/audio-validation'
import { audioManager } from '@/lib/audio-manager'
import { performanceManager } from '@/lib/performance-manager'
import { createAudioError, getErrorMessage } from '@/lib/error-handling'

interface AudioSample {
  id: string
  name: string
  file: File
  duration: number
  url: string
  validation?: AudioValidationResult
}

interface VoiceCloningProps {
  onVoiceCloned: (voiceName: string, samples: AudioSample[]) => Promise<void>
  isCloning: boolean
  cloningProgress: number
}

export function VoiceCloning({ onVoiceCloned, isCloning, cloningProgress }: VoiceCloningProps) {
  const [voiceName, setVoiceName] = useState('')
  const [voiceDescription, setVoiceDescription] = useState('')
  const [audioSamples, setAudioSamples] = useState<AudioSample[]>([])
  const [recordingManager, setRecordingManager] = useState<RecordingManager | null>(null)
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    isPaused: false,
    duration: 0,
    isSupported: RecordingManager.isSupported()
  })
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [compatibility, setCompatibility] = useState(checkAudioCompatibility())
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Initialize recording manager
    const manager = new RecordingManager({
      maxDuration: 60, // 1 minute max per recording
      onMaxDurationReached: () => {
        toast.info('Maximum recording duration reached (60s)')
      },
      onError: (error) => {
        toast.error(getErrorMessage(error))
        setRecordingState(prev => ({ ...prev, isRecording: false }))
      }
    })

    manager.setStateChangeCallback(setRecordingState)
    setRecordingManager(manager)

    return () => {
      manager.destroy()
    }
  }, [])

  // Check browser compatibility on mount
  useEffect(() => {
    setCompatibility(checkAudioCompatibility())
  }, [])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    
    for (const file of files) {
      try {
        // Validate file format first
        const basicValidation = validateAudioFile(file)
        if (!basicValidation.isValid) {
          toast.error(`${file.name}: ${basicValidation.errors.join(', ')}`)
          continue
        }

        // Show warnings if any
        if (basicValidation.warnings.length > 0) {
          basicValidation.warnings.forEach(warning => {
            toast.warning(`${file.name}: ${warning}`)
          })
        }

        // Analyze audio properties
        const detailedValidation = await analyzeAudioFile(file)
        
        if (!detailedValidation.isValid) {
          toast.error(`${file.name}: ${detailedValidation.errors.join(', ')}`)
          continue
        }

        // Create blob URL using performance manager
        const url = performanceManager.createBlobUrl(file, `sample-${Date.now()}-${Math.random()}`)
        
        const sample: AudioSample = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          file,
          duration: detailedValidation.info?.duration || 0,
          url,
          validation: detailedValidation
        }
        
        setAudioSamples(prev => [...prev, sample])
        toast.success(`Added ${file.name} to voice samples`)
        
        // Show detailed warnings
        if (detailedValidation.warnings.length > 0) {
          detailedValidation.warnings.forEach(warning => {
            toast.info(`${file.name}: ${warning}`)
          })
        }
      } catch (error) {
        const audioError = createAudioError(`Failed to process ${file.name}`, 'validation', false)
        toast.error(getErrorMessage(audioError))
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const startRecording = async () => {
    if (!recordingManager) return

    try {
      await recordingManager.startRecording()
      toast.info('Recording started... Speak clearly for best results')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const stopRecording = async () => {
    if (!recordingManager) return

    try {
      const blob = await recordingManager.stopRecording()
      if (blob) {
        // Create a file from the blob
        const file = new File([blob], `recording-${Date.now()}.wav`, { type: 'audio/wav' })
        
        // Validate the recorded audio
        const validation = await analyzeAudioFile(file)
        
        if (!validation.isValid) {
          toast.error(`Recording quality issues: ${validation.errors.join(', ')}`)
          return
        }

        // Create blob URL using performance manager
        const url = performanceManager.createBlobUrl(blob, `recording-${Date.now()}`)
        
        const sample: AudioSample = {
          id: Date.now().toString(),
          name: file.name,
          file,
          duration: validation.info?.duration || 0,
          url,
          validation
        }
        
        setAudioSamples(prev => [...prev, sample])
        toast.success('Recording added to voice samples')
        
        // Show warnings if any
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => {
            toast.info(`Recording: ${warning}`)
          })
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const playAudio = async (sample: AudioSample) => {
    try {
      const audioId = `sample-${sample.id}`
      
      if (audioManager.isPlaying(audioId)) {
        audioManager.pauseAudio(audioId)
        setPlayingId(null)
      } else {
        audioManager.stopAllAudio()
        
        audioManager.createAudio(audioId, sample.url, {
          onEnded: () => setPlayingId(null),
          onError: (error) => {
            const audioError = createAudioError('Failed to play sample', 'playback', true)
            toast.error(getErrorMessage(audioError))
            setPlayingId(null)
          }
        })
        
        await audioManager.playAudio(audioId)
        setPlayingId(sample.id)
      }
    } catch (error) {
      const audioError = createAudioError('Failed to play audio sample', 'playback', true)
      toast.error(getErrorMessage(audioError))
      setPlayingId(null)
    }
  }

  const removeSample = (id: string) => {
    setAudioSamples(prev => {
      const sample = prev.find(s => s.id === id)
      if (sample) {
        // Clean up blob URL using performance manager
        performanceManager.revokeBlobUrl(`sample-${id}`)
      }
      return prev.filter(s => s.id !== id)
    })
    toast.success('Sample removed')
  }

  const handleCloneVoice = async () => {
    if (!voiceName.trim()) {
      toast.error('Please enter a voice name')
      return
    }

    if (audioSamples.length < 2) {
      toast.error('Please provide at least 2 audio samples for better quality')
      return
    }

    // Check for validation errors
    const invalidSamples = audioSamples.filter(sample => !sample.validation?.isValid)
    if (invalidSamples.length > 0) {
      toast.error(`${invalidSamples.length} samples have validation errors. Please fix or remove them.`)
      return
    }

    // Check consistency
    const audioInfos = audioSamples
      .map(sample => sample.validation?.info)
      .filter(info => info !== undefined) as any[]
    
    const consistencyCheck = checkAudioConsistency(audioInfos)
    if (consistencyCheck.warnings.length > 0) {
      // Show warnings but don't block
      consistencyCheck.warnings.forEach(warning => {
        toast.warning(`Consistency: ${warning}`)
      })
    }

    try {
      await onVoiceCloned(voiceName, audioSamples)
      
      // Clean up samples after successful cloning
      audioSamples.forEach(sample => {
        performanceManager.revokeBlobUrl(`sample-${sample.id}`)
      })
      
      setVoiceName('')
      setVoiceDescription('')
      setAudioSamples([])
      setValidationErrors([])
    } catch (error) {
      const audioError = createAudioError('Failed to clone voice', 'unknown', true)
      toast.error(getErrorMessage(audioError))
    }
  }

  const getTotalDuration = () => {
    return audioSamples.reduce((total, sample) => total + sample.duration, 0)
  }

  const getQualityScore = () => {
    const duration = getTotalDuration()
    const sampleCount = audioSamples.length
    
    if (duration >= 300 && sampleCount >= 5) return 'Excellent'
    if (duration >= 180 && sampleCount >= 3) return 'Good'
    if (duration >= 60 && sampleCount >= 2) return 'Fair'
    return 'Poor'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Microphone className="w-5 h-5 text-accent" />
          Custom Voice Cloning
        </CardTitle>
        <CardDescription>
          Upload audio samples or record your voice to create a custom voice model
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Browser Compatibility Warnings */}
        {(!compatibility.mediaRecorder || !compatibility.getUserMedia) && (
          <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
            <Warning className="w-4 h-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              <strong>Browser Compatibility Issues:</strong>
              <ul className="mt-2 list-disc list-inside space-y-1">
                {!compatibility.mediaRecorder && <li>MediaRecorder API not supported</li>}
                {!compatibility.getUserMedia && <li>Microphone access not available</li>}
              </ul>
              Please use a modern browser like Chrome, Firefox, or Safari for full functionality.
            </AlertDescription>
          </Alert>
        )}
        {/* Voice Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="voice-name">Voice Name</Label>
            <Input
              id="voice-name"
              placeholder="e.g., My Professional Voice"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-description">Description (Optional)</Label>
            <Input
              id="voice-description"
              placeholder="e.g., Warm, professional presentation voice"
              value={voiceDescription}
              onChange={(e) => setVoiceDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Upload & Record Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Upload Audio Files</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Supports MP3, WAV, M4A. Multiple files allowed.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Record Audio</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant={recordingState.isRecording ? "destructive" : "outline"}
                  onClick={recordingState.isRecording ? stopRecording : startRecording}
                  disabled={!recordingState.isSupported}
                  className="flex-1"
                >
                  <Microphone className="w-4 h-4 mr-2" />
                  {recordingState.isRecording ? 'Stop Recording' : 'Start Recording'}
                </Button>
                {recordingState.isRecording && (
                  <Badge variant="destructive" className="animate-pulse">
                    {Math.floor(recordingState.duration)}s
                  </Badge>
                )}
              </div>
              {recordingState.isRecording && (
                <Progress 
                  value={(recordingState.duration / 60) * 100} 
                  className="h-2" 
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {recordingState.isSupported 
                ? "Speak clearly for 10-30 seconds per sample. Maximum 60 seconds."
                : "Recording not supported in this browser."
              }
            </p>
          </div>
        </div>

        {/* Quality Metrics */}
        {audioSamples.length > 0 && (
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-accent">{audioSamples.length}</div>
                  <div className="text-xs text-muted-foreground">Samples</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-accent">{Math.round(getTotalDuration())}s</div>
                  <div className="text-xs text-muted-foreground">Total Duration</div>
                </div>
                <div>
                  <Badge 
                    variant={getQualityScore() === 'Excellent' ? 'default' : 
                            getQualityScore() === 'Good' ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    {getQualityScore()}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">Quality</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {getTotalDuration() >= 180 ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-500 mx-auto" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Duration Check</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audio Samples List */}
        {audioSamples.length > 0 && (
          <div className="space-y-2">
            <Label>Audio Samples ({audioSamples.length})</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {audioSamples.map(sample => (
                <div key={sample.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => playingId === sample.id ? setPlayingId(null) : playAudio(sample)}
                  >
                    {playingId === sample.id ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-sm font-medium truncate">{sample.name}</div>
                      {sample.validation?.isValid ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(sample.duration)}s duration
                      {sample.validation?.info && (
                        <> • {sample.validation.info.sampleRate}Hz • {sample.validation.info.numberOfChannels}ch</>
                      )}
                    </div>
                    {sample.validation?.errors && sample.validation.errors.length > 0 && (
                      <div className="text-xs text-red-600 mt-1">
                        {sample.validation.errors.join(', ')}
                      </div>
                    )}
                    {sample.validation?.warnings && sample.validation.warnings.length > 0 && (
                      <div className="text-xs text-yellow-600 mt-1">
                        {sample.validation.warnings.slice(0, 1).join(', ')}
                        {sample.validation.warnings.length > 1 && '...'}
                      </div>
                    )}
                  </div>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSample(sample.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clone Button */}
        <div className="space-y-4">
          {getTotalDuration() < 60 && audioSamples.length > 0 && (
            <div className="text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
              <strong>Tip:</strong> For better quality, provide at least 60 seconds of total audio across multiple samples.
            </div>
          )}
          
          <Button
            onClick={handleCloneVoice}
            disabled={!voiceName.trim() || audioSamples.length === 0 || isCloning}
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            size="lg"
          >
            {isCloning ? (
              <>
                <Microphone className="w-5 h-5 mr-2 animate-pulse" />
                Training Voice Model... {Math.round(cloningProgress)}%
              </>
            ) : (
              <>
                <Microphone className="w-5 h-5 mr-2" />
                Clone Voice
              </>
            )}
          </Button>

          {isCloning && (
            <Progress value={cloningProgress} className="w-full" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}