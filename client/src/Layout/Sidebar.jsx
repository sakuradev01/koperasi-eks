import { Link, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import PropTypes from "prop-types";

const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const { user } = useSelector((state) => state.auth);
  const location = useLocation();

  const menuItems = [
    {
      title: "Dashboard",
      icon: "📊",
      path: "/dashboard",
    },
    {
      title: "Simpanan",
      icon: "💰",
      path: "/simpanan",
    },
    {
      title: "Pinjaman",
      icon: "💳",
      path: "/pinjaman",
    },
    {
      title: "Manajemen Pinjaman",
      icon: "🏦",
      path: "/loan-management",
    },
    {
      title: "Master Data",
      icon: "📋",
      children: [
        {
          title: "Anggota",
          path: "/master/anggota",
        },
        {
          title: "Produk Simpanan",
          path: "/master/produk",
        },
        {
          title: "Produk Pinjaman",
          path: "/master/loan-products",
        },
      ],
    },
    {
      title: "Pengaturan",
      icon: "⚙️",
      path: "/settings",
    },
  ];

  const isActive = (path) => location.pathname === path;

  const renderMenuItems = (items) => {
    return items.map((item) => {
      if (item.children) {
        return (
          <div key={item.title} className="mb-2">
            <div className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 cursor-pointer">
              <span className="mr-3">{item.icon}</span>
              <span className="font-medium">{item.title}</span>
            </div>
            <div className="ml-8">{renderMenuItems(item.children)}</div>
          </div>
        );
      }

      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setSidebarOpen && setSidebarOpen(false)}
          className={`flex items-center px-4 py-2 mb-1 rounded-lg transition-colors ${
            isActive(item.path)
              ? "bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 border border-pink-200"
              : "text-gray-600 hover:text-gray-900 hover:bg-pink-50"
          }`}
        >
          <span className="mr-3">{item.icon}</span>
          <span>{item.title}</span>
        </Link>
      );
    });
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-64 bg-white shadow-lg flex-col h-screen border-r border-pink-200">
        <div className="p-6">
          <div className="flex items-center mb-8">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg flex items-center justify-center mr-3">
              <span className="text-white text-xl font-bold">🌸</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">LPK SAMIT</h1>
              <p className="text-xs text-gray-500">Sakura Mitra</p>
            </div>
          </div>

          <nav className="space-y-1 flex-1">{renderMenuItems(menuItems)}</nav>
        </div>

        <div className="mt-auto p-6 border-t border-pink-200">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-100 to-rose-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-pink-600 text-sm font-bold">
                {user?.name?.charAt(0)}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:hidden ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg flex items-center justify-center mr-2">
                  <span className="text-white text-sm font-bold">🌸</span>
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">LPK SAMIT</h1>
                  <p className="text-xs text-gray-500">Sakura Mitra</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <span className="text-xl">✕</span>
              </button>
            </div>
          </div>

          <div className="flex-1 p-4">
            <nav className="space-y-1">{renderMenuItems(menuItems)}</nav>
          </div>

          <div className="p-4 border-t border-pink-200">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-pink-100 to-rose-100 rounded-full flex items-center justify-center mr-2">
                <span className="text-pink-600 text-xs font-bold">
                  {user?.name?.charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Sidebar.propTypes = {
  sidebarOpen: PropTypes.bool,
  setSidebarOpen: PropTypes.func,
};

export default Sidebar;
