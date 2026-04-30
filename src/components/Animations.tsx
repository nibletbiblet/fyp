import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

interface CounterProps {
  target: string // e.g. "$4.2B" or "99.97%"
  duration?: number
}

export function Counter({ target, duration = 1500 }: CounterProps) {
  const [display, setDisplay] = useState('000')
  const ref = useRef<HTMLSpanElement>(null)
  const triggered = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          triggered.current = true
          const chars = '0123456789'
          const frames = 20
          let frame = 0
          const id = setInterval(() => {
            frame++
            if (frame >= frames) {
              setDisplay(target)
              clearInterval(id)
            } else {
              setDisplay(
                target
                  .split('')
                  .map((c) =>
                    /[0-9]/.test(c)
                      ? chars[Math.floor(Math.random() * chars.length)]
                      : c
                  )
                  .join('')
              )
            }
          }, duration / frames)
        }
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target, duration])

  return <span ref={ref}>{display}</span>
}

interface TypewriterProps {
  text: string
  delay?: number
  className?: string
}

export function Typewriter({ text, delay = 0, className = '' }: TypewriterProps) {
  const [displayed, setDisplayed] = useState('')
  const ref = useRef<HTMLSpanElement>(null)
  const triggered = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          triggered.current = true
          let i = 0
          setTimeout(() => {
            const id = setInterval(() => {
              i++
              setDisplayed(text.slice(0, i))
              if (i >= text.length) clearInterval(id)
            }, 30)
          }, delay)
        }
      },
      { threshold: 0.2 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [text, delay])

  return (
    <span ref={ref} className={className}>
      {displayed}
      <span
        className="inline-block w-0.5 h-[1em] ml-0.5 align-middle"
        style={{
          background: 'var(--amber)',
          animation: 'livepulse 1s step-end infinite',
          opacity: displayed.length < text.length ? 1 : 0,
        }}
      />
    </span>
  )
}

interface FadeUpProps {
  children: React.ReactNode
  delay?: number
  className?: string
}

export function FadeUp({ children, delay = 0, className = '' }: FadeUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
