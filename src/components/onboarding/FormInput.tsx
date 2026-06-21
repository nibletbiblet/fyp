import { useState } from 'react'

interface FormInputProps {
  label: string
  name: string
  type?: string
  placeholder?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  validate?: (value: string) => boolean
  error?: string
  required?: boolean
}

export default function FormInput({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  validate,
  error,
  required = false,
}: FormInputProps) {
  const [touched, setTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isValid = validate ? validate(value) : value.length > 0
  const showState = touched && value.length > 0

  const inputType = type === 'password' && showPassword ? 'text' : type

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={name}>
        {label} {required && <span style={{ color: '#f0a500' }}>*</span>}
      </label>
      <div className={type === 'password' ? 'form-input-password-wrap' : ''}>
        <input
          id={name}
          name={name}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={() => setTouched(true)}
          className={`form-input ${showState ? (isValid ? 'valid' : 'invalid') : ''}`}
          autoComplete={type === 'password' ? 'new-password' : 'off'}
        />
        {type === 'password' && (
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {showState && !isValid && error && <div className="form-error">{error}</div>}
    </div>
  )
}
