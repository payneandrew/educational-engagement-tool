import { expect, test, type Browser, type Page } from '@playwright/test'

const DOC = '#/doc/natural-selection' // no seeded annotations on this one

async function openAs(browser: Browser, userId: string) {
  const context = await browser.newContext()
  await context.addInitScript(id => sessionStorage.setItem('marginalia:user', id), userId)
  const page = await context.newPage()
  await page.goto('/' + DOC)
  await expect(page.locator('.status.on')).toHaveText('live') // SSE connected
  await page.evaluate(() => ((window as any).__noReload = true))
  return page
}

/** Real mouse double-click on the nth occurrence of `word` in the reader (selects it like a user would). */
async function dblClickWord(page: Page, word: string, nth = 0) {
  const pt = await page.evaluate(([w, n]) => {
    const root = document.querySelector('.reader')!
    const idx = (() => { let i = -1; for (let k = 0; k <= n; k++) i = root.textContent!.indexOf(w, i + 1); return i })()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let seen = 0, node: Node | null
    while ((node = walker.nextNode())) {
      const len = node.textContent!.length
      if (idx < seen + len) {
        const r = document.createRange()
        r.setStart(node, idx - seen + 1)
        r.setEnd(node, idx - seen + 2)
        // Scroll by the word's own rect (the containing span can be thousands of px tall), then re-measure.
        window.scrollBy(0, r.getBoundingClientRect().y - window.innerHeight / 2)
        const b = r.getBoundingClientRect()
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      }
      seen += len
    }
    throw new Error('word not found')
  }, [word, nth] as const)
  await page.mouse.dblclick(pt.x, pt.y)
}

test('annotate → live to same group → hidden from other group', async ({ browser }) => {
  const alice = await openAs(browser, 'u-alice')
  const bob = await openAs(browser, 'u-bob')
  const carol = await openAs(browser, 'u-carol')

  // 1. Highlight-to-annotate: select a word, side panel offers a composer, post, highlight appears inline.
  await dblClickWord(alice, 'variation', 3)
  await expect(alice.locator('.side')).toContainText('New annotation')
  await expect(alice.locator('.side .quote')).toContainText('variation')
  await alice.getByPlaceholder('Add your comment…').fill('Alice: this is the key mechanism.')
  await alice.getByRole('button', { name: 'Post' }).click()
  await expect(alice.locator('.reader .hl')).toHaveCount(1)
  await expect(alice.locator('.side')).toContainText('Thread')

  // 2. Real-time: Bob sees the highlight with no reload; clicking opens Alice's thread.
  await expect(bob.locator('.reader .hl')).toHaveCount(1, { timeout: 5000 })
  expect(await bob.evaluate(() => (window as any).__noReload)).toBe(true) // page was never reloaded
  await bob.locator('.reader .hl').click()
  await expect(bob.locator('.side')).toContainText('Alice: this is the key mechanism.')

  // 3. Replies + upvotes, live back to Alice.
  await bob.getByPlaceholder('Reply…').fill('Bob: agreed, and it ties to heredity.')
  await bob.getByRole('button', { name: 'Reply' }).click()
  await bob.locator('.post').first().getByRole('button', { name: /▲/ }).click()
  await expect(alice.locator('.side')).toContainText('Bob: agreed, and it ties to heredity.', { timeout: 5000 })
  await expect(alice.locator('.post').first().getByRole('button', { name: /▲ 1/ })).toBeVisible()

  // 4. Group scoping: Carol (Group B) never sees any of it.
  await carol.waitForTimeout(1000)
  await expect(carol.locator('.reader .hl')).toHaveCount(0)
  await expect(carol.locator('.side')).not.toContainText('Alice')

  // 5. Overlapping highlights: Bob annotates the same word; clicking cycles between the two threads.
  await dblClickWord(bob, 'variation', 3)
  await bob.getByPlaceholder('Add your comment…').fill('Bob: a second thread on the same word.')
  await bob.getByRole('button', { name: 'Post' }).click()
  await expect(bob.locator('.reader .hl.multi').first()).toBeVisible()
  const first = await bob.locator('.side .post p').first().innerText()
  await bob.locator('.reader .hl.multi').first().click()
  const second = await bob.locator('.side .post p').first().innerText()
  expect(second).not.toBe(first) // cycled to the other thread

  // 6. Persistence: a fresh load rebuilds highlights from the snapshot.
  await alice.reload()
  await expect(alice.locator('.reader .hl').first()).toBeVisible()
  await expect(carol.locator('.reader .hl')).toHaveCount(0)
})
