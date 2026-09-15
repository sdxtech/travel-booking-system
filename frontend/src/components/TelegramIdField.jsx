export default function TelegramIdField({ value, onChange }) {
  return (
    <label className="inline-label">
      <span>Telegram ID</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]+"
        maxLength={16}
        placeholder="e.g. 123456789"
        value={value || ''}
        onChange={onChange}
      />
      <small className="muted">Optional. Personal numeric Telegram ID, not a phone number or @username. Start the bot before receiving notifications.</small>
    </label>
  )
}
