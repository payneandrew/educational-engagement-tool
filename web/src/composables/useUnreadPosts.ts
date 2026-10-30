import { onMounted, onUnmounted, reactive, watch, type Ref } from 'vue'

/** How long a new post must stay in view before it counts as read. */
const DWELL_MS = 1000

/**
 * Unread tracking for posts tagged "New" (`newIds`) in a scrolling discussion.
 * - A post is read once it stays near the middle of the screen for DWELL_MS while the tab is visible;
 *   it then leaves `newIds` and its tag fades.
 * - `hidden` counts unread posts scrolled out of view, for the "N new" pills.
 *
 * `rendered` is anything that changes when the list does, so the observers follow the posts.
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

  // One observer watches the middle of the screen (reading), the other all of it (pills).
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

  /** Point both observers at the posts now tagged New. */
  function track() {
    middleObserver.disconnect()
    screenObserver.disconnect()
    for (const post of unreadPosts()) {
      middleObserver.observe(post)
      screenObserver.observe(post)
    }
    measure()
  }

  // Looking away stops the clock; coming back restarts it.
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
