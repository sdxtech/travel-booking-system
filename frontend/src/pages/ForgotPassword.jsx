import React, { useState } from "react";
import { API_BASE_URL } from "../config";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to send password reset email.");
      }
      setMessage(
        data?.message ||
          "If an account exists with this email, a password reset link has been sent (dont forget to check the spam folder also).",
      );
      setEmail("");
    } catch (err) {
      console.error("Forgot password error:", err);
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-page">
     
      <div className="login-card login-card-branded">
       
        <h1 className="login-title"> Forgot Password </h1>
        <p>Enter your email so we can send verification link to your email.</p>
        <form className="login-form" onSubmit={handleSubmit}>
         
          <label className="form-field">
           
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
              placeholder="you@example.com"
            />
          </label>
          {error && <p className="error-text"> {error} </p>}
          {message && <p className="success-text"> {message} </p>}
          <button type="submit" disabled={loading}>
            
            {loading ? "SENDING..." : "SEND VERIFICATION EMAIL"}
          </button>
        </form>
      </div>
    </div>
  );
}
export default ForgotPassword;
