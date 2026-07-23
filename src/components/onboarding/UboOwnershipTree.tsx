import React, { useState } from 'react'
import { Users, Plus, Trash2, UserCheck } from 'lucide-react'

export interface UboEntry {
  id: string
  fullName: string
  nricOrPassport: string
  nationality: string
  ownershipPercentage: number
  isPep: boolean
  designation: string
}

interface UboOwnershipTreeProps {
  ubos: UboEntry[]
  onChangeUbos: (ubos: UboEntry[]) => void
}

export const UboOwnershipTree: React.FC<UboOwnershipTreeProps> = ({ ubos, onChangeUbos }) => {
  const [newFullName, setNewFullName] = useState('')
  const [newNric, setNewNric] = useState('')
  const [newPercentage, setNewPercentage] = useState<number>(50)

  const totalPercentage = ubos.reduce((acc, curr) => acc + curr.ownershipPercentage, 0)

  const handleAddUbo = () => {
    if (!newFullName.trim() || !newNric.trim()) return
    const entry: UboEntry = {
      id: `ubo_${Date.now()}`,
      fullName: newFullName.trim(),
      nricOrPassport: newNric.trim().toUpperCase(),
      nationality: 'Singaporean',
      ownershipPercentage: Number(newPercentage),
      isPep: false,
      designation: 'Shareholder',
    }
    onChangeUbos([...ubos, entry])
    setNewFullName('')
    setNewNric('')
    setNewPercentage(50)
  }

  const handleRemoveUbo = (id: string) => {
    onChangeUbos(ubos.filter((u) => u.id !== id))
  }

  return (
    <div className="space-y-4 bg-brand-gray border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-white/70" /> Corporate Beneficial Ownership (UBO Tree)
          </h4>
          <p className="text-xs text-white/40 mt-0.5">
            Declare all individuals owning <span className="text-white font-medium">≥ 25% equity</span> per MAS AML guidelines.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/40">Total Ownership</div>
          <div className={`text-sm font-bold ${totalPercentage >= 100 ? 'text-emerald-400' : 'text-white'}`}>
            {totalPercentage}% Declared
          </div>
        </div>
      </div>

      {/* Visual Ownership Bar */}
      <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden flex">
        {ubos.map((u) => (
          <div
            key={u.id}
            style={{ width: `${Math.min(u.ownershipPercentage, 100)}%` }}
            className="h-full bg-white border-r border-black"
            title={`${u.fullName}: ${u.ownershipPercentage}%`}
          />
        ))}
      </div>

      {/* UBO Shareholder Cards */}
      {ubos.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-white/10 rounded-xl text-xs text-white/30">
          No shareholders declared yet. Add your company shareholders below.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 pt-1">
          {ubos.map((u) => (
            <div key={u.id} className="bg-black/40 border border-white/10 rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{u.fullName}</span>
                    <span className="bg-white/10 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {u.ownershipPercentage}% Share
                    </span>
                  </div>
                  <div className="text-[11px] text-white/40 flex items-center gap-2 pt-0.5">
                    <span>ID: {u.nricOrPassport}</span>
                    <span>•</span>
                    <span>{u.nationality}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveUbo(u.id)}
                className="text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Shareholder Inline Form */}
      <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Shareholder Name"
          value={newFullName}
          onChange={(e) => setNewFullName(e.target.value)}
          className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 flex-1 min-w-[140px] outline-none focus:ring-1 focus:ring-white/30"
        />
        <input
          type="text"
          placeholder="NRIC / Passport"
          value={newNric}
          onChange={(e) => setNewNric(e.target.value)}
          className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 w-32 outline-none focus:ring-1 focus:ring-white/30"
        />
        <div className="flex items-center gap-1 bg-black/50 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white">
          <span className="text-white/40">%</span>
          <input
            type="number"
            min="1"
            max="100"
            value={newPercentage}
            onChange={(e) => setNewPercentage(Number(e.target.value))}
            className="bg-transparent w-10 text-center font-bold text-white outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleAddUbo}
          disabled={!newFullName.trim() || !newNric.trim()}
          className="bg-white text-black hover:bg-white/90 disabled:opacity-30 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add Shareholder
        </button>
      </div>
    </div>
  )
}
