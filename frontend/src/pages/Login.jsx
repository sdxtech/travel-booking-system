import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { APP_NAME } from "../config";
import { useAuth } from "../hooks/useAuth";

const roleRouteMap = {
  user: "/user/home",
  driver: "/driver/home",
  office_coordinator: "/office/home",
  superadmin: "/admin/home",
};

const LOGO_SOURCES = [
  "/app-logo-blue.png",
  "/app-logo-black.png",
  "/app-logo-white.png",
  "/app-logo.png",
];

const getLoginErrorMessage = (message) => {
  if (!message) {
    return "Login failed. Please check your email and password.";
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("disabled")) {
    return "Your account has been disabled. Please contact an administrator.";
  }

  if (normalized.includes("invalid email or password")) {
    return "Invalid email or password. If this account was imported, please ask an administrator to reset the password.";
  }

  return message;
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
    document.title = `Login | ${APP_NAME}`;
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
    <div className="login-page">
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
              <span className="login-logo__fallback">APP LOGO</span>
            )}
          </div>
        </div>

        <div className="login-card login-card-branded">
          <h1 className="login-title">LOGIN</h1>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Email</span>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </label>

            <label className="form-field">
              <span>Password</span>

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
                  aria-label={showPassword ? "Hide password" : "Show password"}
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

            <label className="remember-me">
             
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
