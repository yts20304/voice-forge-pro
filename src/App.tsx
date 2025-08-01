import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Waveform, SpeakerHigh, Microphone, Clock, Sparkle } from '@phosphor-icons/react'
import { VoiceLibrary } from '@/components/VoiceLibrary'
import { TextToSpeech } from '@/components/TextToSpeech'
import { VoiceCloning } from '@/components/VoiceCloning'
import { AudioHistory } from '@/components/AudioHistory'
import { audioManager } from '@/lib/audioManager'
import { toast } from 'sonner'

// Simple localStorage hook replacement
function useKV<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setValue = (value: T | ((prev: T) => T)) => {
    setState(prev => {
      const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value
      try {
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch {
        // Ignore localStorage errors
      }
      return newValue
    })
  }

  return [state, setValue]
}

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
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)

  useEffect(() => {
    // Set default selected voice
    if (!selectedVoice && voices.length > 0) {
      setSelectedVoice(voices[0])
    }
  }, [voices, selectedVoice])

  const handleVoiceSelect = (voice: Voice) => {
    setSelectedVoice(voice)
  }

  const handlePreviewVoice = async (voice: Voice) => {
    const previewId = `preview-${voice.id}`
    
    if (playingVoiceId === voice.id) {
      // Stop playing
      audioManager.stopAudio(previewId)
      setPlayingVoiceId(null)
    } else {
      try {
        // Stop any currently playing preview
        if (playingVoiceId) {
          audioManager.stopAudio(`preview-${playingVoiceId}`)
        }
        
        // Generate realistic voice preview
        await audioManager.generateVoicePreview({
          voiceId: voice.id,
          category: voice.category,
          gender: voice.name.includes('Marcus') || voice.name.includes('James') || voice.name.includes('Morgan') ? 'male' : 'female'
        })
        
        setPlayingVoiceId(voice.id)
        
        // Auto-stop after preview duration
        setTimeout(() => {
          setPlayingVoiceId(null)
        }, 2000)
        
      } catch (error) {
        console.error('Failed to preview voice:', error)
        toast.error('Failed to preview voice. Please try again.')
      }
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
    setIsGenerating(true)
    setGenerationProgress(0)

    try {
      await simulateProgress(setGenerationProgress, 4000)

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
      return newAudio
    } finally {
      setIsGenerating(false)
      setGenerationProgress(0)
    }
  }

  const handleVoiceCloned = async (voiceName: string, samples: AudioSample[]) => {
    setIsCloning(true)
    setCloningProgress(0)

    try {
      await simulateProgress(setCloningProgress, 8000)

      const newVoice: Voice = {
        id: `custom-${Date.now()}`,
        name: voiceName,
        category: 'custom',
        description: `Custom voice cloned from ${samples.length} samples`,
        isCustom: true,
        quality: 'ultra',
        previewUrl: samples[0]?.url
      }

      setVoices(prev => [...prev, newVoice])
      toast.success(`Voice "${voiceName}" has been successfully cloned!`)
    } finally {
      setIsCloning(false)
      setCloningProgress(0)
    }
  }

  const handleDeleteAudio = (id: string) => {
    setAudioHistory(prev => prev.filter(audio => audio.id !== id))
    toast.success('Audio deleted successfully')
  }

  const handlePlayAudio = async (audio: GeneratedAudio) => {
    const audioId = `generated-${audio.id}`
    
    if (playingAudioId === audio.id) {
      // Stop playing
      audioManager.stopAudio(audioId)
      setPlayingAudioId(null)
    } else {
      try {
        // Stop any currently playing audio
        if (playingAudioId) {
          audioManager.stopAudio(`generated-${playingAudioId}`)
        }

        // Play new audio with error handling
        await audioManager.playAudio(audio.audioUrl, audioId)
        setPlayingAudioId(audio.id)
        
        // Setup completion handler
        const checkCompletion = () => {
          if (!audioManager.isPlaying(audioId)) {
            setPlayingAudioId(null)
          } else {
            setTimeout(checkCompletion, 100)
          }
        }
        checkCompletion()
        
      } catch (error) {
        console.error('Failed to play audio:', error)
        setPlayingAudioId(null)
        toast.error('Failed to play audio. Please try again.')
      }
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