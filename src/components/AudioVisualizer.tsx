import { useEffect, useRef, useState } from 'react'

interface AudioVisualizerProps {
  audioElement?: HTMLAudioElement
  isPlaying?: boolean
  className?: string
  height?: number
  barCount?: number
  color?: string
}

export function AudioVisualizer({ 
  audioElement, 
  isPlaying = false, 
  className = '', 
  height = 40,
  barCount = 20,
  color = 'rgb(234, 88, 12)' // accent color
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const analyserRef = useRef<AnalyserNode>()
  const dataArrayRef = useRef<Uint8Array>()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (audioElement && !isInitialized) {
      initializeAudioContext()
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [audioElement, isInitialized])

  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      startVisualization()
    } else {
      stopVisualization()
    }
  }, [isPlaying])

  const initializeAudioContext = async () => {
    if (!audioElement || isInitialized) return

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaElementSource(audioElement)
      const analyser = audioContext.createAnalyser()
      
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.8
      
      source.connect(analyser)
      analyser.connect(audioContext.destination)
      
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      
      analyserRef.current = analyser
      dataArrayRef.current = dataArray
      setIsInitialized(true)
      
    } catch (error) {
      console.warn('Audio visualization not available:', error)
    }
  }

  const startVisualization = () => {
    if (!analyserRef.current || !dataArrayRef.current) return
    
    const draw = () => {
      if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return
      
      analyserRef.current.getByteFrequencyData(dataArrayRef.current)
      
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      const width = canvas.width
      const height = canvas.height
      
      ctx.clearRect(0, 0, width, height)
      
      const barWidth = width / barCount
      let x = 0
      
      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * dataArrayRef.current.length)
        const barHeight = (dataArrayRef.current[dataIndex] / 255) * height
        
        // Create gradient for bars
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, color)
        gradient.addColorStop(1, color + '80') // Add transparency
        
        ctx.fillStyle = gradient
        ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight)
        
        x += barWidth
      }
      
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(draw)
      }
    }
    
    draw()
  }

  const stopVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
    }
  }

  const drawStaticBars = () => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const width = canvas.width
    const height = canvas.height
    
    ctx.clearRect(0, 0, width, height)
    
    const barWidth = width / barCount
    let x = 0
    
    // Draw static bars with random heights for visual appeal
    for (let i = 0; i < barCount; i++) {
      const barHeight = Math.random() * height * 0.3 + height * 0.1
      
      ctx.fillStyle = color + '40' // Very transparent
      ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight)
      
      x += barWidth
    }
  }

  useEffect(() => {
    if (!isPlaying && canvasRef.current) {
      drawStaticBars()
    }
  }, [isPlaying, barCount, color])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={height}
      className={`w-full ${className}`}
      style={{ height: `${height}px` }}
    />
  )
}

// Simple waveform visualizer for recordings
export function WaveformVisualizer({ 
  isRecording = false,
  className = '',
  height = 30,
  color = 'rgb(34, 197, 94)' // green color for recording
}: {
  isRecording?: boolean
  className?: string
  height?: number
  color?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const dataPoints = useRef<number[]>([])

  useEffect(() => {
    if (isRecording) {
      startRecordingVisualization()
    } else {
      stopRecordingVisualization()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRecording])

  const startRecordingVisualization = () => {
    const animate = () => {
      if (!canvasRef.current) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const width = canvas.width
      const height = canvas.height

      // Add new data point
      const newPoint = Math.random() * 0.8 + 0.2 // Random amplitude
      dataPoints.current.push(newPoint)

      // Keep only recent points
      const maxPoints = Math.floor(width / 3)
      if (dataPoints.current.length > maxPoints) {
        dataPoints.current.shift()
      }

      // Clear and draw
      ctx.clearRect(0, 0, width, height)
      
      if (dataPoints.current.length > 1) {
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath()

        const pointSpacing = width / (dataPoints.current.length - 1)
        
        dataPoints.current.forEach((point, index) => {
          const x = index * pointSpacing
          const y = height / 2 + (point * height / 2 * Math.sin(Date.now() * 0.01 + index))
          
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        
        ctx.stroke()
      }

      if (isRecording) {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }

    animate()
  }

  const stopRecordingVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    dataPoints.current = []
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={height}
      className={`w-full ${className}`}
      style={{ height: `${height}px` }}
    />
  )
}