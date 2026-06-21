import { useState } from 'react'
import LoadingScreen from '../components/LoadingScreen'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import StartSection from '../components/StartSection'
import FeaturesChess from '../components/FeaturesChess'
import FeaturesGrid from '../components/FeaturesGrid'
import Stats from '../components/Stats'
import Testimonials from '../components/Testimonials'
import CtaFooter from '../components/CtaFooter'

export default function LandingPage() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div style={{ background: 'var(--bg)' }}>
      {/* Loading screen — sits on top, fades out when done */}
      <LoadingScreen onComplete={() => setLoaded(true)} />

      {/* Main page content — fades in once loader exits */}
      <div
        style={{
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.6s ease-in-out',
          transitionDelay: loaded ? '0.1s' : '0s',
        }}
      >
        <Navbar />
        <Hero />
        <StartSection />
        <FeaturesChess />
        <FeaturesGrid />
        <Stats />
        <Testimonials />
        <CtaFooter />
      </div>
    </div>
  )
}
