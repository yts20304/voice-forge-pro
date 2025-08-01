import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Waveform, SpeakerHigh, Microphone, Clock, Sparkle } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { VoiceLibrary } from '@/components/VoiceLibrary'
import { TextToSpeech } from '@/components/TextToSpeech'
import { VoiceCloning } from '@/components/VoiceCloning'
import { AudioHistory } from '@/components/AudioHistory'
import { toast } from 'sonner'
import { audioManager } from '@/lib/audio-manager'
import { performanceManager } from '@/lib/performance-manager'
import { createAudioError, reportAudioError, getErrorMessage } from '@/lib/error-handling'

interface Voice {
  id: string
  name: string
  category: 'trending' | 'celebrity' | 'custom' | 'professional'
  description: string
  previewUrl?: string
  isTrending?: boolean
  isCustom?: boolean
  quality: 'high' | 'premium' | 'ultra'
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

interface AudioSample {
  id: string
  name: string
  file: File
  duration: number
  url: string
}

const initialVoices: Voice[] = [
  {
    id: 'sarah-professional',
    name: 'Sarah',
    category: 'trending',
    description: 'Professional female voice, perfect for presentations',
    isTrending: true,
    quality: 'ultra',
    previewUrl: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmM'
  },
  {
    id: 'marcus-narrator',
    name: 'Marcus',
    category: 'trending',
    description: 'Deep male voice, ideal for storytelling and documentaries',
    isTrending: true,
    quality: 'ultra',
    previewUrl: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmM'
  },
  {
    id: 'emma-friendly',
    name: 'Emma',
    category: 'professional',
    description: 'Warm and friendly voice for customer service',
    quality: 'premium',
    previewUrl: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmM'
  },
  {
    id: 'james-corporate',
    name: 'James',
    category: 'professional',
    description: 'Authoritative corporate voice for business content',
    quality: 'premium',
    previewUrl: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmM'
  },
  {
    id: 'celebrity-morgan',
    name: 'Morgan Freeman Style',
    category: 'celebrity',
    description: 'Distinctive deep voice reminiscent of famous narrator',
    quality: 'ultra',
    previewUrl: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmM'
  },
  {
    id: 'celebrity-scarlett',
    name: 'Scarlett Style',
    category: 'celebrity',
    description: 'Sultry female voice with distinctive tone',
    quality: 'ultra',
    previewUrl: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmM'
  }
]

export default function App() {
  const [voices, setVoices] = useKV<Voice[]>('voices', initialVoices)
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null)
  const [audioHistory, setAudioHistory] = useKV<GeneratedAudio[]>('audioHistory', [])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [isCloning, setIsCloning] = useState(false)
  const [cloningProgress, setCloningProgress] = useState(0)
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)

  useEffect(() => {
    // Set default selected voice
    if (!selectedVoice && voices.length > 0) {
      setSelectedVoice(voices[0])
    }
  }, [voices, selectedVoice])

  // Cleanup audio manager on unmount
  useEffect(() => {
    return () => {
      audioManager.cleanup()
      performanceManager.cleanup()
    }
  }, [])

  const handleVoiceSelect = (voice: Voice) => {
    setSelectedVoice(voice)
  }

  const handlePreviewVoice = async (voice: Voice) => {
    try {
      const voicePreviewId = `voice-preview-${voice.id}`
      
      if (audioManager.isPlaying(voicePreviewId)) {
        // Stop playing
        audioManager.stopAudio(voicePreviewId)
        setPlayingVoiceId(null)
      } else {
        // Stop any other playing audio
        audioManager.stopAllAudio()
        
        // Generate preview audio using Web Audio API for demo
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        
        // Different frequencies for different voices
        const freq = voice.category === 'celebrity' ? 150 : 
                     voice.name.includes('Marcus') || voice.name.includes('James') ? 120 : 200
        
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime)
        oscillator.type = 'sine'
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2)
        
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 2)
        
        setPlayingVoiceId(voice.id)
        
        // Clean up after preview
        setTimeout(async () => {
          setPlayingVoiceId(null)
          await audioContext.close()
        }, 2000)
      }
    } catch (error) {
      const audioError = createAudioError('Failed to preview voice', 'playback', true)
      reportAudioError(audioError, 'voice-preview')
      toast.error(getErrorMessage(audioError))
    }
  }

  const simulateProgress = (setter: (value: number) => void, duration: number = 3000) => {
    return new Promise<void>((resolve) => {
      let progress = 0
      const interval = setInterval(() => {
        progress += Math.random() * 15
        if (progress >= 100) {
          progress = 100
          setter(progress)
          clearInterval(interval)
          resolve()
        } else {
          setter(progress)
        }
      }, duration / 20)
    })
  }

  const handleGenerate = async (text: string, voice: Voice, settings: any): Promise<GeneratedAudio> => {
    return performanceManager.executeWithConcurrencyLimit('tts', async (abortSignal) => {
      setIsGenerating(true)
      setGenerationProgress(0)

      try {
        await simulateProgress(setGenerationProgress, 4000)

        // Check if operation was aborted
        if (abortSignal?.aborted) {
          throw createAudioError('Generation was cancelled', 'unknown', false)
        }

        // Generate a mock audio URL (in real app, this would be from your TTS API)
        const audioUrl = `data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMcBhN+2e/bfiwEHXfS8+CQOA0Pe7jo554OBwdOpdTmu1wUBCOM1ejAUAAA`

        const newAudio: GeneratedAudio = {
          id: Date.now().toString(),
          text,
          voice,
          audioUrl,
          duration: Math.ceil(text.split(' ').length / 2.5), // Rough estimation
          quality: settings.quality,
          createdAt: new Date()
        }

        setAudioHistory(prev => [newAudio, ...prev])
        toast.success('Voice generated successfully!')
        return newAudio
      } catch (error) {
        const audioError = createAudioError('Failed to generate voice', 'unknown', true)
        reportAudioError(audioError, 'voice-generation')
        toast.error(getErrorMessage(audioError))
        throw audioError
      } finally {
        setIsGenerating(false)
        setGenerationProgress(0)
      }
    }, 'high')
  }

  const handleVoiceCloned = async (voiceName: string, samples: AudioSample[]) => {
    return performanceManager.executeWithConcurrencyLimit('clone', async (abortSignal) => {
      setIsCloning(true)
      setCloningProgress(0)

      try {
        await simulateProgress(setCloningProgress, 8000)

        // Check if operation was aborted
        if (abortSignal?.aborted) {
          throw createAudioError('Voice cloning was cancelled', 'unknown', false)
        }

        // Create blob URL using performance manager for the first sample
        const previewUrl = samples[0] ? performanceManager.createBlobUrl(samples[0].file, `preview-${voiceName}`) : undefined

        const newVoice: Voice = {
          id: `custom-${Date.now()}`,
          name: voiceName,
          category: 'custom',
          description: `Custom voice cloned from ${samples.length} samples`,
          isCustom: true,
          quality: 'ultra',
          previewUrl
        }

        setVoices(prev => [...prev, newVoice])
        toast.success(`Voice "${voiceName}" has been successfully cloned!`)
      } catch (error) {
        const audioError = createAudioError('Failed to clone voice', 'unknown', true)
        reportAudioError(audioError, 'voice-cloning')
        toast.error(getErrorMessage(audioError))
        throw audioError
      } finally {
        setIsCloning(false)
        setCloningProgress(0)
      }
    }, 'normal')
  }

  const handleDeleteAudio = (id: string) => {
    setAudioHistory(prev => prev.filter(audio => audio.id !== id))
    toast.success('Audio deleted successfully')
  }

  const handlePlayAudio = async (audio: GeneratedAudio) => {
    try {
      const audioId = `generated-${audio.id}`
      
      if (audioManager.isPlaying(audioId)) {
        // Stop playing
        audioManager.pauseAudio(audioId)
        setPlayingAudioId(null)
      } else {
        // Stop any other playing audio
        audioManager.stopAllAudio()
        
        // Create and play new audio with proper error handling
        audioManager.createAudio(audioId, audio.audioUrl, {
          onEnded: () => {
            setPlayingAudioId(null)
          },
          onError: (error) => {
            const audioError = createAudioError('Failed to play audio', 'playback', true, { audioId, error })
            reportAudioError(audioError, 'audio-playback')
            toast.error(getErrorMessage(audioError))
            setPlayingAudioId(null)
          }
        })
        
        await audioManager.playAudio(audioId)
        setPlayingAudioId(audio.id)
      }
    } catch (error) {
      const audioError = createAudioError('Failed to play audio', 'playback', true)
      reportAudioError(audioError, 'audio-playback')
      toast.error(getErrorMessage(audioError))
      setPlayingAudioId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-accent/20 rounded-xl">
              <Sparkle className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent">
              VoiceForge AI
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Professional text-to-voice generator with AI-powered voices, custom cloning, and studio-quality output
          </p>
          
          <div className="flex justify-center gap-4 mt-4">
            <Badge variant="secondary" className="gap-2">
              <SpeakerHigh className="w-4 h-4" />
              {voices.length} Voices Available
            </Badge>
            <Badge variant="secondary" className="gap-2">
              <Clock className="w-4 h-4" />
              {audioHistory.length} Generated
            </Badge>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="generate" className="gap-2">
              <SpeakerHigh className="w-4 h-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="voices" className="gap-2">
              <Waveform className="w-4 h-4" />
              Voice Library
            </TabsTrigger>
            <TabsTrigger value="clone" className="gap-2">
              <Microphone className="w-4 h-4" />
              Clone Voice
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <VoiceLibrary
                  voices={voices}
                  selectedVoice={selectedVoice}
                  onVoiceSelect={handleVoiceSelect}
                  onPreviewVoice={handlePreviewVoice}
                  isPlaying={playingVoiceId}
                />
              </div>
              <div className="lg:col-span-2">
                <TextToSpeech
                  selectedVoice={selectedVoice}
                  onGenerate={handleGenerate}
                  isGenerating={isGenerating}
                  generationProgress={generationProgress}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="voices">
            <VoiceLibrary
              voices={voices}
              selectedVoice={selectedVoice}
              onVoiceSelect={handleVoiceSelect}
              onPreviewVoice={handlePreviewVoice}
              isPlaying={playingVoiceId}
            />
          </TabsContent>

          <TabsContent value="clone">
            <VoiceCloning
              onVoiceCloned={handleVoiceCloned}
              isCloning={isCloning}
              cloningProgress={cloningProgress}
            />
          </TabsContent>

          <TabsContent value="history">
            <AudioHistory
              audioHistory={audioHistory}
              onDeleteAudio={handleDeleteAudio}
              onPlayAudio={handlePlayAudio}
              isPlaying={playingAudioId}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  )
}