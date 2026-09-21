import { useState } from "react";
import { supabase } from "../lib/supabase";

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (authError) {
        throw new Error(
          authError.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos."
            : authError.message
        );
      }

      if (!authData.session || !authData.user) {
        throw new Error("No se pudo iniciar la sesión.");
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("id, full_name, role, phone, active")
          .eq("id", authData.user.id)
          .maybeSingle();

      if (profileError) {
        throw new Error("No se pudo consultar el perfil del usuario.");
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw new Error(
          "Tu usuario no tiene un perfil configurado en el sistema."
        );
      }

      if (!profile.active) {
        await supabase.auth.signOut();
        throw new Error(
          "Tu usuario está desactivado. Contacta al administrador."
        );
      }

      if (profile.role !== "admin" && profile.role !== "asesor") {
        await supabase.auth.signOut();
        throw new Error(
          "El usuario no tiene un rol válido dentro del sistema."
        );
      }

      if (typeof onLogin === "function") {
        onLogin({
          session: authData.session,
          user: authData.user,
          profile,
        });
      }
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      setError(err?.message || "Ocurrió un error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .rp-login-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background:
            radial-gradient(circle at top left, rgba(34, 108, 196, 0.16), transparent 36%),
            radial-gradient(circle at bottom right, rgba(105, 67, 171, 0.12), transparent 32%),
            #07111f;
          color: #ffffff;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .rp-login-card {
          width: min(430px, 100%);
          padding: 42px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 24px;
          background: rgba(13, 26, 43, 0.94);
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
          backdrop-filter: blur(14px);
        }

        .rp-login-brand {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-bottom: 42px;
        }

        .rp-login-logo {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: linear-gradient(145deg, #173a61, #0c2037);
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.06em;
        }

        .rp-login-wordmark {
          display: flex;
          flex-direction: column;
          line-height: 1;
          letter-spacing: 0.16em;
        }

        .rp-login-wordmark span {
          font-size: 10px;
          opacity: 0.62;
          margin-bottom: 5px;
        }

        .rp-login-wordmark strong {
          font-size: 16px;
          font-weight: 700;
        }

        .rp-login-eyebrow {
          display: block;
          margin-bottom: 10px;
          color: rgba(255, 255, 255, 0.52);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
        }

        .rp-login-header h1 {
          margin: 0;
          font-size: 30px;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .rp-login-header p {
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.62);
          font-size: 14px;
          line-height: 1.6;
        }

        .rp-login-form {
          display: grid;
          gap: 19px;
          margin-top: 30px;
        }

        .rp-login-field {
          display: grid;
          gap: 8px;
        }

        .rp-login-field label {
          color: rgba(255, 255, 255, 0.74);
          font-size: 12px;
          font-weight: 600;
        }

        .rp-login-field input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.11);
          border-radius: 11px;
          outline: none;
          background: rgba(255, 255, 255, 0.045);
          color: #ffffff;
          padding: 13px 14px;
          font: inherit;
          transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }

        .rp-login-field input::placeholder {
          color: rgba(255, 255, 255, 0.28);
        }

        .rp-login-field input:focus {
          border-color: rgba(79, 150, 226, 0.72);
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 0 0 3px rgba(45, 126, 203, 0.12);
        }

        .rp-login-field input:disabled {
          opacity: 0.62;
        }

        .rp-login-error {
          padding: 11px 12px;
          border: 1px solid rgba(230, 93, 93, 0.28);
          border-radius: 10px;
          background: rgba(180, 50, 50, 0.12);
          color: #ffb4b4;
          font-size: 12px;
          line-height: 1.5;
        }

        .rp-login-submit {
          width: 100%;
          border: 0;
          border-radius: 11px;
          padding: 13px 16px;
          background: linear-gradient(135deg, #1f6fb7, #174f86);
          color: #ffffff;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 12px 30px rgba(15, 75, 128, 0.24);
          transition: transform 0.18s ease, filter 0.18s ease;
        }

        .rp-login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.08);
        }

        .rp-login-submit:disabled {
          cursor: wait;
          opacity: 0.62;
        }

        .rp-login-footer {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.45);
          font-size: 11px;
        }

        .rp-login-footer small {
          font-size: 10px;
          opacity: 0.72;
        }

        @media (max-width: 520px) {
          .rp-login-page {
            padding: 16px;
          }

          .rp-login-card {
            padding: 30px 22px;
            border-radius: 20px;
          }

          .rp-login-brand {
            margin-bottom: 32px;
          }
        }
      `}</style>

      <div className="rp-login-page">
        <div className="rp-login-card">
          <div className="rp-login-brand">
            <div className="rp-login-logo">RP</div>
            <div className="rp-login-wordmark">
              <span>ROYAL</span>
              <strong>PRESTIGE</strong>
            </div>
          </div>

          <div className="rp-login-header">
            <span className="rp-login-eyebrow">ACCESO PRIVADO</span>
            <h1>Bienvenido</h1>
            <p>Ingresa a tu cuenta para acceder al sistema.</p>
          </div>

          <form className="rp-login-form" onSubmit={handleSubmit}>
            <div className="rp-login-field">
              <label htmlFor="login-email">Correo electrónico</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="correo@ejemplo.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="rp-login-field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && <div className="rp-login-error">{error}</div>}

            <button
              type="submit"
              className="rp-login-submit"
              disabled={loading}
            >
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </button>
          </form>

          <div className="rp-login-footer">
            <span>Royal Prestige</span>
            <small>Sistema de gestión comercial</small>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
