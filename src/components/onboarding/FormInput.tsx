import React from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  helperText?: string
  isValid?: boolean
  validationMessage?: string
}

export const FormInput: React.FC<FormInputProps> = ({
  label,
  error,
  helperText,
  isValid,
  validationMessage,
  className = '',
  ...props
}) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        {isValid !== undefined && props.value && (
          <span
            className={`text-xs font-semibold flex items-center gap-1 transition-all ${
              isValid ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {isValid ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {validationMessage || 'Checksum Validated'}
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> {validationMessage || 'Invalid Format'}
              </>
            )}
          </span>
        )}
      </div>

      <div className="relative">
        <input
          {...props}
          className={`w-full bg-slate-900 border rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
            error
              ? 'border-red-500 focus:ring-red-500/20'
              : isValid
              ? 'border-emerald-500/60 focus:ring-emerald-500/20'
              : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/20'
          } ${className}`}
        />
      </div>

      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  )
}
