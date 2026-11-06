import { useEffect, useRef, type ReactNode } from 'react'

const revealTargets = [
  '.metric', '.next-card', '.player-card', '.match-row', '.stat-hero',
  '.table-wrap', '.attendance-history article', '.attendance-list article',
  '.ranking-list li', '.validated-lineup', '.detail-list article',
].join(',')

/** Reveal each item once as it enters the viewport; live data updates stay still. */
export function MotionPage({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = root.current
    if (!element) return
    window.scrollTo({ top: 0, behavior: 'auto' })
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!('IntersectionObserver' in window) || !element.animate) return

    const seen = new WeakSet<Element>()
    const animations = new Set<Animation>()
    const intersection = new IntersectionObserver(entries => {
      let order = 0
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        intersection.unobserve(entry.target)
        if (preference.matches) continue
        // Never hide content while waiting for an observer or a scroll event.
        const animation = entry.target.animate([
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 320, delay: Math.min(order++ * 28, 112), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' })
        animations.add(animation)
        animation.onfinish = () => animations.delete(animation)
      }
    }, { threshold: 0.04 })

    const discover = () => element.querySelectorAll(revealTargets).forEach(target => {
      if (seen.has(target)) return
      seen.add(target)
      intersection.observe(target)
    })
    const stopAnimations = () => {
      if (preference.matches) {
        animations.forEach(animation => animation.cancel())
        animations.clear()
      }
    }
    discover()
    const mutations = new MutationObserver(discover)
    mutations.observe(element, { childList: true, subtree: true })
    preference.addEventListener('change', stopAnimations)
    return () => {
      intersection.disconnect()
      mutations.disconnect()
      preference.removeEventListener('change', stopAnimations)
      animations.forEach(animation => animation.cancel())
    }
  }, [])

  return <div className="motion-page" ref={root}>{children}</div>
}
