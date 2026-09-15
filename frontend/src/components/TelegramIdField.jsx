import { useId } from 'react'

export default function TelegramIdField({ value, onChange }) {
  const noteId = useId()

  return (
    <label className="inline-label">
      <span className="telegram-id-label">
        Telegram ID
        <span
          className="telegram-id-info"
          tabIndex="0"
          aria-label="Telegram ID information"
          aria-describedby={noteId}
        >
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span className="telegram-id-tooltip" id={noteId} role="tooltip">
            Optional. Personal numeric Telegram ID, not a phone number or @username. Start the bot before receiving notifications.
          </span>
        </span>
      </span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]+"
        maxLength={16}
        placeholder="e.g. 123456789"
        value={value || ''}
        onChange={onChange}
      />
    </label>
  )
}
