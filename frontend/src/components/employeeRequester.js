const normalize = (value) => String(value || '').trim().toLowerCase()

export function employeeSuggestion(employee) {
  return `${employee.name} (${employee.email})`
}

function requesterDetails(employee) {
  return {
    requester_name: employee.name || '',
    requester_department: employee.department ?? employee.dept_job_position ?? '',
    requester_job_position: employee.job_position || '',
    requester_nik: employee.nik ?? employee.national_id ?? '',
    requester_phone: employee.phone || employee.phone_number || '',
    requester_email: employee.email || '',
  }
}

export function updateRequesterName(current, value, employees) {
  const query = normalize(value)
  const candidates = employees.filter((employee) => employee.role === 'user' && employee.name && employee.email)
  // Explicit name + email selections disambiguate employees sharing the same name.
  const exact = query && candidates.filter((employee) => (
    normalize(employeeSuggestion(employee)) === query || normalize(employee.email) === query
  ))
  const names = query && candidates.filter((employee) => normalize(employee.name) === query)
  const employee = exact?.length === 1 ? exact[0] : names?.length === 1 ? names[0] : null
  if (employee) {
    return {
      ...current,
      ...requesterDetails(employee),
      // Preserve typed spaces so matching a short name does not prevent typing a longer one.
      requester_name: normalize(employee.name) === query ? value : employee.name,
    }
  }

  const previous = candidates.find((employee) => (
    normalize(employee.email) === normalize(current.requester_email) &&
    normalize(employee.name) === normalize(current.requester_name)
  ))
  if (previous && normalize(previous.name) !== query) {
    // Changing the requester must not keep the previous employee's email/account link.
    return { ...current, ...requesterDetails({}), requester_name: value }
  }
  return { ...current, requester_name: value }
}
