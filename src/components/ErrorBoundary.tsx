// 한 부분이 고장 나도 화면 전체가 하얗게 되지 않도록 막는 틀.
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 고장 났을 때 보여 줄 내용. retry를 부르면 다시 그려 본다 */
  fallback: (retry: () => void) => ReactNode
  /** 이 값이 바뀌면 고장 상태를 풀고 다시 그린다 */
  resetKey?: string
  /** 고장을 잡았을 때 한 번 부른다 (다시 불러올 준비를 할 때 쓴다) */
  onError?: () => void
}

interface ErrorBoundaryState {
  failed: boolean
  seenKey: string | undefined
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, seenKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.seenKey) return { failed: false, seenKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('화면 일부를 그리지 못했어요', error, info.componentStack)
    this.props.onError?.()
  }

  retry = (): void => {
    this.setState({ failed: false })
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children
  }
}

/** 패널이 고장 났을 때 쓰는 조용한 안내 */
export function PanelFallback({ retry }: { retry: () => void }) {
  return (
    <div className="card p-4" role="alert">
      <p className="text-sm text-ink">이 부분을 불러오지 못했어요.</p>
      <p className="hint mt-1">작업한 내용은 그대로 저장돼 있어요.</p>
      <button type="button" className="btn btn-sm mt-3" onClick={retry}>
        다시 시도
      </button>
    </div>
  )
}
