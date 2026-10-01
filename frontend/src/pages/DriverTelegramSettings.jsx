import MainLayout from '../components/MainLayout'
import DriverTelegram from '../components/DriverTelegram'

export default function DriverTelegramSettings() {
  return (
    <MainLayout title="Connect Telegram">
      <section className="office-content">
        <header className="office-header">
          <h1>Connect Telegram</h1>
        </header>
        <DriverTelegram />
      </section>
    </MainLayout>
  )
}
