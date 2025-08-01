import { useState } from 'react'
import { Clock, Download, Play, Pause, Trash, FileAudio, Calendar } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { audioManager } from '@/lib/audioManager'
import { toast } from 'sonner'

interface GeneratedAudio {
  id: string
  text: string
  voice: { id: string; name: string; category: string }
  audioUrl: string
  duration: number
  quality: string
  createdAt: Date
}

interface AudioHistoryProps {
  audioHistory: GeneratedAudio[]
  onDeleteAudio: (id: string) => void
  onPlayAudio: (audio: GeneratedAudio) => void
  isPlaying: string | null
}

export function AudioHistory({ audioHistory, onDeleteAudio, onPlayAudio, isPlaying }: AudioHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'duration'>('newest')
  const [filterVoice, setFilterVoice] = useState<string>('all')

  const filteredAndSortedAudio = audioHistory
    .filter(audio => 
      (filterVoice === 'all' || audio.voice.id === filterVoice) &&
      (audio.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
       audio.voice.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt.getTime() - a.createdAt.getTime()
        case 'oldest':
          return a.createdAt.getTime() - b.createdAt.getTime()
        case 'duration':
          return b.duration - a.duration
        default:
          return 0
      }
    })

  const uniqueVoices = Array.from(new Set(audioHistory.map(audio => audio.voice.id)))
    .map(voiceId => audioHistory.find(audio => audio.voice.id === voiceId)!.voice)

  const handleDownload = (audio: GeneratedAudio) => {
    try {
      const link = document.createElement('a')
      link.href = audio.audioUrl
      link.download = `voiceforge-${audio.voice.name}-${audio.id}.mp3`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Audio downloaded successfully!')
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download audio')
    }
  }

  const getTotalDuration = () => {
    return audioHistory.reduce((total, audio) => total + audio.duration, 0)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-accent" />
          Audio History
        </CardTitle>
        <CardDescription>
          Manage your generated voice files ({audioHistory.length} total, {formatDuration(getTotalDuration())} duration)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters and Search */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Input
              placeholder="Search audio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="duration">Longest First</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Select value={filterVoice} onValueChange={setFilterVoice}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by voice..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Voices</SelectItem>
                {uniqueVoices.map(voice => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Audio List */}
        {filteredAndSortedAudio.length === 0 ? (
          <div className="text-center py-12">
            <FileAudio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No audio files found</h3>
            <p className="text-muted-foreground">
              {audioHistory.length === 0 
                ? "Generate your first voice to see it here"
                : "Try adjusting your search or filters"
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredAndSortedAudio.map(audio => (
              <Card key={audio.id} className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Play/Pause Button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onPlayAudio(audio)}
                      className="mt-1"
                    >
                      {isPlaying === audio.id ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>

                    {/* Audio Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {audio.voice.name}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {audio.quality.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(audio.duration)}
                        </span>
                      </div>
                      
                      <p className="text-sm text-foreground mb-2 line-clamp-2">
                        {audio.text.length > 150 
                          ? audio.text.substring(0, 150) + '...'
                          : audio.text
                        }
                      </p>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(audio.createdAt)}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(audio)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDeleteAudio(audio.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}