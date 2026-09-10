import { Children, cloneElement, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function TableActionDropdown({ label, disabled = false, children }) {
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const open = Boolean(position) && !disabled

  useEffect(() => {
    if (!open) return undefined

    const menu = menuRef.current
    const firstAction = menu?.querySelector('button:not(:disabled)')
    const focusTarget = firstAction || menu
    focusTarget?.focus({ preventScroll: true })

    const dismiss = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      setPosition(null)
    }
    const closeOnResize = () => setPosition(null)
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', closeOnResize)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', closeOnResize)
    }
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (open) {
      setPosition(null)
      return
    }
    const rect = triggerRef.current.getBoundingClientRect()
    const width = Math.min(190, window.innerWidth - 16)
    const height = Math.min(Children.count(children) * 32 + 14, window.innerHeight - 16)
    const above = window.innerHeight - rect.bottom < height + 5 && rect.top > window.innerHeight - rect.bottom
    setPosition({
      top: Math.max(8, Math.min(above ? rect.top - height - 5 : rect.bottom + 5, window.innerHeight - height - 8)),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      width,
      maxHeight: window.innerHeight - 16,
      overflowY: 'auto',
    })
  }

  const closeAndFocusTrigger = () => {
    setPosition(null)
    triggerRef.current?.focus({ preventScroll: true })
  }

  const handleMenuKeyDown = (event) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
      }
      closeAndFocusTrigger()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const actions = Array.from(menuRef.current.querySelectorAll('button:not(:disabled)'))
    if (!actions.length) return
    const current = actions.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? actions.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length
    actions[next].focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-outline-brand superadmin-action-dropdown__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) toggle()
          }
        }}
      >
        Actions <i className="bi bi-chevron-down" aria-hidden="true" />
      </button>
      {open ? createPortal(
        <div
          id={menuId}
          ref={menuRef}
          className="superadmin-action-dropdown__menu"
          role="menu"
          aria-label={label}
          tabIndex={-1}
          style={position}
          onKeyDown={handleMenuKeyDown}
        >
          {Children.map(children, (child) => cloneElement(child, {
            role: 'menuitem',
            tabIndex: -1,
            onClick: (event) => {
              // Run the action first. Closing on click-capture can unmount the
              // button before callbacks such as Details update their parent.
              child.props.onClick?.(event)
              if (!event.defaultPrevented && !event.currentTarget.disabled) {
                closeAndFocusTrigger()
              }
            },
          }))}
        </div>,
        document.body,
      ) : null}
    </>
  )
}

export default TableActionDropdown
