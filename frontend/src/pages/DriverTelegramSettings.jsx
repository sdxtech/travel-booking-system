import MainLayout from '../components/MainLayout'
import DriverTelegram from '../components/DriverTelegram'

export default function DriverTelegramSettings() {
  return (
    <MainLayout title="Hubungkan Telegram">
      <section className="office-content">
        <header className="office-header">
          <h1>Hubungkan Telegram</h1>
        </header>
        <DriverTelegram />
      </section>
    </MainLayout>
  )
}
