import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { indonesianError } from "../utils/indonesian";
import { APP_NAME } from "../config";
import { useAuth } from "../hooks/useAuth";

const roleRouteMap = {
  user: "/user/home",
  driver: "/driver/home",
  office_coordinator: "/office/home",
  superadmin: "/admin/home",
};

const LOGO_SOURCES = [
  "/dr-logo-blue.svg",
];

const getLoginErrorMessage = (message) => {
  if (!message) {
    return "Gagal masuk. Periksa kembali email dan kata sandi Anda.";
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("disabled")) {
    return "Akun Anda dinonaktifkan. Silakan hubungi administrator.";
  }

  if (normalized.includes("invalid email or password")) {
    return "Email atau kata sandi salah. Jika akun Anda dibuat melalui impor, minta administrator mengatur ulang kata sandi.";
  }

  return indonesianError(message, "Gagal masuk. Periksa kembali email dan kata sandi Anda.");
};

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoIndex, setLogoIndex] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);

  const navigate = useNavigate();

  const { login } = useAuth();

  useEffect(() => {
    document.title = `Masuk | ${APP_NAME}`;
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const user = await login(normalizedEmail, password, rememberMe);

      const destination = roleRouteMap[user.role] || "/dashboard";

      navigate(destination, {
        replace: true,
      });
    } catch (err) {
      console.error("Login error", err);

      setError(getLoginErrorMessage(err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" lang="id">
      <div className="login-wrapper">
        <div className="login-logo">
          <div className="login-logo__circle">
            {LOGO_SOURCES[logoIndex] ? (
              <img
                className="login-logo__image"
                src={LOGO_SOURCES[logoIndex]}
                alt={APP_NAME}
                onError={() => setLogoIndex((prev) => prev + 1)}
              />
            ) : (
              <span className="login-logo__fallback">LOGO APLIKASI</span>
            )}
          </div>
        </div>

        <div className="login-card login-card-branded">
          <h1 className="login-title">MASUK</h1>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Email</span>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nama@contoh.com"
              />
            </label>

            <label className="form-field">
              <span>Kata Sandi</span>

              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="********"
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

            <div className="auth-links">


            <label className="remember-me">

              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Ingat saya</span>
            </label>

            <a href="/forgot-password" className="forgot-password-link">Lupa Kata Sandi?</a>
            </div>


            {error && <p className="error-text">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
