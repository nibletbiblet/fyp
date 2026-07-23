import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import logoIcon from '../assets/logo-icon.png'

// ── Types ──────────────────────────────────────────────────────────────────
interface LogLine {
  id: number
  prefix: 'OK' | 'WAIT' | 'ERR' | 'INFO'
  text: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
const HEX_CHARS = '0123456789ABCDEF'
const randomHex = (len: number) =>
  Array.from({ length: len }, () => HEX_CHARS[Math.floor(Math.random() * HEX_CHARS.length)]).join('')

const BOOT_SEQUENCE: Array<{ delay: number; prefix: LogLine['prefix']; text: string }> = [
  { delay: 0,    prefix: 'INFO', text: 'Initializing ChainForge runtime…' },
  { delay: 320,  prefix: 'INFO', text: 'Loading cryptographic primitives (secp256k1, keccak256)' },
  { delay: 640,  prefix: 'OK',   text: 'EVM executor loaded — version 2.0.0-testnet' },
  { delay: 900,  prefix: 'WAIT', text: 'Connecting to peer network…' },
  { delay: 1300, prefix: 'OK',   text: 'Discovered 14,892 validators' },
  { delay: 1600, prefix: 'INFO', text: 'Syncing chain state from block #21,844,291' },
  { delay: 1900, prefix: 'OK',   text: 'BFT consensus layer online — finality: 0.4s' },
  { delay: 2200, prefix: 'INFO', text: 'Verifying ZK proof registry…' },
  { delay: 2500, prefix: 'OK',   text: 'Proof verification passed — 2.1KB avg size' },
  { delay: 2750, prefix: 'OK',   text: 'Mempool synced — 1,847 pending transactions' },
  { delay: 3000, prefix: 'OK',   text: 'All systems nominal. Launching interface…' },
]

const TOTAL_DURATION = 3600 // ms until exit

// ── Sub-components ─────────────────────────────────────────────────────────
function HashScrambler({ final }: { final: string }) {
  const [display, setDisplay] = useState(randomHex(final.length))

  useEffect(() => {
    let frame = 0
    const frames = 18
    const id = setInterval(() => {
      frame++
      if (frame >= frames) {
        setDisplay(final)
        clearInterval(id)
      } else {
        setDisplay(
          final
            .split('')
            .map((c, i) => (i < Math.floor((frame / frames) * final.length) ? c : HEX_CHARS[Math.floor(Math.random() * 16)]))
            .join('')
        )
      }
    }, 60)
    return () => clearInterval(id)
  }, [final])

  return (
    <span className="font-mono-custom text-xs" style={{ color: 'rgba(240,165,0,0.5)', letterSpacing: '0.05em' }}>
      0x{display}
    </span>
  )
}

function LogPrefix({ type }: { type: LogLine['prefix'] }) {
  const styles: Record<LogLine['prefix'], { color: string; label: string }> = {
    OK:   { color: '#22c55e', label: ' OK  ' },
    WAIT: { color: '#f0a500', label: 'WAIT ' },
    ERR:  { color: '#ef4444', label: ' ERR ' },
    INFO: { color: 'rgba(255,255,255,0.3)', label: 'INFO ' },
  }
  const s = styles[type]
  return (
    <span
      className="font-mono-custom text-[10px] mr-3 flex-shrink-0"
      style={{ color: s.color, borderLeft: `2px solid ${s.color}`, paddingLeft: '6px' }}
    >
      {s.label}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
interface LoadingScreenProps {
  onComplete: () => void
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [blockHash, setBlockHash] = useState(randomHex(64))
  const [exiting, setExiting] = useState(false)
  const [blockNum, setBlockNum] = useState(21844291)
  const logEndRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)

  // Progress bar
  useEffect(() => {
    const start = performance.now()
    let raf: number

    const tick = (now: number) => {
      const elapsed = now - start
      const pct = Math.min(100, (elapsed / TOTAL_DURATION) * 100)
      setProgress(pct)
      if (pct < 100) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Boot log lines
  useEffect(() => {
    const timers = BOOT_SEQUENCE.map(({ delay, prefix, text }) =>
      setTimeout(() => {
        setLogs(prev => [...prev, { id: nextId.current++, prefix, text }])
      }, delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Hash scramble every 400ms
  useEffect(() => {
    const id = setInterval(() => setBlockHash(randomHex(64)), 400)
    return () => clearInterval(id)
  }, [])

  // Block number increments
  useEffect(() => {
    const id = setInterval(() => setBlockNum(n => n + 1), 12000)
    return () => clearInterval(id)
  }, [])

  // Trigger exit
  useEffect(() => {
    const id = setTimeout(() => {
      setExiting(true)
      setTimeout(onComplete, 700)
    }, TOTAL_DURATION)
    return () => clearTimeout(id)
  }, [onComplete])

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col"
          style={{ background: 'var(--bg)' }}
          aria-label="Loading ChainForge"
        >
          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />

          {/* Amber vertical accent */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent 0%, var(--amber) 30%, var(--amber) 70%, transparent 100%)', opacity: 0.5 }}
          />

          {/* ── Header bar ── */}
          <div
            className="flex items-center justify-between px-8 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-3">
              <motion.img
                src={logoIcon}
                alt="ChainForge"
                className="h-7 w-7 object-contain"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div>
                <div className="font-heading font-bold text-white text-sm tracking-wide uppercase">
                  ChainForge
                </div>
                <div className="font-mono-custom text-[9px]" style={{ color: 'var(--amber)' }}>
                  SYSTEM BOOT — v2.0.0
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden sm:flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#22c55e', animation: 'livepulse 1.4s ease-in-out infinite' }}
                />
                <span className="font-mono-custom text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  CHAIN ID: 1
                </span>
              </div>
              <span className="font-mono-custom text-[10px]" style={{ color: 'var(--text-muted)' }}>
                #{blockNum.toLocaleString()}
              </span>
            </div>
          </div>

          {/* ── Main content ── */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

            {/* Left: large status display */}
            <div
              className="flex flex-col justify-between p-8 lg:p-12 flex-shrink-0 lg:w-[45%]"
              style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
            >
              {/* Status heading */}
              <div>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="font-mono-custom text-[10px] mb-4"
                  style={{ color: 'var(--amber)' }}
                >
                  // BOOT SEQUENCE
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="font-heading font-bold text-white mb-2"
                  style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 0.9, letterSpacing: '-0.025em' }}
                >
                  Connecting<br />
                  <span style={{ color: 'var(--amber)' }}>to chain.</span>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="font-heading font-light text-sm mt-4"
                  style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
                >
                  Verifying consensus, syncing state,
                  and loading the runtime environment.
                </motion.p>
              </div>

              {/* Block hash display */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="mt-8"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px' }}
              >
                <div className="font-mono-custom text-[9px] mb-2" style={{ color: 'var(--text-muted)' }}>
                  LATEST BLOCK HASH
                </div>
                <div className="break-all">
                  <HashScrambler final={blockHash} />
                </div>
              </motion.div>

              {/* Progress */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="mt-8"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono-custom text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    INITIALIZING
                  </span>
                  <span
                    className="font-mono-custom text-[11px] font-bold tabular-nums"
                    style={{ color: 'var(--amber)' }}
                  >
                    {Math.floor(progress).toString().padStart(3, '0')}%
                  </span>
                </div>

                {/* Track */}
                <div
                  className="relative w-full overflow-hidden"
                  style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}
                >
                  {/* Fill */}
                  <motion.div
                    className="absolute left-0 top-0 h-full"
                    style={{
                      width: `${progress}%`,
                      background: 'var(--amber)',
                      boxShadow: '0 0 12px rgba(240,165,0,0.6)',
                    }}
                  />
                  {/* Shimmer on fill */}
                  <motion.div
                    className="absolute top-0 h-full w-12"
                    style={{
                      left: `${progress}%`,
                      transform: 'translateX(-100%)',
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                </div>

                {/* Sub-steps */}
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {['INIT', 'SYNC', 'VERIFY', 'READY'].map((step, i) => {
                    const threshold = [0, 33, 66, 95][i]
                    const active = progress >= threshold
                    return (
                      <div key={step} className="flex flex-col items-center gap-1">
                        <div
                          className="w-full h-px transition-all duration-500"
                          style={{ background: active ? 'var(--amber)' : 'rgba(255,255,255,0.08)' }}
                        />
                        <span
                          className="font-mono-custom text-[8px] transition-colors duration-500"
                          style={{ color: active ? 'var(--amber)' : 'rgba(255,255,255,0.15)' }}
                        >
                          {step}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </div>

            {/* Right: terminal log */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Log header */}
              <div
                className="flex items-center justify-between px-6 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-raised)' }}
              >
                <span className="font-mono-custom text-[10px]" style={{ color: 'var(--amber)' }}>
                  STDOUT://system.log
                </span>
                <div className="flex items-center gap-4">
                  <span className="font-mono-custom text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {logs.length}/{BOOT_SEQUENCE.length} messages
                  </span>
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#22c55e', animation: 'livepulse 1s step-end infinite' }}
                  />
                </div>
              </div>

              {/* Scrollable log output */}
              <div className="flex-1 overflow-y-auto px-6 py-4 font-mono-custom text-[11px] leading-7">
                {/* Static header */}
                <div style={{ color: 'rgba(255,255,255,0.12)' }} className="mb-3">
                  {`ChainForge Runtime v2.0.0-testnet (linux/amd64)`}<br />
                  {`Copyright (c) 2026 ChainForge Labs. All rights reserved.`}<br />
                  {`─`.repeat(52)}
                </div>

                {/* Dynamic log lines */}
                <AnimatePresence initial={false}>
                  {logs.map((line) => (
                    <motion.div
                      key={line.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-baseline gap-0 mb-0.5"
                    >
                      <LogPrefix type={line.prefix} />
                      <span style={{ color: line.prefix === 'OK' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)' }}>
                        {line.text}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Blinking cursor */}
                <div className="flex items-center gap-2 mt-1">
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>{'>'}</span>
                  <motion.span
                    className="inline-block w-2 h-3"
                    style={{ background: 'var(--amber)' }}
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                </div>

                <div ref={logEndRef} />
              </div>

              {/* Bottom: live tx feed */}
              <div
                className="flex-shrink-0 px-6 py-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-raised)' }}
              >
                <div className="font-mono-custom text-[9px] mb-2" style={{ color: 'var(--text-muted)' }}>
                  MEMPOOL — PENDING TXS
                </div>
                <div className="flex flex-col gap-1">
                  {[
                    { hash: '0x4f3b…a12c', gas: '21,000', value: '0.42 ETH' },
                    { hash: '0x8e1a…f77d', gas: '65,432', value: '0.00 ETH' },
                    { hash: '0x2c9e…b45f', gas: '42,100', value: '1.20 ETH' },
                  ].map((tx, i) => (
                    <motion.div
                      key={tx.hash}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 + i * 0.15 }}
                      className="flex items-center justify-between"
                    >
                      <span style={{ color: 'var(--amber)', fontSize: '10px' }}>{tx.hash}</span>
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px' }}>{tx.gas} gas</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }}>{tx.value}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer strip ── */}
          <div
            className="flex items-center justify-between px-8 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-raised)' }}
          >
            <span className="font-mono-custom text-[9px]" style={{ color: 'var(--text-muted)' }}>
              NETWORK: ETHEREUM SEPOLIA TESTNET / CHAIN ID: 11155111 / SANDBOX MODE
            </span>
            <span className="font-mono-custom text-[9px]" style={{ color: progress >= 100 ? '#22c55e' : 'var(--amber)' }}>
              {progress >= 100 ? '● READY' : '● BOOTING'}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
