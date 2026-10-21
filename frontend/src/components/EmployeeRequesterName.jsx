import { useId } from 'react'
import useBookingEmployees from '../hooks/useBookingEmployees'
import { employeeSuggestion, updateRequesterName } from './employeeRequester'

// Use the already-loaded office user list when available; Quick View loads its own.
export default function EmployeeRequesterName({ form, setForm, employees: providedEmployees, disabled = false }) {
  const listId = useId()
  const { employees: fetchedEmployees, error } = useBookingEmployees(providedEmployees == null)
  const employees = providedEmployees ?? fetchedEmployees
  const updateName = (event) => {
    const value = event.target.value
    setForm((current) => updateRequesterName(current, value, employees))
  }
  return (
    <>
      <input
        type="text"
        list={listId}
        autoComplete="off"
        placeholder="Type a name or select an Employee"
        value={form.requester_name}
        onChange={updateName}
        disabled={disabled}
        required
      />
      <datalist id={listId}>
        {employees.filter((employee) => employee.role === 'user' && employee.name && employee.email).map((employee) => (
          <option key={employee.uid || employee.email} value={employeeSuggestion(employee)} />
        ))}
      </datalist>
      {error ? <span className="muted">{error}</span> : null}
    </>
  )
}
