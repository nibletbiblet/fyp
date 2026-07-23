import React, { useState } from 'react'
import { ShieldCheck, ArrowRight, Loader2, Lock, CheckCircle2 } from 'lucide-react'

export interface MyInfoBizData {
  businessType: string
  industrySector: string
  registeredAddress: string
  websiteUrl: string
  uen: string
  businessName: string
  repFullName: string
  repDesignation: string
  repContactNumber: string
  repNricLast4: string
  ubos: Array<{
    fullName: string
    nricOrPassport: string
    nationality: string
    ownershipPercentage: number
  }>
}

interface MyInfoBizModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectPersona: (data: MyInfoBizData) => void
}

const MOCK_CORPPASS_PERSONAS: Array<{
  title: string
  subtitle: string
  badge: string
  data: MyInfoBizData
}> = [
  {
    title: 'ACME Fintech Solutions Pte. Ltd.',
    subtitle: 'Standard Tech SME (Singapore ACRA Registered)',
    badge: 'LIVE ACRA Entity',
    data: {
      businessName: 'ACME Fintech Solutions Pte. Ltd.',
      uen: '201912345M',
      businessType: 'PRIVATE_LIMITED',
      industrySector: 'SOFTWARE_IT',
      registeredAddress: '71 Ayer Rajah Crescent, #03-12, Singapore 139951',
      websiteUrl: 'https://acmefintech.sg',
      repFullName: 'Tan Wei Ming',
      repDesignation: 'Managing Director',
      repContactNumber: '+65 9123 4567',
      repNricLast4: '567A',
      ubos: [
        { fullName: 'Tan Wei Ming', nricOrPassport: 'S1234567A', nationality: 'Singaporean', ownershipPercentage: 60 },
        { fullName: 'Lee Siew Ling', nricOrPassport: 'S7654321B', nationality: 'Singaporean', ownershipPercentage: 40 },
      ]
    }
  },
  {
    title: 'Merlion Retail Holdings Pte. Ltd.',
    subtitle: 'E-Commerce & Retail Enterprise',
    badge: 'LIVE ACRA Entity',
    data: {
      businessName: 'Merlion Retail Holdings Pte. Ltd.',
      uen: '202088991K',
      businessType: 'PRIVATE_LIMITED',
      industrySector: 'RETAIL_ECOMMERCE',
      registeredAddress: '1 Temasek Avenue, #18-01 Millenia Tower, Singapore 039192',
      websiteUrl: 'https://merlionretail.com.sg',
      repFullName: 'David Chen',
      repDesignation: 'Chief Executive Officer',
      repContactNumber: '+65 8899 1122',
      repNricLast4: '891K',
      ubos: [
        { fullName: 'David Chen', nricOrPassport: 'S8899112A', nationality: 'Singaporean', ownershipPercentage: 100 }
      ]
    }
  }
]

export const MyInfoBizModal: React.FC<MyInfoBizModalProps> = ({ isOpen, onClose, onSelectPersona }) => {
  const [loadingPersona, setLoadingPersona] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSelect = (title: string, data: MyInfoBizData) => {
    setLoadingPersona(title)
    setTimeout(() => {
      onSelectPersona(data)
      setLoadingPersona(null)
      onClose()
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-900">
        
        {/* GovTech Official Style Purple Banner */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition"
          >
            ✕
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">GovTech Singapore Standard</div>
              <h3 className="text-xl font-bold text-white">Corppass / MyInfo Business</h3>
            </div>
          </div>
          <p className="text-xs text-indigo-100 mt-3 leading-relaxed">
            Select a verified Singapore ACRA corporate test persona below to simulate official Singpass / Corppass authentication & data retrieval.
          </p>
        </div>

        {/* Personas Selection List */}
        <div className="p-6 space-y-3 bg-slate-50">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Available Test Personas</div>
          
          {MOCK_CORPPASS_PERSONAS.map((persona) => {
            const isLoading = loadingPersona === persona.title
            return (
              <div
                key={persona.title}
                onClick={() => !isLoading && handleSelect(persona.title, persona.data)}
                className="bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-500 rounded-2xl p-4 transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{persona.title}</span>
                    <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {persona.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{persona.subtitle}</p>
                  <div className="text-[11px] text-slate-600 pt-1 font-medium flex items-center gap-3">
                    <span>UEN: <strong className="text-indigo-600">{persona.data.uen}</strong></span>
                    <span>•</span>
                    <span>Director: <strong>{persona.data.repFullName}</strong></span>
                  </div>
                </div>

                <button className="bg-indigo-600 text-white group-hover:bg-indigo-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm shrink-0">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Authorizing...
                    </>
                  ) : (
                    <>
                      Use Persona <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>Protected by GovTech MyInfo Business OpenID Connect</span>
          <span className="text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 256-bit Encrypted
          </span>
        </div>
      </div>
    </div>
  )
}
