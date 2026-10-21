const STATUS_LABELS = {
  active: 'Active',
  deactive: 'Deactive',
  banned: 'Banned',
  password_not_set: 'Password Not Set',
}

export function userAccountStatusLabel(user) {
  return STATUS_LABELS[user.account_status] || (user.banned ? 'Banned' : user.disabled ? 'Deactive' : 'Active')
}
