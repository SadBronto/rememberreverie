import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportEvent } from '@/lib/report'
import {
  isKioskHost, nextRecoveryDelay, readAttempts, recordAttempt, shouldAutoReload,
} from '@/lib/recover'

interface State {
  crashed: boolean
  auto: boolean   // will it restart by itself?
}

// The crash catcher. Without it, one unexpected error anywhere in the app unmounts the
// whole page and leaves a blank screen with no way back. With it:
//   - the problem is logged (so we can see which venue had it, and why)
//   - the screen shows a calm message on the brand background, never a white page
//   - the page restarts itself after a short, growing delay. A venue display retries
//     forever; a guest's phone retries a few times, then shows a Reload button.
export default class CrashGuard extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false, auto: false }
  private timer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(): Partial<State> {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportEvent('client_crash', `${error.name}: ${error.message}\n${(info.componentStack ?? '').trim().slice(0, 300)}`)

    const attemptsSoFar = readAttempts()
    const auto = shouldAutoReload(attemptsSoFar, isKioskHost())
    this.setState({ auto })
    if (auto) {
      recordAttempt()
      this.timer = setTimeout(() => window.location.reload(), nextRecoveryDelay(attemptsSoFar))
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-5 text-center px-8">
        <p className="text-serif text-cream/70 text-2xl">One moment</p>
        <p className="text-sans text-cream/40 text-sm font-light max-w-[300px] leading-relaxed">
          {this.state.auto
            ? 'Reverie hit a snag and is restarting by itself.'
            : 'Reverie hit a snag. Please reload to continue.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-8 py-3 rounded-full border border-cream/25 text-cream/70 text-sans text-xs tracking-widest uppercase touch-manipulation active:scale-[0.97]"
        >
          Reload now
        </button>
      </div>
    )
  }
}
