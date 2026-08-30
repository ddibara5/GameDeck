import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const dialogStack = []

function focusableWithin(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => {
    if (node.closest('[inert]')) return false
    if (node.getAttribute('aria-hidden') === 'true') return false
    return node.getClientRects().length > 0
  })
}

function isolateDialog(dialog) {
  const changed = []
  let current = dialog

  while (current?.parentElement) {
    const parent = current.parentElement
    for (const sibling of parent.children) {
      if (
        sibling === current ||
        sibling.hasAttribute('data-dialog-companion') ||
        sibling.tagName === 'SCRIPT' ||
        sibling.tagName === 'STYLE'
      ) continue
      changed.push({
        node: sibling,
        inert: sibling.inert,
        ariaHidden: sibling.getAttribute('aria-hidden'),
      })
      sibling.inert = true
      sibling.setAttribute('aria-hidden', 'true')
    }
    if (parent === document.body) break
    current = parent
  }

  return () => {
    for (let i = changed.length - 1; i >= 0; i -= 1) {
      const { node, inert, ariaHidden } = changed[i]
      node.inert = inert
      if (ariaHidden == null) node.removeAttribute('aria-hidden')
      else node.setAttribute('aria-hidden', ariaHidden)
    }
  }
}

/**
 * Shared modal behavior for GameDeck's sheets, drawers, and full-screen pages:
 * isolate background content, move focus inside, trap Tab, close the topmost
 * dialog on Escape, and restore focus to the opener on unmount.
 */
export function useDialogA11y({ active = true, onClose = null, closeOnEscape = true } = {}) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!active || !dialog) return undefined

    const token = Symbol('dialog')
    dialogStack.push(token)
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restoreIsolation = isolateDialog(dialog)
    const hadTabIndex = dialog.hasAttribute('tabindex')
    const previousTabIndex = dialog.getAttribute('tabindex')
    if (!hadTabIndex) dialog.setAttribute('tabindex', '-1')
    if (!dialog.hasAttribute('aria-modal')) dialog.setAttribute('aria-modal', 'true')

    const frame = requestAnimationFrame(() => {
      const preferred = dialog.querySelector('[data-dialog-autofocus]')
      const target = preferred || focusableWithin(dialog)[0] || dialog
      target.focus({ preventScroll: true })
    })

    const onKeyDown = (event) => {
      if (dialogStack[dialogStack.length - 1] !== token) return
      if (event.key === 'Escape' && closeOnEscape && closeRef.current) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusableWithin(dialog)
      if (!items.length) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      const index = dialogStack.lastIndexOf(token)
      if (index >= 0) dialogStack.splice(index, 1)
      restoreIsolation()
      if (!hadTabIndex) dialog.removeAttribute('tabindex')
      else dialog.setAttribute('tabindex', previousTabIndex)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [active, closeOnEscape])

  return dialogRef
}
