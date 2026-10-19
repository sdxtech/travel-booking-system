import { useState } from "react";
import { indonesianError } from "../utils/indonesian";
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
        setError(indonesianError(data?.detail, "Email pengaturan ulang kata sandi gagal dikirim. Silakan coba lagi."));
        return;
      }
      setMessage(
        "Jika akun dengan email ini terdaftar, tautan pengaturan ulang kata sandi telah dikirim. Periksa juga folder spam.",
      );
      setEmail("");
    } catch {
      setError("Koneksi bermasalah. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-page" lang="id">
     
      <div className="login-card login-card-branded">
       
        <h1 className="login-title"> Lupa Kata Sandi </h1>
        <p>Masukkan email Anda untuk menerima tautan pengaturan ulang kata sandi.</p>
        <form className="login-form" onSubmit={handleSubmit}>
         
          <label className="form-field">
           
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
              placeholder="nama@contoh.com"
            />
          </label>
          {error && <p className="error-text"> {error} </p>}
          {message && <p className="success-text"> {message} </p>}
          <button type="submit" disabled={loading}>
            
            {loading ? "MENGIRIM..." : "KIRIM TAUTAN"}
          </button>
        </form>
      </div>
    </div>
  );
}
export default ForgotPassword;
