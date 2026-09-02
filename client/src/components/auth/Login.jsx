import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logIn } from "../../api/authApi";
import { login } from "../../store/authSlice";
import Input from "../../utils/Input.jsx";
import Button from "../../utils/Button.jsx";

const Login = () => {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await logIn(formData);

      if (response.success) {
        // Update Redux store
        dispatch(login(response.data.user));

        // Redirect to dashboard
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

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-primary-50">
      {/* Brand panel — navy, hidden on small phones, compact on tablets */}
      <div className="hidden md:flex lg:w-[55%] xl:w-1/2 relative overflow-hidden bg-primary-900 text-white">
        {/* Subtle radial depth — single hue, no glassmorphism */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 20% 10%, rgba(53,97,155,.35) 0%, rgba(4,33,74,0) 55%), radial-gradient(90% 70% at 90% 100%, rgba(2,20,44,.9) 0%, rgba(4,33,74,0) 60%)",
          }}
        />
        {/* Thin gold rule as brand accent */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 h-full w-[3px] bg-gold-500/70"
        />

        <div className="relative z-10 flex flex-col justify-center w-full max-w-lg mx-auto px-8 lg:px-14 py-12">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-card flex items-center justify-center mb-8">
            <img
              src="/logo-samit.png"
              alt="Logo LPK SAMIT"
              className="w-11 h-11 object-contain"
            />
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white">
            Koperasi SAMIT
          </h1>
          <p className="mt-2 text-lg font-medium text-gold-300">
            LPK Sakura Mitra
          </p>

          <div className="mt-8 space-y-1.5">
            <p className="text-base text-primary-100">
              Lembaga Pelatihan Kerja
            </p>
            <p className="text-sm text-primary-300">
              Sistem Manajemen Koperasi Digital
            </p>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
            <div>
              <dt className="text-xs text-primary-300">Aman</dt>
              <dd className="mt-1 text-sm font-medium text-white">
                Data terlindungi
              </dd>
            </div>
            <div>
              <dt className="text-xs text-primary-300">Terintegrasi</dt>
              <dd className="mt-1 text-sm font-medium text-white">
                Simpanan &amp; pinjaman
              </dd>
            </div>
            <div>
              <dt className="text-xs text-primary-300">Real-time</dt>
              <dd className="mt-1 text-sm font-medium text-white">
                Laporan akurat
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center bg-white px-5 py-10 sm:px-10 lg:py-8 overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* Mobile brand row */}
          <div className="md:hidden flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-primary-900 flex items-center justify-center flex-shrink-0">
              <img
                src="/logo-samit.png"
                alt="Logo LPK SAMIT"
                className="w-7 h-7 object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                Koperasi SAMIT
              </h1>
              <p className="text-xs text-slate-500">LPK Sakura Mitra</p>
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Masuk ke Sistem Koperasi
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Gunakan akun yang diberikan administrator.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
            >
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-4"
            noValidate={false}
          >
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
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
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
              className="w-full !py-2.5 !text-sm font-semibold shadow-sm hover:shadow-card-hover !rounded-lg"
            >
              {loading ? "Memproses…" : "Masuk"}
            </Button>
          </form>

          <div className="mt-10 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} LPK SAMIT Sakura Mitra
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Lembaga Pelatihan Kerja
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
