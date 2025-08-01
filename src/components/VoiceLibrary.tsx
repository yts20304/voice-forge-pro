import { useState } from 'react'
import { Play, Pause, Download, Waveform, Microphone, Settings, Upload, Clock } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

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

interface VoiceLibraryProps {
  voices: Voice[]
  selectedVoice: Voice | null
  onVoiceSelect: (voice: Voice) => void
  onPreviewVoice: (voice: Voice) => void
  isPlaying: string | null
}

export function VoiceLibrary({ voices, selectedVoice, onVoiceSelect, onPreviewVoice, isPlaying }: VoiceLibraryProps) {
  const [filter, setFilter] = useState<string>('all')

  const filteredVoices = voices.filter(voice => 
    filter === 'all' || voice.category === filter
  )

  const categories = [
    { id: 'all', label: 'All Voices', count: voices.length },
    { id: 'trending', label: 'Trending', count: voices.filter(v => v.category === 'trending').length },
    { id: 'celebrity', label: 'Celebrity', count: voices.filter(v => v.category === 'celebrity').length },
    { id: 'professional', label: 'Professional', count: voices.filter(v => v.category === 'professional').length },
    { id: 'custom', label: 'Custom', count: voices.filter(v => v.category === 'custom').length },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waveform className="w-5 h-5 text-accent" />
          Voice Library
        </CardTitle>
        <CardDescription>Choose from trending AI voices or upload your own</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          {categories.map(category => (
            <Button
              key={category.id}
              variant={filter === category.id ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(category.id)}
              className="text-xs"
            >
              {category.label} ({category.count})
            </Button>
          ))}
        </div>

        {/* Voice Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
          {filteredVoices.map(voice => (
            <Card 
              key={voice.id}
              className={`cursor-pointer transition-all hover:ring-2 hover:ring-ring ${
                selectedVoice?.id === voice.id ? 'ring-2 ring-accent bg-accent/10' : ''
              }`}
              onClick={() => onVoiceSelect(voice)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                      {voice.name}
                      {voice.isTrending && (
                        <Badge variant="secondary" className="text-xs bg-accent/20 text-accent">
                          Trending
                        </Badge>
                      )}
                      {voice.isCustom && (
                        <Badge variant="outline" className="text-xs">
                          Custom
                        </Badge>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">{voice.description}</p>
                    <Badge variant="outline" className="text-xs">
                      {voice.quality.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                
                {voice.previewUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full mt-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPreviewVoice(voice)
                    }}
                  >
                    {isPlaying === voice.id ? (
                      <>
                        <Pause className="w-3 h-3 mr-1" />
                        Pause Preview
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 mr-1" />
                        Preview Voice
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}