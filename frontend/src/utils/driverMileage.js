export function validateDriverMileage(input, label) {
  if (input == null || !String(input).trim()) return `Kilometer ${label} wajib diisi.`
  const value = Number(input)
  if (!Number.isSafeInteger(value) || value < 0) return `Kilometer ${label} harus berupa angka bulat nol atau lebih.`
  return ''
}
