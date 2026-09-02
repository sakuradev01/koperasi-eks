/* eslint-disable react/prop-types */
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logIn } from "../../api/authApi";
import { login } from "../../store/authSlice";
import Input from "../../utils/Input.jsx";
import Button from "../../utils/Button.jsx";

/* Inline stroke icons — Lucide paths, strokeWidth 2, no emoji */
const Icon = ({ paths, size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

const icons = {
  alert: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 8v4", "M12 16h.01"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  lock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  zap: ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
  eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  eyeOff: ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94", "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19", "M1 1l22 22", "M14.12 14.12a3 3 0 1 1-4.24-4.24"],
};

const Login = () => {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await logIn(formData);

      if (response.success) {
        dispatch(login(response.data.user));
        navigate("/dashboard");
      } else {
        setError(response.message || "Login gagal");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message || "Username atau password salah");
    } finally {
      setLoading(false);
    }
  };

  const trust = [
    { icon: icons.shield, title: "Aman", desc: "Data terlindungi" },
    { icon: icons.lock, title: "Terintegrasi", desc: "Simpanan & pinjaman" },
    { icon: icons.zap, title: "Real-time", desc: "Laporan akurat" },
  ];

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-primary-950 flex items-center justify-center px-4 py-8 sm:px-6 lg:py-10">
      {/* ===== Navy canvas — drawn from the SAMIT mark's own architecture ===== */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 50% 118%, #35619B 0%, rgba(53,97,155,0) 62%), radial-gradient(75% 55% at 82% -8%, rgba(53,97,155,.45) 0%, rgba(2,20,44,0) 58%), radial-gradient(60% 45% at 12% 4%, rgba(96,143,199,.20) 0%, rgba(2,20,44,0) 55%), linear-gradient(180deg, #04214A 0%, #02142C 100%)",
        }}
      />
      {/* Concentric echo rings — the round SAMIT seal, abstracted */}
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-full border border-white/[0.05]"
          style={{ width: "min(88vh, 88vw)", height: "min(88vh, 88vw)" }}
        />
        <div
          className="absolute rounded-full border border-white/[0.07]"
          style={{ width: "min(64vh, 64vw)", height: "min(64vh, 64vw)" }}
        />
        <div
          className="absolute rounded-full border border-white/[0.10]"
          style={{ width: "min(40vh, 40vw)", height: "min(40vh, 40vw)" }}
        />
      </div>
      {/* Gold hairline frame — brand accent, sits outside the floating card */}
      <div
        aria-hidden="true"
        className="absolute inset-3 sm:inset-5 rounded-[1.7rem] border border-gold-500/25 pointer-events-none"
      />

      {/* ===== Floating white card — the one bright surface in a dark room ===== */}
      <div className="relative z-10 w-full max-w-[26.5rem]">
        {/* Card lift glow — grounds the float without looking like neon */}
        <div
          aria-hidden="true"
          className="absolute inset-x-8 -bottom-2 h-10 rounded-full blur-2xl"
          style={{ background: "rgba(2,20,44,.55)" }}
        />

        <div
          className="relative rounded-3xl bg-white/95 backdrop-blur-xl border border-white/60"
          style={{
            boxShadow:
              "0 40px 90px -24px rgba(0,0,0,.65), 0 12px 28px rgba(2,20,44,.35), inset 0 1px 0 rgba(255,255,255,.9)",
          }}
        >
          <div className="px-7 sm:px-9 pt-9 pb-8">
            {/* Brand row — round seal + wordmark */}
            <div className="flex items-center gap-3.5 mb-7">
              <div
                className="h-14 w-14 shrink-0 rounded-2xl p-[2px]"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,.9) 0%, rgba(255,255,255,.25) 45%, rgba(4,33,74,.30) 100%)",
                  boxShadow:
                    "0 10px 22px -6px rgba(2,20,44,.45), inset 0 1px 0 rgba(255,255,255,.7)",
                }}
              >
                <div className="h-full w-full rounded-[14px] bg-white flex items-center justify-center">
                  <img
                    src="/logo-samit-icon.png"
                    alt="Logo LPK SAMIT"
                    className="w-[74%] h-[74%] object-contain"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[0.95rem] font-bold text-slate-900 leading-tight tracking-tight">
                  Koperasi SAMIT
                </p>
                <p className="text-xs font-medium text-primary-600">LPK Sakura Mitra</p>
              </div>
            </div>

            <h1 className="text-[1.65rem] sm:text-3xl font-bold text-slate-900 tracking-tight leading-[1.15]">
              Masuk ke Sistem Koperasi
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Gunakan akun yang diberikan administrator.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
              >
                <span className="mt-0.5 shrink-0 text-red-500">
                  <Icon paths={icons.alert} size={16} />
                </span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate={false}>
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Username
                </label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="Masukkan username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  className=""
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500 transition-colors"
                    aria-pressed={showPassword}
                  >
                    <Icon paths={showPassword ? icons.eyeOff : icons.eye} size={14} />
                    {showPassword ? "Sembunyikan" : "Lihat"}
                  </button>
                </div>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className=""
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                bgColor="bg-primary-900 hover:bg-primary-700"
                textColor="text-white"
                className="w-full !py-3 !text-sm font-semibold shadow-lg shadow-primary-900/25 hover:shadow-xl hover:shadow-primary-900/30 active:scale-[0.98] !rounded-xl transition-all duration-150"
              >
                {loading ? "Memproses…" : "Masuk"}
              </Button>
            </form>

            {/* Trust strip — same hue as canvas, one quiet row */}
            <div className="mt-7 grid grid-cols-3 gap-2 border-t border-slate-100 pt-5">
              {trust.map((t) => (
                <div key={t.title} className="flex flex-col items-center text-center gap-1.5 px-1">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                    <Icon paths={t.icon} size={14} />
                  </span>
                  <span className="text-[0.68rem] font-semibold text-slate-800 leading-tight">{t.title}</span>
                  <span className="text-[0.63rem] text-slate-500 leading-tight">{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer — outside the card, on the navy canvas */}
        <p className="mt-6 text-center text-xs text-primary-300">
          © {new Date().getFullYear()} LPK SAMIT Sakura Mitra — Lembaga Pelatihan Kerja
        </p>
      </div>
    </div>
  );
};

export default Login;
