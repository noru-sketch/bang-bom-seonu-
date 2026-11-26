// cm 같은 숫자를 넣는 칸. 글자를 칠 때마다가 아니라 칸을 벗어나거나 Enter를 누를 때 한 번만 반영한다
// (실행취소 한 단계가 숫자 한 번 고친 것과 맞도록).
import { useId, useState } from 'react'

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
  /** 칸 아래에 작게 보여 줄 도움말 */
  hint?: string
  disabled?: boolean
}

export default function NumberField({ label, value, min, max, onCommit, hint, disabled }: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const [seenValue, setSeenValue] = useState(value)
  const [adjusted, setAdjusted] = useState(false)

  // 바깥 값이 바뀌면(실행취소, 다른 칸의 영향) 칸의 글자도 따라간다
  if (seenValue !== value) {
    setSeenValue(value)
    setText(String(value))
  }

  function commit(): void {
    const parsed = Number(text.replace(/[^0-9.]/g, ''))
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      setText(String(value))
      return
    }
    const upper = Math.max(min, max)
    const next = Math.min(upper, Math.max(min, Math.round(parsed)))
    setAdjusted(next !== Math.round(parsed))
    setText(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        disabled={disabled}
        value={text}
        aria-describedby={hint || adjusted ? `${id}-hint` : undefined}
        onChange={(event) => {
          setText(event.target.value)
          setAdjusted(false)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            setText(String(value))
          }
        }}
      />
      {(hint || adjusted) && (
        <p id={`${id}-hint`} className="hint mt-1" aria-live="polite">
          {adjusted ? `${min}~${Math.max(min, max)} 사이로 맞췄어요.` : hint}
        </p>
      )}
    </div>
  )
}
