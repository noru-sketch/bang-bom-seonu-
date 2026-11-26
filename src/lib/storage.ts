// 기기 안 저장소. 웹과 Capacitor 웹뷰 모두 localStorage를 쓴다.
// 저장소를 못 쓰는 환경(시크릿 창, 용량 초과)에서도 앱이 멈추지 않도록 오류는 삼킨다.

const PREFIX = 'bangkkumi2.'

export function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

/** 저장에 성공하면 true */
export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeJson(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // 저장소를 못 쓰는 환경에서는 지울 것도 없다
  }
}
