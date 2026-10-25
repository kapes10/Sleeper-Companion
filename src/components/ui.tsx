import { Component, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { describeError } from '../api/client';

export function Screen({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-50 break-words">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-400">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'secondary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:text-slate-300'
      : 'bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-60';
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 rounded-lg px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${styles} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg bg-slate-900 p-4 text-slate-300">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorMessage({ error, onRetry, title = 'Something went wrong' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-900 bg-red-950/60 p-4 text-red-100">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-red-200">{describeError(error)}</p>
      {onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const styles = tone === 'warn' ? 'border-amber-800 bg-amber-950/50 text-amber-100' : 'border-slate-800 bg-slate-900 text-slate-300';
  return <div className={`rounded-lg border p-3 text-sm ${styles}`}>{children}</div>;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Last-resort guard so an unexpected bug shows a message instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <Screen title="Sleeper Companion">
          <ErrorMessage error={this.state.error} title="The app hit an unexpected problem" onRetry={() => location.reload()} />
        </Screen>
      );
    }
    return this.props.children;
  }
}
