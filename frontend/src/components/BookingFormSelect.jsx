// Shared custom single-select used by Employee, Office Coordinator, and Super Admin booking flows.
function BookingFormSelect({ value, options, placeholder, disabled = false, ariaLabel, onChange }) {
  const selectedOption = options.find((option) => option.value === value)
  const selectionDisabled = disabled || options.length === 0

  const selectOption = (event, option) => {
    if (option.disabled) return
    onChange(option.value)
    event.currentTarget.closest('details')?.removeAttribute('open')
  }

  const renderOptionText = (option, fallback) => (
    <span className="booking-form-select__text">
      <span className="booking-form-select__label">{option?.label || fallback}</span>
      {option?.status ? (
        <>
          <span className="booking-form-select__separator" aria-hidden="true">-</span>
          <span className={`booking-form-select__status is-${option.statusTone || 'neutral'}`}>{option.status}</span>
        </>
      ) : null}
    </span>
  )

  return (
    <details className="quick-driver-multiselect booking-form-select">
      <summary
        aria-label={ariaLabel}
        aria-disabled={selectionDisabled}
        onClick={(event) => {
          if (selectionDisabled) event.preventDefault()
        }}
      >
        <span className={`booking-form-select__value ${selectedOption ? '' : 'is-placeholder'}`}>
          {selectedOption?.color ? (
            <span className="quick-driver-multiselect__color" style={{ backgroundColor: selectedOption.color }} />
          ) : null}
          {selectedOption?.icon ? <i className={`bi ${selectedOption.icon}`} aria-hidden="true" /> : null}
          {renderOptionText(selectedOption, placeholder)}
        </span>
        <i className="bi bi-chevron-down booking-form-select__chevron" aria-hidden="true" />
      </summary>
      {!selectionDisabled ? (
        <div className="quick-driver-multiselect__menu booking-form-select__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`quick-driver-multiselect__option booking-form-select__option ${
                option.value === value ? 'is-selected' : ''
              } ${option.disabled ? 'is-disabled' : ''}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              disabled={option.disabled}
              onClick={(event) => selectOption(event, option)}
            >
              {option.color ? (
                <span className="quick-driver-multiselect__color" style={{ backgroundColor: option.color }} />
              ) : null}
              {option.icon ? <i className={`bi ${option.icon}`} aria-hidden="true" /> : null}
              {renderOptionText(option, option.label)}
              {option.meta ? <span className="booking-form-select__meta">{option.meta}</span> : null}
              {option.value === value ? <i className="bi bi-check-lg booking-form-select__check" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </details>
  )
}

export default BookingFormSelect
