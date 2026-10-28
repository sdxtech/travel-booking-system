// Translate known API errors; unknown server errors use a readable local fallback.
const errors = {
  'Failed to fetch': 'Koneksi bermasalah. Periksa koneksi internet Anda, lalu coba lagi.',
  'NetworkError when attempting to fetch resource.': 'Koneksi bermasalah. Periksa koneksi internet Anda, lalu coba lagi.',
  'Not authenticated': 'Silakan masuk kembali untuk melanjutkan.',
  'Token expired': 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  'Invalid or expired token': 'Sesi Anda tidak valid atau telah berakhir. Silakan masuk kembali.',
  'User not found': 'Akun tidak ditemukan.',
  'Account is disabled': 'Akun Anda dinonaktifkan. Silakan hubungi administrator.',
  'Forbidden': 'Anda tidak memiliki akses untuk melakukan tindakan ini.',
  'Booking not found': 'Permintaan perjalanan tidak ditemukan.',
  'Booking is not in an approvable state': 'Perjalanan ini belum dapat dimulai. Periksa kembali statusnya.',
  'Booking already started': 'Perjalanan ini sudah dimulai.',
  'Booking is not in a completable state': 'Perjalanan ini belum dapat diselesaikan. Periksa kembali statusnya.',
  'Booking must be started first': 'Mulai perjalanan terlebih dahulu.',
  'Ending mileage must be greater than or equal to starting mileage': 'Angka kilometer akhir tidak boleh lebih kecil dari angka kilometer awal.',
  'Telegram has not been configured by the administrator yet': 'Telegram belum diatur oleh administrator.',
  'Driver account is not available': 'Akun pengemudi tidak tersedia. Silakan hubungi administrator.',
  'New password and confirmation password do not match': 'Kata sandi baru dan konfirmasinya tidak sama.',
  'Current password is incorrect': 'Kata sandi saat ini salah.',
  'New password must be different from your current password': 'Kata sandi baru harus berbeda dari kata sandi saat ini.',
  'Failed to update password': 'Kata sandi gagal diperbarui. Silakan coba lagi.',
  'Password changed successfully': 'Kata sandi berhasil diubah.',
  'Passwords do not match': 'Kata sandi dan konfirmasinya tidak sama.',
  'Invalid or expired reset token': 'Tautan pengaturan kata sandi tidak valid atau telah kedaluwarsa. Silakan minta tautan baru.',
  'Reset token has already been used': 'Tautan ini sudah digunakan. Silakan minta tautan baru.',
}

export function indonesianError(detail, fallback = 'Terjadi kendala. Silakan coba lagi.') {
  if (Array.isArray(detail)) {
    const mileageMessage = detail[0]?.msg?.replace(/^Value error, /, '')
    if (mileageMessage?.startsWith('Kilometer ')) return mileageMessage
    const fields = { starting_mileage: 'Angka kilometer awal', ending_mileage: 'Angka kilometer akhir', new_password: 'Kata sandi baru', current_password: 'Kata sandi saat ini', confirm_password: 'Konfirmasi kata sandi', email: 'Alamat email' }
    const field = fields[detail[0]?.loc?.at(-1)]
    if (field) return `${field} belum sesuai. Periksa kembali isian Anda.`
    return fallback
  }
  if (typeof detail !== 'string') return fallback
  if (detail.startsWith('Kilometer ')) return detail
  if (errors[detail]) return errors[detail]
  const resetWait = detail.match(/Please try again in approximately (\d+) hours and (\d+) minutes/)
  if (resetWait) return `Pengaturan ulang kata sandi sudah diminta hari ini. Silakan coba lagi sekitar ${resetWait[1]} jam ${resetWait[2]} menit lagi.`
  return fallback
}
