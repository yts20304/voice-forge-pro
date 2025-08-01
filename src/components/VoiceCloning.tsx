import { useState, useRef } from 'react'
import { Upload, Microphone, Play, Pause, Trash, CheckCircle, XCircle, Clock, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { WaveformVisualizer } from '@/components/AudioVisualizer'
import { audioManager } from '@/lib/audioManager'
import { toast } from 'sonner'

interface AudioSample {
  id: string
  name: string
  file: File
  duration: number
  url: string
  isValid: boolean
  error?: string
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
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    
    for (const file of files) {
      if (file.type.startsWith('audio/')) {
        try {
          // Validate audio file
          const validation = await audioManager.validateAudioFile(file)
          
          if (!validation.isValid) {
            toast.error(`${file.name}: ${validation.error}`)
            continue
          }

          const url = URL.createObjectURL(file)
          const sample: AudioSample = {
            id: Date.now().toString() + Math.random(),
            name: file.name,
            file,
            duration: validation.metadata?.duration || 0,
            url,
            isValid: true
          }
          
          setAudioSamples(prev => [...prev, sample])
          toast.success(`Added ${file.name} to voice samples`)
          
        } catch (error) {
          console.error('File validation error:', error)
          toast.error(`Failed to process ${file.name}`)
        }
      } else {
        toast.error(`${file.name} is not an audio file`)
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (event) => {
        chunks.push(event.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const file = new File([blob], `recording-${Date.now()}.wav`, { type: 'audio/wav' })
        
        try {
          // Validate recorded audio
          const validation = await audioManager.validateAudioFile(file)
          
          if (!validation.isValid) {
            toast.error(`Recording error: ${validation.error}`)
            URL.revokeObjectURL(url)
            return
          }

          const sample: AudioSample = {
            id: Date.now().toString(),
            name: file.name,
            file,
            duration: validation.metadata?.duration || 0,
            url,
            isValid: true
          }
          
          setAudioSamples(prev => [...prev, sample])
          toast.success('Recording added to voice samples')
          
        } catch (error) {
          console.error('Recording validation error:', error)
          toast.error('Failed to process recording')
          URL.revokeObjectURL(url)
        }
        
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
      toast.info('Recording started...')
    } catch (error) {
      toast.error('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop()
      setMediaRecorder(null)
      setIsRecording(false)
      toast.success('Recording stopped')
    }
  }

  const playAudio = async (sample: AudioSample) => {
    try {
      await audioManager.playAudio(sample.url, `sample-${sample.id}`)
      setPlayingId(sample.id)
      
      // Monitor playback completion
      const checkCompletion = () => {
        if (!audioManager.isPlaying(`sample-${sample.id}`)) {
          setPlayingId(null)
        } else {
          setTimeout(checkCompletion, 100)
        }
      }
      checkCompletion()
      
    } catch (error) {
      console.error('Sample playback error:', error)
      toast.error('Failed to play audio sample')
    }
  }

  const pauseAudio = (sample: AudioSample) => {
    audioManager.stopAudio(`sample-${sample.id}`)
    setPlayingId(null)
  }

  const removeSample = (id: string) => {
    setAudioSamples(prev => {
      const sample = prev.find(s => s.id === id)
      if (sample) {
        URL.revokeObjectURL(sample.url)
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

    const validSamples = audioSamples.filter(s => s.isValid)
    if (validSamples.length !== audioSamples.length) {
      toast.error('Please ensure all audio samples are valid before cloning')
      return
    }

    try {
      await onVoiceCloned(voiceName, audioSamples)
      setVoiceName('')
      setVoiceDescription('')
      setAudioSamples([])
      toast.success('Voice cloned successfully!')
    } catch (error) {
      toast.error('Failed to clone voice. Please try again.')
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
            <Button
              variant={isRecording ? "destructive" : "outline"}
              onClick={isRecording ? stopRecording : startRecording}
              className="w-full"
            >
              <Microphone className="w-4 h-4 mr-2" />
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Button>
            
            {/* Recording Visualizer */}
            {isRecording && (
              <div className="bg-muted/30 rounded-lg p-3 mt-2">
                <WaveformVisualizer 
                  isRecording={isRecording}
                  height={40}
                  className="rounded"
                />
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              Speak clearly for 10-30 seconds per sample.
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
                <div key={sample.id} className={`flex items-center gap-3 p-3 border rounded-lg ${
                  !sample.isValid ? 'border-destructive bg-destructive/5' : ''
                }`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => playingId === sample.id ? pauseAudio(sample) : playAudio(sample)}
                    disabled={!sample.isValid}
                  >
                    {playingId === sample.id ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium truncate">{sample.name}</div>
                      {!sample.isValid && (
                        <Warning className="w-4 h-4 text-destructive" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(sample.duration)}s duration
                      {sample.error && (
                        <span className="text-destructive ml-2">• {sample.error}</span>
                      )}
                    </div>
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