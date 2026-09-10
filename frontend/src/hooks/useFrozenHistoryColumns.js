import { useLayoutEffect, useRef } from 'react'

// Keep sticky offsets aligned with actual column widths as data and layout change.
export default function useFrozenHistoryColumns() {
  const tableRef = useRef(null)

  useLayoutEffect(() => {
    const table = tableRef.current
    const cells = table?.tHead?.rows[0]?.cells
    if (!cells || cells.length < 3) return

    const updateOffsets = () => {
      const noWidth = cells[0].getBoundingClientRect().width
      const requestWidth = cells[1].getBoundingClientRect().width
      table.style.setProperty('--history-request-left', `${noWidth}px`)
      table.style.setProperty('--history-name-left', `${noWidth + requestWidth}px`)
    }

    updateOffsets()
    const observer = new ResizeObserver(updateOffsets)
    observer.observe(cells[0])
    observer.observe(cells[1])
    return () => observer.disconnect()
  }, [])

  return tableRef
}
