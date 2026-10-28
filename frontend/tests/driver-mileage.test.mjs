import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDriverMileage } from '../src/utils/driverMileage.js'
import { indonesianError } from '../src/utils/indonesian.js'

test('Start and Finish reject blank mileage before it can become zero', () => {
  for (const label of ['awal', 'akhir']) {
    for (const value of ['', '   ', null, undefined]) {
      assert.equal(validateDriverMileage(value, label), `Kilometer ${label} wajib diisi.`)
    }
    for (const value of ['-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
      assert.match(validateDriverMileage(value, label), /angka bulat/)
    }
    for (const value of ['0', '190692']) assert.equal(validateDriverMileage(value, label), '')
  }
})

test('Driver receives Indonesian mileage API validation and range errors', () => {
  const required = [{ loc: ['body'], msg: 'Value error, Kilometer awal wajib diisi.' }]
  assert.equal(indonesianError(required), 'Kilometer awal wajib diisi.')
  const range = 'Kilometer akhir tidak boleh lebih kecil dari kilometer awal.'
  assert.equal(indonesianError(range), range)
})
