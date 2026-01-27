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
    } catch (error) {
      console.error("Login error:", error);
      setError(error.message || "Username atau password salah");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100 flex flex-col lg:flex-row overflow-hidden">
      {/* Site Info Section */}
      <div className="lg:w-1/2 bg-gradient-to-br from-pink-500 via-pink-600 to-rose-600 flex justify-center items-center text-white p-6 sm:p-10 transition-all duration-300 ease-in-out min-h-0">
        <div className="text-center max-w-md">
          <div className="mb-6">
            {/* Sakura Logo */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <div className="text-pink-600 text-2xl sm:text-3xl font-bold">
                🌸
              </div>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
            LPK SAMIT
          </h1>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold mb-4 text-pink-100">
            Sakura Mitra
          </h2>
          <p className="text-sm sm:text-base lg:text-lg mb-2">
            Lembaga Pelatihan Kerja
          </p>
          <p className="text-xs sm:text-sm opacity-90">
            Sistem Manajemen Koperasi Digital
          </p>
          <div className="mt-6 hidden lg:block">
            <div className="flex justify-center space-x-2 text-pink-200">
              <span>🌸</span>
              <span>🌸</span>
              <span>🌸</span>
            </div>
          </div>
        </div>
      </div>

      {/* Login Form Section */}
      <div className="lg:w-1/2 flex justify-center items-center bg-white p-6 sm:p-10 transition-all duration-300 ease-in-out min-h-0 overflow-y-auto">
        <div className="max-w-md w-full">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white text-xl font-bold">🌸</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
              LPK SAMIT Sakura Mitra
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Lembaga Pelatihan Kerja
            </p>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-800 mb-6">
            Masuk ke Sistem Koperasi
          </h2>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="Masukkan username"
                value={formData.username}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors duration-200 text-sm sm:text-base"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Masukkan password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors duration-200 text-sm sm:text-base"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white py-2 sm:py-3 px-4 rounded-lg hover:from-pink-600 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Memproses...
                </div>
              ) : (
                "🌸 Masuk ke Sistem"
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              © 2025 LPK SAMIT Sakura Mitra
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Lembaga Pelatihan Kerja
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
