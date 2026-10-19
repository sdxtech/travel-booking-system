import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { indonesianError } from "../utils/indonesian";
import { API_BASE_URL } from "../config";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!token) {
      setError(
        "Tautan tidak valid atau tidak lengkap. Silakan minta tautan pengaturan ulang kata sandi yang baru."
      );
      return;
    }

    if (password.length < 8) {
      setError("Kata sandi harus terdiri dari minimal 8 karakter.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Kata sandi dan konfirmasinya tidak sama.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            new_password: password,
            confirm_password: confirmPassword,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          indonesianError(data?.detail, "Kata sandi gagal diatur ulang. Silakan coba lagi.")
        );
        return;
      }

      setMessage(
        "Kata sandi berhasil diatur ulang. Anda akan diarahkan ke halaman masuk."
      );

      setPassword("");
      setConfirmPassword("");

      // Redirect to login after a short delay.
      setTimeout(() => {
        navigate("/login", {
          replace: true,
        });
      }, 2000);
    } catch {
      setError("Koneksi bermasalah. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" lang="id">
      <div className="login-card login-card-branded">
        <h1 className="login-title">
          Atur Ulang Kata Sandi
        </h1>

        <p>
          Masukkan kata sandi baru Anda di bawah ini.
        </p>

        {!token && (
          <div>
            Tautan tidak valid atau tidak lengkap. Silakan minta tautan pengaturan ulang kata sandi yang baru.
          </div>
        )}

        {error && (
          <div>
            {error}
          </div>
        )}

        {message && (
          <div>
            {message}
          </div>
        )}

        {token && !message && (
          <form
            className="login-form"
            onSubmit={handleSubmit}
          >
            <label className="form-field">
              <span>Kata Sandi Baru</span>

              <div className="password-input-wrapper">
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  required
                  minLength={8}
                  placeholder="Masukkan kata sandi baru"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  aria-pressed={showPassword}
                >
                  <i
                    className={`bi ${
                      showPassword ? "bi-eye-slash-fill" : "bi-eye-fill"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </label>

            <label className="form-field">
              <span>Konfirmasi Kata Sandi</span>

              <div className="password-input-wrapper">
                <input
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  required
                  minLength={8}
                  placeholder="Masukkan kembali kata sandi baru"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  aria-pressed={showConfirmPassword}
                >
                  <i
                    className={`bi ${
                      showConfirmPassword ? "bi-eye-slash-fill" : "bi-eye-fill"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "MENYIMPAN KATA SANDI..."
                : "SIMPAN KATA SANDI"}
            </button>
          </form>
        )}
<div className="back-to-login-wrapper">

        <a
          href="/login"
          className="back-to-login-button"
         
        >
          KEMBALI KE HALAMAN MASUK
        </a>
</div>
      </div>
    </div>
  );
}

export default ResetPassword;
