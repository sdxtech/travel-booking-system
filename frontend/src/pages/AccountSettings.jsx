import { useState } from "react";
import MainLayout from "../components/MainLayout";
import PushNotificationControl from "../components/PushNotificationControl";
import { API_BASE_URL } from "../config";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { indonesianError } from "../utils/indonesian";

const initialForm = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

function AccountSettings() {
  const { user } = useAuth();
  const isDriver = user?.role === "driver";
  const t = (english, indonesian) => isDriver ? indonesian : english;
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (form.new_password !== form.confirm_password) {
      setError(t("New password and confirmation password do not match.", "Kata sandi baru dan konfirmasinya tidak sama."));
      return;
    }

    if (form.new_password.length < 6) {
      setError(t("New password must be at least 6 characters.", "Kata sandi baru harus terdiri dari minimal 6 karakter."));
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          current_password: form.current_password,
          new_password: form.new_password,
          confirm_password: form.confirm_password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(isDriver ? indonesianError(data?.detail, "Kata sandi gagal diubah. Silakan coba lagi.") : data?.detail || "Failed to change password.");
        return;
      }

      setSuccess(isDriver ? "Kata sandi berhasil diubah." : data?.message || "Password changed successfully.");

      setForm(initialForm);
      setShowPassword(false);
    } catch {
      setError(t("Network error. Please try again.", "Koneksi bermasalah. Silakan coba lagi."));
    } finally {
      setSaving(false);
    }
  };
  const inputType = showPassword ? "text" : "password";

  return (
    <MainLayout title={t("Settings", "Pengaturan")}>
      <section className="ticket-history account-settings">
        <header className="history-header">
          <div className="header-title">
            <button className="back-link" type="button" onClick={() => navigate(-1)} aria-label={t("Go back", "Kembali")}>
              <i className="bi bi-arrow-left" aria-hidden="true" />
            </button>
            <h1>{t("Settings", "Pengaturan")}</h1>
          </div>
        </header>

        <form
          className="ticket-form admin-settings__form"
          onSubmit={handleSubmit}
        >
          <section className="field-group">
            <div className="field-heading">
              <span className="heading-icon" aria-hidden="true">
                <i className="bi bi-key" />
              </span>

              <div>
                <h2>{t("Change password", "Ubah Kata Sandi")}</h2>
                <p className="muted">
                  {t("Enter your current password and choose a new password.", "Masukkan kata sandi saat ini, lalu buat kata sandi baru.")}
                </p>
              </div>
            </div>

            <div className="field-grid">
              <label className="form-field" style={{ position: "relative" }}>
                <span>{t("Current password", "Kata Sandi Saat Ini")}</span>
                <input
                  type={inputType}
                  value={form.current_password}
                  onChange={handleChange("current_password")}
                  placeholder={t("Enter your current password", "Masukkan kata sandi saat ini")}
                  disabled={saving}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? t("Hide password", "Sembunyikan kata sandi") : t("Show password", "Tampilkan kata sandi")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "38px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6c757d",
                  }}
                  title={showPassword ? t("Hide password", "Sembunyikan kata sandi") : t("Show password", "Tampilkan kata sandi")}
                >
                  <i
                    className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"}
                  />
                </button>
              </label>

              <label className="form-field" style={{ position: "relative" }}>
                <span>{t("New password", "Kata Sandi Baru")}</span>
                <input
                  type={inputType}
                  value={form.new_password}
                  onChange={handleChange("new_password")}
                  placeholder={t("Enter your new password", "Masukkan kata sandi baru")}
                  disabled={saving}
                  autoComplete="new-password"
                  minLength="6"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? t("Hide password", "Sembunyikan kata sandi") : t("Show password", "Tampilkan kata sandi")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "38px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6c757d",
                  }}
                >
                  <i
                    className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"}
                  />
                </button>
              </label>

              <label className="form-field" style={{ position: "relative" }}>
                <span>{t("Confirm new password", "Konfirmasi Kata Sandi Baru")}</span>
                <input
                  type={inputType}
                  value={form.confirm_password}
                  onChange={handleChange("confirm_password")}
                  placeholder={t("Re-enter your new password", "Masukkan kembali kata sandi baru")}
                  disabled={saving}
                  autoComplete="new-password"
                  minLength="6"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? t("Hide password", "Sembunyikan kata sandi") : t("Show password", "Tampilkan kata sandi")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "38px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6c757d",
                  }}
                >
                  <i
                    className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"}
                  />
                </button>
              </label>
            </div>

            <div className="admin-settings__preview">
              <i className="bi bi-shield-lock" aria-hidden="true" />
              <span>
                {t("Your new password must be at least 6 characters and should not be shared with anyone else.", "Kata sandi baru minimal 6 karakter. Jangan bagikan kata sandi kepada siapa pun.")}
              </span>
            </div>

            {error ? <p className="error-text" role="alert">{error}</p> : null}

            {success ? <p className="success-text" role="status">{success}</p> : null}

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                <i className="bi bi-key" aria-hidden="true" />
                {saving ? t("Changing password...", "Menyimpan...") : t("Change password", "Ubah Kata Sandi")}
              </button>
            </div>
          </section>
        </form>
        <section className="field-group" aria-labelledby="notification-settings-title">
          <div className="field-heading">
            <span className="heading-icon" aria-hidden="true">
              <i className="bi bi-bell" />
            </span>
            <h2 id="notification-settings-title">{t("Notifications", "Notifikasi")}</h2>
          </div>
          {user && <PushNotificationControl key={user.uid} user={user} />}
        </section>
      </section>
    </MainLayout>
  );
}

export default AccountSettings;
