import assert from 'node:assert/strict'
import test from 'node:test'
import { employeeSuggestion, isBookingRequester, updateRequesterName } from '../src/components/employeeRequester.js'

const budi = {
  uid: 'employee-1', role: 'user', name: 'Budi', email: 'budi@example.com',
  department: 'Finance', job_position: 'Analyst', nik: '', phone: '08123456789',
}
const form = {
  requester_name: '', requester_department: '', requester_job_position: '',
  requester_nik: '', requester_phone: '', requester_email: '',
  driver_email: 'driver@example.com', pickup_location: 'Office', destination: 'Airport',
}

test('unique Employee name autofills profile while preserving driver and trip fields', () => {
  const result = updateRequesterName(form, 'budi', [budi])
  assert.equal(result.requester_name, 'budi')
  assert.equal(result.requester_department, 'Finance')
  assert.equal(result.requester_job_position, 'Analyst')
  assert.equal(result.requester_nik, '')
  assert.equal(result.requester_phone, budi.phone)
  assert.equal(result.requester_email, budi.email)
  assert.equal(result.driver_email, form.driver_email)
  assert.equal(result.pickup_location, form.pickup_location)
  assert.equal(result.destination, form.destination)
  assert.equal(form.requester_email, '')
})

test('duplicate Employee names require an explicit name/email suggestion', () => {
  const otherBudi = { ...budi, uid: 'employee-2', email: 'other@example.com', phone: '08999999' }
  const employees = [budi, otherBudi]
  assert.equal(updateRequesterName(form, 'Budi', employees).requester_email, '')
  const selected = updateRequesterName(form, employeeSuggestion(otherBudi), employees)
  assert.equal(selected.requester_name, 'Budi')
  assert.equal(selected.requester_email, 'other@example.com')
  assert.equal(selected.requester_phone, '08999999')
})

test('email lookup is case insensitive and prefixes never guess an Employee', () => {
  assert.equal(updateRequesterName(form, 'BUDI@EXAMPLE.COM', [budi]).requester_name, 'Budi')
  assert.equal(updateRequesterName(form, 'Bud', [budi]).requester_email, '')
})

test('changing an autofilled requester clears the previous account details', () => {
  const selected = updateRequesterName(form, employeeSuggestion(budi), [budi])
  for (const name of ['', 'Someone Else']) {
    const changed = updateRequesterName(selected, name, [budi])
    assert.equal(changed.requester_name, name)
    for (const field of ['requester_department', 'requester_job_position', 'requester_nik', 'requester_phone', 'requester_email']) {
      assert.equal(changed[field], '')
    }
    assert.equal(changed.driver_email, form.driver_email)
  }
})

test('switching Employees replaces all profile fields, including missing and optional fields', () => {
  const another = { uid: 'another', role: 'user', name: 'Siti', email: 'siti@example.com' }
  const employees = [budi, another]
  const selected = updateRequesterName(form, employeeSuggestion(budi), employees)
  const switched = updateRequesterName(selected, employeeSuggestion(another), employees)
  assert.equal(switched.requester_email, 'siti@example.com')
  for (const field of ['requester_department', 'requester_job_position', 'requester_nik', 'requester_phone']) {
    assert.equal(switched[field], '')
  }
})

test('manual requester entry remains available and Drivers are not matched', () => {
  const manual = { ...form, requester_name: 'Guest', requester_phone: '08111', requester_email: 'guest@example.com' }
  assert.deepEqual(updateRequesterName(manual, 'Guest Updated', [budi]), { ...manual, requester_name: 'Guest Updated' })
  assert.equal(updateRequesterName(form, 'Driver', [{ ...budi, name: 'Driver', role: 'driver' }]).requester_email, '')
})

test('Office Coordinators are eligible and selecting themselves autofills the complete profile', () => {
  const coordinator = { ...budi, uid: 'oc-1', role: 'office_coordinator', name: 'Coordinator', email: 'oc@example.com' }
  assert.equal(isBookingRequester(coordinator), true)
  const result = updateRequesterName(form, employeeSuggestion(coordinator), [budi, coordinator])
  assert.equal(result.requester_name, coordinator.name)
  assert.equal(result.requester_email, coordinator.email)
  assert.equal(result.requester_department, coordinator.department)
  assert.equal(result.requester_job_position, coordinator.job_position)
  assert.equal(result.requester_phone, coordinator.phone)
  assert.equal(result.requester_nik, '')
  assert.equal(result.driver_email, form.driver_email)
  const changed = updateRequesterName(result, 'Another Requester', [budi, coordinator])
  assert.equal(changed.requester_email, '')
  assert.equal(changed.requester_phone, '')
  assert.equal(isBookingRequester({ ...coordinator, role: 'driver' }), false)
  assert.equal(isBookingRequester({ ...coordinator, role: 'superadmin' }), false)
})

test('duplicate names across Employee and Coordinator roles require explicit selection', () => {
  const coordinator = { ...budi, uid: 'oc-1', role: 'office_coordinator', email: 'oc@example.com' }
  const candidates = [budi, coordinator]
  assert.equal(updateRequesterName(form, budi.name, candidates).requester_email, '')
  assert.equal(updateRequesterName(form, employeeSuggestion(coordinator), candidates).requester_email, coordinator.email)
  assert.equal(updateRequesterName(form, employeeSuggestion(budi), candidates).requester_email, budi.email)
})

test('matching a short name does not prevent typing a longer name', () => {
  const longName = { ...budi, uid: 'long', name: 'Budi Santoso', email: 'long@example.com' }
  const employees = [budi, longName]
  let current = updateRequesterName(form, 'Budi', employees)
  current = updateRequesterName(current, 'Budi ', employees)
  assert.equal(current.requester_name, 'Budi ')
  current = updateRequesterName(current, 'Budi S', employees)
  assert.equal(current.requester_email, '')
  current = updateRequesterName(current, 'Budi Santoso', employees)
  assert.equal(current.requester_email, longName.email)
})

test('selection reads the latest profile and keeps legacy department values unsplit', () => {
  const latest = { ...budi, department: undefined, dept_job_position: 'Finance / Analyst', job_position: '', nik: '12345', phone: '08222222' }
  const result = updateRequesterName(form, employeeSuggestion(budi), [latest])
  assert.equal(result.requester_department, 'Finance / Analyst')
  assert.equal(result.requester_job_position, '')
  assert.equal(result.requester_nik, '12345')
  assert.equal(result.requester_phone, '08222222')
})
