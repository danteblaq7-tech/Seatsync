import { useEffect } from 'react'

/** Replaces the web's repeated "clear this error after N ms" effect. */
export default function useAutoClear (value, clear, ms = 5000) {
  useEffect(() => {
    if (!value) return undefined
    const timeout = setTimeout(clear, ms)
    return () => clearTimeout(timeout)
  }, [value, clear, ms])
}
