import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Waveform, SpeakerHigh, Microphone, Clock, Sparkle } from '@phosphor-icons/react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { VoiceLibrary } from '@/components/VoiceLibrary'
import { TextToSpeech } from '@/components/TextToSpeech'
import { VoiceCloning } from '@/components/VoiceCloning'
import { AudioHistory } from '@/components/AudioHistory'
import { synthesizeVoice, generateVoicePreview } from '@/lib/audioSynthesis'
import { toast } from 'sonner'

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
    previewUrl: 'preview-available'
  },
  {
    id: 'marcus-narrator',
    name: 'Marcus',
    category: 'trending',
    description: 'Deep male voice, ideal for storytelling and documentaries',
    isTrending: true,
    quality: 'ultra',
    previewUrl: 'preview-available'
  },
  {
    id: 'emma-friendly',
    name: 'Emma',
    category: 'professional',
    description: 'Warm and friendly voice for customer service',
    quality: 'premium',
    previewUrl: 'preview-available'
  },
  {
    id: 'james-corporate',
    name: 'James',
    category: 'professional',
    description: 'Authoritative corporate voice for business content',
    quality: 'premium',
    previewUrl: 'preview-available'
  },
  {
    id: 'celebrity-morgan',
    name: 'Morgan Freeman Style',
    category: 'celebrity',
    description: 'Distinctive deep voice reminiscent of famous narrator',
    quality: 'ultra',
    previewUrl: 'preview-available'
  },
  {
    id: 'celebrity-scarlett',
    name: 'Scarlett Style',
    category: 'celebrity',
    description: 'Sultry female voice with distinctive tone',
    quality: 'ultra',
    previewUrl: 'preview-available'
  }
]

export default function App() {
  const [voices, setVoices] = useLocalStorage<Voice[]>('voices', initialVoices)
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null)
  const [audioHistory, setAudioHistory] = useLocalStorage<GeneratedAudio[]>('audioHistory', [])
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
    if (playingVoiceId === voice.id) {
      // Stop playing
      if (currentAudio) {
        currentAudio.pause()
        currentAudio.currentTime = 0
      }
      setPlayingVoiceId(null)
      setCurrentAudio(null)
    } else {
      // Start playing
      if (currentAudio) {
        currentAudio.pause()
      }
      
      try {
        setPlayingVoiceId(voice.id)
        
        // Generate actual voice preview
        const previewUrl = await generateVoicePreview(voice)
        
        const audio = new Audio(previewUrl)
        audio.addEventListener('ended', () => {
          setPlayingVoiceId(null)
          setCurrentAudio(null)
          URL.revokeObjectURL(previewUrl) // Clean up blob URL
        })
        audio.addEventListener('error', () => {
          setPlayingVoiceId(null)
          setCurrentAudio(null)
          toast.error('Failed to play voice preview')
        })
        
        await audio.play()
        setCurrentAudio(audio)
        
      } catch (error) {
        console.error('Preview error:', error)
        setPlayingVoiceId(null)
        toast.error('Failed to generate voice preview')
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
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
          const newProgress = prev + Math.random() * 10
          return newProgress >= 95 ? 95 : newProgress
        })
      }, 200)

      // Generate actual audio using Web Speech API
      const audioUrl = await synthesizeVoice(text, voice, settings)
      
      clearInterval(progressInterval)
      setGenerationProgress(100)

      const newAudio: GeneratedAudio = {
        id: Date.now().toString(),
        text,
        voice,
        audioUrl,
        duration: Math.ceil(text.split(' ').length / (2.5 * settings.speed)), // Adjust for speed
        quality: settings.quality,
        createdAt: new Date()
      }

      setAudioHistory(prev => [newAudio, ...prev])
      return newAudio
    } catch (error) {
      console.error('Generation error:', error)
      throw error
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

  const handlePlayAudio = (audio: GeneratedAudio) => {
    if (playingAudioId === audio.id) {
      // Stop playing
      if (currentAudio) {
        currentAudio.pause()
        currentAudio.currentTime = 0
      }
      setPlayingAudioId(null)
      setCurrentAudio(null)
    } else {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause()
      }

      // Create and play new audio
      const newAudio = new Audio(audio.audioUrl)
      newAudio.addEventListener('ended', () => {
        setPlayingAudioId(null)
        setCurrentAudio(null)
      })
      newAudio.addEventListener('pause', () => {
        setPlayingAudioId(null)
      })
      
      newAudio.play()
      setCurrentAudio(newAudio)
      setPlayingAudioId(audio.id)
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