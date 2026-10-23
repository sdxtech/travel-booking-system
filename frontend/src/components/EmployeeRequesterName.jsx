import { useId, useRef, useState } from 'react'
import useBookingEmployees from '../hooks/useBookingEmployees'
import { employeeSuggestion, updateRequesterName } from './employeeRequester'

// Use the already-loaded office user list when available; Quick View loads its own.
export default function EmployeeRequesterName({ form, setForm, employees: providedEmployees, disabled = false }) {
  const listId = useId()
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { employees: fetchedEmployees, error } = useBookingEmployees(providedEmployees == null)
  const employees = providedEmployees ?? fetchedEmployees
  const query = form.requester_name.trim().toLowerCase()
  const suggestions = employees.filter((employee) => (
    employee.role === 'user' && employee.name && employee.email &&
    (!query || employee.name.toLowerCase().includes(query) || employee.email.toLowerCase().includes(query))
  ))
  const showSuggestions = open && !disabled && suggestions.length > 0
  const selectEmployee = (employee) => {
    setForm((current) => updateRequesterName(current, employeeSuggestion(employee), employees))
    setOpen(false)
    setActiveIndex(-1)
  }
  const updateName = (event) => {
    const value = event.target.value
    setForm((current) => updateRequesterName(current, value, employees))
    setOpen(true)
    setActiveIndex(-1)
  }
  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length > 0) {
      event.preventDefault()
      const nextIndex = event.key === 'ArrowDown'
        ? (activeIndex + 1) % suggestions.length
        : (activeIndex < 0 ? suggestions.length - 1 : (activeIndex - 1 + suggestions.length) % suggestions.length)
      setOpen(true)
      setActiveIndex(nextIndex)
      menuRef.current?.children[nextIndex]?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && showSuggestions && suggestions[activeIndex]) {
      event.preventDefault()
      selectEmployee(suggestions[activeIndex])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setActiveIndex(-1)
    }
  }
  return (
    <>
      <div
        className="employee-requester-name"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false)
            setActiveIndex(-1)
          }
        }}
      >
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={showSuggestions && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder="Type a name or select an Employee"
          value={form.requester_name}
          onChange={updateName}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          required
        />
        {showSuggestions ? (
          <div
            ref={menuRef}
            id={listId}
            className="quick-driver-multiselect__menu booking-form-select__menu"
            role="listbox"
            aria-label="Employees"
          >
            {suggestions.map((employee, index) => (
              <button
                key={employee.uid || employee.email}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={form.requester_email === employee.email}
                className={`quick-driver-multiselect__option booking-form-select__option ${index === activeIndex ? 'is-selected' : ''}`}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectEmployee(employee)}
              >
                {employee.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {error ? <span className="muted">{error}</span> : null}
    </>
  )
}
