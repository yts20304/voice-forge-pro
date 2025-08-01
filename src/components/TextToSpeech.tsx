import { useState, useRef } from 'react'
import { Play, Pause, Download, SpeakerHigh, Copy, FileText, SpeakerLow } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AudioVisualizer } from '@/components/AudioVisualizer'
import { audioManager } from '@/lib/audioManager'
import { toast } from 'sonner'

interface Voice {
  id: string
  name: string
  category: string
}

interface GeneratedAudio {
  id: string
  text: string
  voice: Voice
  audioUrl: string
  duration: number
  quality: string
  createdAt: Date
}

interface TextToSpeechProps {
  selectedVoice: Voice | null
  onGenerate: (text: string, voice: Voice, settings: any) => Promise<GeneratedAudio>
  isGenerating: boolean
  generationProgress: number
}

export function TextToSpeech({ selectedVoice, onGenerate, isGenerating, generationProgress }: TextToSpeechProps) {
  const [text, setText] = useState('')
  const [speed, setSpeed] = useState([1.0])
  const [pitch, setPitch] = useState([1.0])
  const [volume, setVolume] = useState([0.8])
  const [quality, setQuality] = useState('high')
  const [isPlaying, setIsPlaying] = useState(false)
  const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)

  const handleGenerate = async () => {
    if (!selectedVoice || !text.trim()) {
      toast.error('Please select a voice and enter text to generate')
      return
    }

    if (text.length > 5000) {
      toast.error('Text must be under 5000 characters')
      return
    }

    try {
      const settings = {
        speed: speed[0],
        pitch: pitch[0],
        volume: volume[0],
        quality
      }
      
      const audio = await onGenerate(text, selectedVoice, settings)
      setGeneratedAudio(audio)
      toast.success('Voice generated successfully!')
    } catch (error) {
      toast.error('Failed to generate voice. Please try again.')
    }
  }

  const handlePlayPause = async () => {
    if (!generatedAudio) return

    const audioId = `text-to-speech-${generatedAudio.id}`

    try {
      if (isPlaying) {
        audioManager.stopAudio(audioId)
        setIsPlaying(false)
      } else {
        await audioManager.playAudio(generatedAudio.audioUrl, audioId)
        
        // Get the audio element for visualization
        const audioInstance = audioManager.getAudioInstance(audioId)
        if (audioInstance) {
          currentAudioRef.current = audioInstance.audio
        }
        
        // Apply current settings
        audioManager.setVolume(audioId, volume[0])
        audioManager.setPlaybackRate(audioId, speed[0])
        
        setIsPlaying(true)
        
        // Monitor playback completion
        const checkCompletion = () => {
          if (!audioManager.isPlaying(audioId)) {
            setIsPlaying(false)
          } else {
            setTimeout(checkCompletion, 100)
          }
        }
        checkCompletion()
      }
    } catch (error) {
      console.error('Audio playback error:', error)
      setIsPlaying(false)
      toast.error('Failed to play audio. Please try again.')
    }
  }

  const handleDownload = () => {
    if (!generatedAudio) return
    
    const link = document.createElement('a')
    link.href = generatedAudio.audioUrl
    link.download = `voiceforge-${generatedAudio.voice.name}-${Date.now()}.mp3`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast.success('Audio downloaded successfully!')
  }

  const getCharacterCount = () => text.length
  const getEstimatedDuration = () => {
    const wordsPerMinute = 150 * speed[0]
    const words = text.trim().split(/\s+/).length
    return Math.ceil((words / wordsPerMinute) * 60)
  }

  return (
    <div className="space-y-6">
      {/* Text Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            Text Input
          </CardTitle>
          <CardDescription>
            Enter the text you want to convert to speech
            {selectedVoice && (
              <Badge variant="outline" className="ml-2">
                Voice: {selectedVoice.name}
              </Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="text-input">Your Text</Label>
            <Textarea
              id="text-input"
              placeholder="Enter your text here... (max 5000 characters)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-32 resize-none"
              maxLength={5000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{getCharacterCount()}/5000 characters</span>
              <span>≈ {getEstimatedDuration()}s duration</span>
            </div>
          </div>

          {/* Advanced Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Speech Speed</Label>
              <Slider
                value={speed}
                onValueChange={setSpeed}
                max={2}
                min={0.5}
                step={0.1}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground">{speed[0]}x</span>
            </div>
            
            <div className="space-y-2">
              <Label>Pitch</Label>
              <Slider
                value={pitch}
                onValueChange={setPitch}
                max={2}
                min={0.5}
                step={0.1}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground">{pitch[0]}x</span>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <SpeakerLow className="w-3 h-3" />
                Volume
              </Label>
              <Slider
                value={volume}
                onValueChange={(value) => {
                  setVolume(value)
                  // Apply volume to currently playing audio
                  if (generatedAudio && isPlaying) {
                    audioManager.setVolume(`text-to-speech-${generatedAudio.id}`, value[0])
                  }
                }}
                max={1}
                min={0}
                step={0.05}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground">{Math.round(volume[0] * 100)}%</span>
            </div>

            <div className="space-y-2">
              <Label>Audio Quality</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard (128kbps)</SelectItem>
                  <SelectItem value="high">High (256kbps)</SelectItem>
                  <SelectItem value="premium">Premium (320kbps)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedVoice || !text.trim() || isGenerating}
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            size="lg"
          >
            {isGenerating ? (
              <>
                <SpeakerHigh className="w-5 h-5 mr-2 animate-pulse" />
                Generating Voice... {Math.round(generationProgress)}%
              </>
            ) : (
              <>
                <SpeakerHigh className="w-5 h-5 mr-2" />
                Generate Voice
              </>
            )}
          </Button>

          {isGenerating && (
            <Progress value={generationProgress} className="w-full" />
          )}
        </CardContent>
      </Card>

      {/* Generated Audio Player */}
      {generatedAudio && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SpeakerHigh className="w-5 h-5 text-accent" />
              Generated Audio
            </CardTitle>
            <CardDescription>
              Generated with {generatedAudio.voice.name} • {generatedAudio.quality} quality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Audio Visualizer */}
              <div className="bg-muted/30 rounded-lg p-3">
                <AudioVisualizer 
                  audioElement={currentAudioRef.current || undefined}
                  isPlaying={isPlaying}
                  height={50}
                  className="rounded"
                />
              </div>
              
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePlayPause}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
                
                <div className="flex-1">
                  <div className="text-sm font-medium mb-1">
                    {generatedAudio.text.substring(0, 100)}
                    {generatedAudio.text.length > 100 && '...'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Duration: {generatedAudio.duration}s • Created: {generatedAudio.createdAt.toLocaleTimeString()}
                  </div>
                </div>

                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownload}
                  className="bg-accent hover:bg-accent/90"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download MP3
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}