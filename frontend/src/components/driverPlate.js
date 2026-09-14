export function formatDriverPlate(plateNumber) {
  const plate = String(plateNumber || '').trim().toUpperCase()
  if (!plate) return 'Plat No belum diisi'
  const number = plate.match(/\d+/)?.[0]
  if (!number) return plate
  return `${plate} (${Number(number.slice(-1)) % 2 === 0 ? 'Genap' : 'Ganjil'})`
}
