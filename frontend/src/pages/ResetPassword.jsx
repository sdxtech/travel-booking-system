import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

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
        "Invalid or missing reset token. Please request a new password reset link."
      );
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
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
        throw new Error(
          data?.detail ||
            data?.message ||
            "Failed to reset password."
        );
      }

      setMessage(
        data?.message ||
          "Your password has been reset successfully."
      );

      setPassword("");
      setConfirmPassword("");

      // Redirect to login after a short delay.
      setTimeout(() => {
        navigate("/login", {
          replace: true,
        });
      }, 2000);
    } catch (err) {
      console.error("Reset password error:", err);

      setError(
        err?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card login-card-branded">
        <h1 className="login-title">
          Reset Password
        </h1>

        <p>
          Enter your new password below.
        </p>

        {!token && (
          <div>
            Invalid or missing reset token. Please request
            a new password reset link.
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
              <span>New Password</span>

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
                  placeholder="Enter your new password"
                  disabled={loading}
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

            <label className="form-field">
              <span>Confirm Password</span>

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
                  placeholder="Confirm your new password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
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
                ? "RESETTING PASSWORD..."
                : "RESET PASSWORD"}
            </button>
          </form>
        )}
<div className="back-to-login-wrapper">

        <a
          href="/login"
          className="back-to-login-button"
         
        >
          BACK TO LOGIN
        </a>
</div>
      </div>
    </div>
  );
}

export default ResetPassword;