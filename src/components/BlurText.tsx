import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

interface BlurTextProps {
  text: string
  className?: string
  delay?: number
  splitBy?: 'words' | 'letters'
  direction?: 'bottom' | 'top'
}

export default function BlurText({
  text,
  className = '',
  delay = 100,
  splitBy = 'words',
  direction = 'bottom',
}: BlurTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const elements = splitBy === 'words' ? text.split(' ') : text.split('')

  const initial =
    direction === 'bottom'
      ? { filter: 'blur(10px)', opacity: 0, y: 50 }
      : { filter: 'blur(10px)', opacity: 0, y: -50 }

  const final = { filter: 'blur(0px)', opacity: 1, y: 0 }

  return (
    <div ref={ref} className={className} aria-label={text}>
      {elements.map((el, i) => (
        <motion.span
          key={i}
          className="inline-block"
          style={{ marginRight: splitBy === 'words' ? '0.3em' : '0' }}
          initial={initial}
          animate={inView ? final : initial}
          variants={{
            hidden: initial,
            visible: {
              ...final,
              transition: {
                duration: 0.7,
                delay: (i * delay) / 1000,
                ease: [0.25, 0.46, 0.45, 0.94],
              },
            },
          }}
          transition={{
            duration: 0.7,
            delay: inView ? (i * delay) / 1000 : 0,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          {el}
        </motion.span>
      ))}
    </div>
  )
}
