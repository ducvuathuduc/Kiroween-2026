import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'

interface AnimatedScoreProps {
  value: number
  className?: string
}

export default function AnimatedScore({
  value,
  className = '',
}: AnimatedScoreProps) {
  const prefersReduced = useReducedMotion()
  const [animated, setAnimated] = useState(value)

  useEffect(() => {
    if (prefersReduced) return
    const start = Math.max(0, value - 24)
    const controls = animate(start, value, {
      duration: 0.22,
      ease: 'easeOut',
      onUpdate: (latest) => setAnimated(Math.round(latest)),
    })
    return () => controls.stop()
  }, [value, prefersReduced])

  const shown = prefersReduced ? value : animated

  return (
    <span className={`font-mono tabular-nums ${className}`}>{shown}</span>
  )
}
