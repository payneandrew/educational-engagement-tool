import { onMounted, onUnmounted, reactive, watch, type Ref } from 'vue'

/** How long a new post must stay in view before it counts as read. */
const DWELL_MS = 1000

/**
 * Unread tracking for the posts tagged "New" (`newIds`), in a discussion that scrolls: the panel on
 * desktop, the whole page on phones.
 * - A new post is read once it has stayed near the middle of the screen for DWELL_MS while the tab is
 *   visible. It then leaves `newIds`, so its tag fades. A post at the very edge hasn't been reached yet,
 *   and a post taller than the screen counts as soon as part of it is in the middle.
 * - `hidden` counts the unread posts scrolled out of view, above and below, for the "N new" pills.
 *
 * `rendered` is anything that changes when the list does, so the observers follow the posts on screen.
 */
export function useUnreadPosts(
  scroller: Ref<HTMLElement | undefined>,
  newIds: Set<string>,
  rendered: () => unknown,
): { hidden: { above: number; below: number }; jumpToNew: (side: 'above' | 'below') => void } {
  const hidden = reactive({ above: 0, below: 0 })
  const inMiddle = new Set<string>()
  const dwelling = new Map<string, ReturnType<typeof setTimeout>>()
  const unreadPosts = () => [...(scroller.value?.querySelectorAll('[data-new]') ?? [])]
  const idOf = (post: Element) => post.getAttribute('data-new') ?? ''

  function startDwell(id: string) {
    if (document.hidden || dwelling.has(id)) return
    dwelling.set(
      id,
      setTimeout(() => {
        dwelling.delete(id)
        newIds.delete(id)
      }, DWELL_MS),
    )
  }
  function stopDwell(id: string) {
    clearTimeout(dwelling.get(id))
    dwelling.delete(id)
  }
  const stopAllDwells = () => [...dwelling.keys()].forEach(stopDwell)

  /** Which edge of the visible part of the panel a post is past, if any. */
  function hiddenSide(post: Element, panel: DOMRect): 'above' | 'below' | null {
    const { top, bottom } = post.getBoundingClientRect()
    if (bottom < Math.max(panel.top, 0)) return 'above'
    if (top > Math.min(panel.bottom, innerHeight)) return 'below'
    return null
  }
  function measure() {
    const panel = scroller.value?.getBoundingClientRect()
    const sides = panel ? unreadPosts().map((post) => hiddenSide(post, panel)) : []
    hidden.above = sides.filter((side) => side === 'above').length
    hidden.below = sides.filter((side) => side === 'below').length
  }

  // Both observers see the screen through the panel's scrolling. One watches the middle of it, for
  // reading; the other the whole of it, for the pills.
  const middleObserver = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const id = idOf(target)
        if (isIntersecting) {
          inMiddle.add(id)
          startDwell(id)
        } else {
          inMiddle.delete(id)
          stopDwell(id)
        }
      }
    },
    { rootMargin: '-15% 0px' },
  )
  const screenObserver = new IntersectionObserver(measure)

  /** Point both observers at the posts now tagged New (observing starts with a report of where each is). */
  function track() {
    middleObserver.disconnect()
    screenObserver.disconnect()
    for (const post of unreadPosts()) {
      middleObserver.observe(post)
      screenObserver.observe(post)
    }
    measure()
  }

  // Looking away stops the clock; coming back restarts it for whatever is still in the middle.
  function onVisibilityChange() {
    if (document.hidden) stopAllDwells()
    else inMiddle.forEach(startDwell)
  }

  watch([() => newIds.size, rendered], track, { flush: 'post' })
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    track()
  })
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    middleObserver.disconnect()
    screenObserver.disconnect()
    stopAllDwells()
  })

  function jumpToNew(side: 'above' | 'below') {
    const panel = scroller.value?.getBoundingClientRect()
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    unreadPosts()
      .find((post) => panel && hiddenSide(post, panel) === side)
      ?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return { hidden, jumpToNew }
}
