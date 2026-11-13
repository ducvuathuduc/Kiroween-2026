export type UpdateState = 'idle' | 'available' | 'reloading' | 'error'

/** Native lifecycle, deliberately independent of virtual:pwa-register's reload. */
export function startPwaUpdates(onState: (state: UpdateState) => void): () => void {
  if (!('serviceWorker' in navigator)) return () => {}
  let disposed = false
  let registration: ServiceWorkerRegistration | undefined
  let controlled = !!navigator.serviceWorker.controller
  const cleanups: (() => void)[] = []
  const emit = (state: UpdateState) => { if (!disposed) onState(state) }
  const onController = () => {
    if (controlled) emit('available')
    controlled = true
  }
  navigator.serviceWorker.addEventListener('controllerchange', onController)
  const check = () => {
    if (navigator.onLine) void registration?.update().catch(() => {})
  }
  window.addEventListener('online', check)
  window.addEventListener('focus', check)
  void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((reg) => {
      if (disposed) return
      registration = reg
      const watch = () => {
        const worker = reg.installing
        if (!worker) return
        const changed = () => {
          if (worker.state === 'installed' && controlled) emit('available')
        }
        worker.addEventListener('statechange', changed)
        cleanups.push(() => worker.removeEventListener('statechange', changed))
      }
      reg.addEventListener('updatefound', watch)
      cleanups.push(() => reg.removeEventListener('updatefound', watch))
      if (reg.waiting && controlled) emit('available')
      watch()
      check()
    }).catch(() => emit('error'))
  return () => {
    disposed = true
    navigator.serviceWorker.removeEventListener('controllerchange', onController)
    window.removeEventListener('online', check)
    window.removeEventListener('focus', check)
    cleanups.forEach((cleanup) => cleanup())
  }
}

/** Wait for activation before reloading; never silently discard the current page. */
export async function reloadPwa(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration) throw new Error('Offline installation is not ready. Try again online.')
  const worker = registration.installing ?? registration.waiting
  if (worker && worker.state !== 'activated' && worker.state !== 'redundant') {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error('Update is not ready. Try again online.')) }, 10000)
      const cleanup = () => { window.clearTimeout(timer); worker.removeEventListener('statechange', changed) }
      const changed = () => {
        if (worker.state === 'activated') { cleanup(); resolve() }
        if (worker.state === 'redundant') { cleanup(); reject(new Error('Update failed. Try again online.')) }
      }
      worker.addEventListener('statechange', changed)
    })
  }
  window.location.reload()
}
