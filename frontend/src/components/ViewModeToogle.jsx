import React from 'react'

function ViewModeToggle({ viewMode, onChange }) {
  return (
    <div className="view-mode-toggle" role="group" aria-label="View switch toggle">
      <button
        type="button"
        className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
        onClick={() => onChange('table')}
        title="Table View"
      >
        <i className="bi bi-table" aria-hidden="true" />
        <span>Table</span>
      </button>
      <button
        type="button"
        className={`view-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
        onClick={() => onChange('card')}
        title="Card View"
      >
        <i className="bi bi-grid-fill" aria-hidden="true" />
        <span>Cards</span>
      </button>
    </div>
  )
}

export default ViewModeToggle