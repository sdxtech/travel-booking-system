import { useState } from "react";
import MainLayout from "../components/MainLayout";
import { API_BASE_URL } from "../config";
import { useNavigate } from "react-router-dom";

const initialForm = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

function ResetPassword() {
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
      setError("New password and confirmation password do not match.");
      return;
    }

    if (form.new_password.length < 6) {
      setError("New password must be at least 6 characters.");
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
        setError(data?.detail || "Failed to change password.");
        return;
      }

      setSuccess(data?.message || "Password changed successfully.");

      setForm(initialForm);
      setShowPassword(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const inputType = showPassword ? "text" : "password";

  return (
    <MainLayout title="Reset Password">
      <section className="ticket-history">
        <header className="history-header">
          <div className="header-title">
              <button className="back-link" type="button" onClick={() => navigate(-1)}>
    <i className="bi bi-arrow-left" aria-hidden="true" />
    
  </button>

          <h1>Reset Password</h1>
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
                <h2>Change password</h2>
                <p className="muted">
                  Enter your current password and choose a new password.
                </p>
              </div>
            </div>

            <div className="field-grid">
              <label className="form-field" style={{ position: "relative" }}>
                <span>Current password</span>
                <input
                  type={inputType}
                  value={form.current_password}
                  onChange={handleChange("current_password")}
                  placeholder="Enter your current password"
                  disabled={saving}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "38px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6c757d",
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  <i
                    className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"}
                  />
                </button>
              </label>

              <label className="form-field" style={{ position: "relative" }}>
                <span>New password</span>
                <input
                  type={inputType}
                  value={form.new_password}
                  onChange={handleChange("new_password")}
                  placeholder="Enter your new password"
                  disabled={saving}
                  autoComplete="new-password"
                  minLength="6"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
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
                <span>Confirm new password</span>
                <input
                  type={inputType}
                  value={form.confirm_password}
                  onChange={handleChange("confirm_password")}
                  placeholder="Re-enter your new password"
                  disabled={saving}
                  autoComplete="new-password"
                  minLength="6"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
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
                Your new password must be at least 6 characters and should not
                be shared with anyone else.
              </span>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            {success ? <p className="success-text">{success}</p> : null}

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                <i className="bi bi-key" aria-hidden="true" />
                {saving ? "Changing password..." : "Change password"}
              </button>
            </div>
          </section>
        </form>
      </section>
    </MainLayout>
  );
}

export default ResetPassword;
