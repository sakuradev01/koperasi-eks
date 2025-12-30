import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import { logout } from "../store/authSlice.js";
import axios from "axios";
import { API_URL } from "../api/config";

const Topbar = ({ setSidebarOpen }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  
  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState(() => {
    const saved = localStorage.getItem("readNotifIds");
    return saved ? JSON.parse(saved) : [];
  });
  const dropdownRef = useRef(null);

  // Fetch pending savings as notifications
  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/api/admin/savings?status=Pending&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.data.success) {
        const savingsData = response.data.data?.savings || response.data.data || [];
        const pendingSavings = Array.isArray(savingsData) ? savingsData : [];
        setNotifications(pendingSavings);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Count unread notifications
  const unreadCount = notifications.filter(n => !readNotifIds.includes(n._id)).length;

  // Handle notification click
  const handleNotifClick = (notif) => {
    // Mark as read
    const newReadIds = [...readNotifIds, notif._id];
    setReadNotifIds(newReadIds);
    localStorage.setItem("readNotifIds", JSON.stringify(newReadIds));
    
    // Navigate to savings page with member filter
    const memberId = notif.memberId?._id || notif.memberId;
    navigate(`/simpanan?member=${memberId}&status=Pending`);
    setShowNotifDropdown(false);
  };

  // Mark all as read
  const markAllAsRead = () => {
    const allIds = notifications.map(n => n._id);
    setReadNotifIds(allIds);
    localStorage.setItem("readNotifIds", JSON.stringify(allIds));
  };

  const handleLogout = () => {
    dispatch(logout());
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <header className="bg-white shadow-sm border-b border-pink-200">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4">
        {/* Left Side */}
        <div className="flex items-center">
          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setSidebarOpen && setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-pink-50 mr-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center">
            <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg flex items-center justify-center mr-2">
              <span className="text-white text-sm font-bold">🌸</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">LPK SAMIT</h1>
            </div>
          </div>
          
          {/* Desktop Title */}
          <div className="hidden lg:block">
            <h2 className="text-xl font-semibold text-gray-800">
              🌸 Dashboard Koperasi
            </h2>
          </div>
        </div>

        {/* Right Side */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Notification Bell */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="relative p-2 text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden">
                <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-pink-50 to-rose-50">
                  <h3 className="font-semibold text-gray-800">🔔 Notifikasi</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-pink-600 hover:text-pink-800"
                    >
                      Tandai semua dibaca
                    </button>
                  )}
                </div>
                
                <div className="overflow-y-auto max-h-72">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      <span className="text-2xl">✨</span>
                      <p className="mt-2 text-sm">Tidak ada notifikasi</p>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const isRead = readNotifIds.includes(notif._id);
                      return (
                        <div
                          key={notif._id}
                          onClick={() => handleNotifClick(notif)}
                          className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-pink-50 transition-colors ${
                            !isRead ? "bg-pink-50/50" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-2 h-2 rounded-full mt-2 ${!isRead ? "bg-pink-500" : "bg-gray-300"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {notif.memberId?.name || "Unknown"} 
                                <span className="text-gray-500 font-normal"> mengajukan simpanan</span>
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Periode {notif.installmentPeriod} • Rp {(notif.amount || 0).toLocaleString("id-ID")}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notif.createdAt).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </p>
                            </div>
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                              Pending
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                {notifications.length > 0 && (
                  <div className="p-2 border-t border-gray-200 bg-gray-50">
                    <button
                      onClick={() => {
                        navigate("/simpanan?status=Pending");
                        setShowNotifDropdown(false);
                      }}
                      className="w-full text-center text-sm text-pink-600 hover:text-pink-800 py-1"
                    >
                      Lihat semua simpanan pending →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-pink-100 to-rose-100 rounded-full flex items-center justify-center">
              <span className="text-pink-600 text-sm font-bold">
                {user?.name?.charAt(0) || 'A'}
              </span>
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-700">
              {user?.name || 'Admin'}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-pink-50 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="hidden sm:block">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

Topbar.propTypes = {
  setSidebarOpen: PropTypes.func,
};

export default Topbar;
