import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import api from "../api/index.jsx";
import Pagination from "../components/Pagination.jsx";
import { toast } from "react-toastify";
import jsPDF from "jspdf";
import "jspdf-autotable";

const Reports = () => {
  const [members, setMembers] = useState([]);
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states - default 1 tahun terakhir
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return format(d, "yyyy-MM-dd");
  });
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMember, setFilterMember] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [products, setProducts] = useState([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Tab state
  const [activeTab, setActiveTab] = useState("savings"); // savings, members, overdue

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log("Fetching data...");
      
      // Fetch members
      const membersRes = await api.get("/api/admin/members");
      console.log("Members response:", membersRes.data);
      if (membersRes.data.success) {
        setMembers(membersRes.data.data || []);
      }
      
      // Fetch savings - dengan pagination untuk ambil semua data
      let allSavings = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const savingsRes = await api.get(`/api/admin/savings?limit=100&page=${page}`);
        console.log(`Savings page ${page}:`, savingsRes.data);
        
        if (savingsRes.data.success) {
          let savingsData = [];
          if (Array.isArray(savingsRes.data.data)) {
            savingsData = savingsRes.data.data;
          } else if (savingsRes.data.data?.savings) {
            savingsData = savingsRes.data.data.savings;
          }
          
          allSavings = [...allSavings, ...savingsData];
          
          // Check if there's more data
          const total = savingsRes.data.data?.pagination?.totalItems || savingsRes.data.pagination?.totalItems || 0;
          hasMore = allSavings.length < total && savingsData.length > 0;
          page++;
        } else {
          hasMore = false;
        }
        
        // Safety limit - max 10 pages (1000 records)
        if (page > 10) hasMore = false;
      }
      
      console.log("Total savings loaded:", allSavings.length);
      setSavings(allSavings);
      
      // Fetch products
      const productsRes = await api.get("/api/admin/products");
      console.log("Products response:", productsRes.data);
      if (productsRes.data.success) {
        setProducts(productsRes.data.data || []);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      console.error("Error response:", err.response?.data);
      toast.error("Gagal memuat data: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  // Calculate member payment status for each period
  const getMemberPaymentStatus = (member) => {
    if (!member.product) return { status: "no_product", periods: [], paidPeriods: 0, totalPaid: 0 };
    
    // Find all savings for this member - check multiple ways
    const memberSavings = savings.filter(s => {
      const savingMemberId = s.memberId?._id || s.memberId;
      const memberIdStr = member._id?.toString() || member._id;
      return savingMemberId === memberIdStr || 
             savingMemberId === member._id ||
             s.memberId?.uuid === member.uuid;
    });
    
    // Debug log
    if (memberSavings.length > 0) {
      console.log(`Member ${member.name} (${member.uuid}): Found ${memberSavings.length} savings`);
    }
    
    const totalPeriods = member.product.termDuration || 36;
    let depositAmount = member.product.depositAmount || 0;
    const periods = [];
    
    let totalPaid = 0;
    let paidPeriods = 0;
    let partialPeriods = 0;
    let overduePeriods = 0;
    
    // Check if member has upgraded
    const hasUpgraded = member.hasUpgraded;
    const upgradeInfo = member.currentUpgradeId;
    
    // Calculate start date for periods
    const startDate = member.savingsStartDate 
      ? new Date(member.savingsStartDate) 
      : new Date(member.createdAt);
    
    // Get current date for comparison
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    for (let period = 1; period <= totalPeriods; period++) {
      // Adjust deposit amount based on upgrade
      let requiredAmount = depositAmount;
      if (hasUpgraded && upgradeInfo) {
        const completedAtUpgrade = upgradeInfo.completedPeriodsAtUpgrade || 0;
        if (period <= completedAtUpgrade && upgradeInfo.oldMonthlyDeposit > 0) {
          requiredAmount = upgradeInfo.oldMonthlyDeposit;
        } else if (upgradeInfo.newPaymentWithCompensation > 0) {
          requiredAmount = upgradeInfo.newPaymentWithCompensation;
        }
      }
      
      const periodSavings = memberSavings.filter(s => s.installmentPeriod === period && s.status === "Approved");
      const periodTotal = periodSavings.reduce((sum, s) => sum + s.amount, 0);
      
      // Calculate due date for this period (period 1 = startDate month)
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + period - 1);
      const dueMonth = dueDate.getMonth();
      const dueYear = dueDate.getFullYear();
      
      // Check if this period is in the current month
      const isCurrentMonth = dueMonth === currentMonth && dueYear === currentYear;
      
      // Check if this period is overdue (past months, not current month)
      const isOverdue = (dueYear < currentYear || (dueYear === currentYear && dueMonth < currentMonth)) && periodTotal < requiredAmount;
      
      // Check if this period is partial (current month, not yet paid full)
      const isPartial = isCurrentMonth && periodTotal < requiredAmount;
      
      let status = "unpaid";
      if (periodTotal >= requiredAmount) {
        status = "paid";
        paidPeriods++;
      } else if (isOverdue) {
        // Overdue: past months that haven't been paid
        status = "overdue";
        overduePeriods++;
      } else if (isPartial) {
        // Partial: current month not yet paid
        status = "partial";
        partialPeriods++;
      } else if (periodTotal > 0) {
        // Has some payment but not full (for future periods)
        status = "partial";
        partialPeriods++;
      }
      
      totalPaid += periodTotal;
      
      periods.push({
        period,
        dueDate,
        required: requiredAmount,
        paid: periodTotal,
        remaining: Math.max(0, requiredAmount - periodTotal),
        status,
        isOverdue,
        isPartial,
        isCurrentMonth
      });
    }
    
    return {
      totalPaid,
      totalRequired: totalPeriods * depositAmount,
      paidPeriods,
      partialPeriods,
      overduePeriods,
      unpaidPeriods: totalPeriods - paidPeriods - partialPeriods - overduePeriods,
      periods,
      progress: totalPeriods > 0 ? (paidPeriods / totalPeriods) * 100 : 0
    };
  };

  // Filter savings by date range
  const filteredSavings = useMemo(() => {
    let result = [...savings];
    
    console.log("Total savings before filter:", result.length);
    
    // Filter by date range - make it more lenient
    if (dateFrom && dateTo) {
      const startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      
      result = result.filter(s => {
        const savingDate = new Date(s.savingsDate || s.createdAt);
        return savingDate >= startDate && savingDate <= endDate;
      });
      
      console.log("After date filter:", result.length);
    }
    
    // Filter by status - only for savings tab
    if (filterStatus !== "all" && activeTab === "savings") {
      result = result.filter(s => s.status === filterStatus);
    }
    
    // Filter by member
    if (filterMember !== "all") {
      result = result.filter(s => 
        s.memberId?._id === filterMember || 
        s.memberId === filterMember
      );
    }
    
    // Filter by product
    if (filterProduct !== "all") {
      result = result.filter(s => 
        s.productId?._id === filterProduct || 
        s.productId === filterProduct
      );
    }
    
    console.log("Final filtered savings:", result.length);
    
    return result.sort((a, b) => new Date(b.savingsDate || b.createdAt) - new Date(a.savingsDate || a.createdAt));
  }, [savings, dateFrom, dateTo, filterStatus, filterMember, filterProduct, activeTab]);

  // Member report with payment status
  const memberReport = useMemo(() => {
    let result = members.map(member => ({
      ...member,
      paymentStatus: getMemberPaymentStatus(member)
    }));
    
    // Filter by product
    if (filterProduct !== "all") {
      result = result.filter(m => m.productId === filterProduct || m.product?._id === filterProduct);
    }
    
    // Filter by completion status
    if (filterStatus === "completed") {
      result = result.filter(m => m.isCompleted);
    } else if (filterStatus === "not_completed") {
      result = result.filter(m => !m.isCompleted);
    } else if (filterStatus === "has_overdue") {
      result = result.filter(m => m.paymentStatus.overduePeriods > 0);
    } else if (filterStatus === "has_partial") {
      // Partial: bulan ini belum bayar (tapi tidak ada overdue)
      result = result.filter(m => m.paymentStatus.partialPeriods > 0 && m.paymentStatus.overduePeriods === 0);
    } else if (filterStatus === "all_paid") {
      result = result.filter(m => m.paymentStatus.unpaidPeriods === 0 && m.paymentStatus.partialPeriods === 0);
    }
    
    return result;
  }, [members, savings, filterProduct, filterStatus]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    const totalMembers = members.length;
    const completedMembers = members.filter(m => m.isCompleted).length;
    
    const totalSavingsAmount = savings
      .filter(s => (s.status === "Approved" || s.status === "Partial") && s.type === "Setoran")
      .reduce((sum, s) => sum + s.amount, 0);
    
    const totalWithdrawals = savings
      .filter(s => s.status === "Approved" && s.type === "Penarikan")
      .reduce((sum, s) => sum + s.amount, 0);
    
    const pendingSavings = savings
      .filter(s => s.status === "Pending")
      .reduce((sum, s) => sum + s.amount, 0);
    
    const partialSavingsCount = savings
      .filter(s => s.status === "Partial" || s.paymentType === "Partial")
      .length;
    
    const pendingCount = savings.filter(s => s.status === "Pending").length;
    
    const membersWithOverdue = memberReport.filter(m => m.paymentStatus.overduePeriods > 0).length;
    // Partial: anggota yang di bulan ini belum bayar (tapi tidak overdue)
    const membersWithPartial = memberReport.filter(m => 
      m.paymentStatus.partialPeriods > 0 && m.paymentStatus.overduePeriods === 0
    ).length;
    const membersAllPaid = memberReport.filter(m => 
      m.paymentStatus.unpaidPeriods === 0 && m.paymentStatus.partialPeriods === 0 && m.product
    ).length;
    
    // Period stats in date range
    const filteredTotal = filteredSavings
      .filter(s => (s.status === "Approved" || s.status === "Partial") && s.type === "Setoran")
      .reduce((sum, s) => sum + s.amount, 0);
    
    return {
      totalMembers,
      completedMembers,
      totalSavingsAmount,
      totalWithdrawals,
      netSavings: totalSavingsAmount - totalWithdrawals,
      pendingSavings,
      pendingCount,
      partialSavingsCount,
      membersWithOverdue,
      membersWithPartial,
      membersAllPaid,
      filteredTotal,
      filteredCount: filteredSavings.length
    };
  }, [members, savings, memberReport, filteredSavings]);

  // Pagination
  const paginatedData = useMemo(() => {
    const data = activeTab === "savings" ? filteredSavings : memberReport;
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentData = data.slice(startIndex, startIndex + itemsPerPage);
    return { totalPages, currentData, totalItems: data.length };
  }, [activeTab, filteredSavings, memberReport, currentPage, itemsPerPage]);

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("LAPORAN KOPERASI LPK SAMIT", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Periode: ${format(parseISO(dateFrom), "dd MMM yyyy", { locale: id })} - ${format(parseISO(dateTo), "dd MMM yyyy", { locale: id })}`, pageWidth / 2, 28, { align: "center" });
    doc.text(`Dicetak: ${format(new Date(), "dd MMM yyyy HH:mm", { locale: id })}`, pageWidth / 2, 34, { align: "center" });
    
    // Summary
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("RINGKASAN", 14, 45);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const summaryData = [
      ["Total Anggota", summaryStats.totalMembers.toString()],
      ["Anggota Lunas (TF)", summaryStats.completedMembers.toString()],
      ["Total Simpanan", formatCurrency(summaryStats.totalSavingsAmount)],
      ["Total Penarikan", formatCurrency(summaryStats.totalWithdrawals)],
      ["Saldo Bersih", formatCurrency(summaryStats.netSavings)],
      ["Anggota Overdue", summaryStats.membersWithOverdue.toString()],
      ["Anggota Partial (Bulan Ini)", summaryStats.membersWithPartial.toString()],
    ];
    
    doc.autoTable({
      startY: 50,
      head: [["Keterangan", "Nilai"]],
      body: summaryData,
      theme: "grid",
      headStyles: { fillColor: [236, 72, 153] },
      margin: { left: 14, right: 14 },
      tableWidth: 80
    });
    
    // Transaction table
    if (activeTab === "savings") {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("DAFTAR TRANSAKSI", 14, doc.lastAutoTable.finalY + 15);
      
      const tableData = filteredSavings.slice(0, 50).map(s => [
        format(new Date(s.savingsDate || s.createdAt), "dd/MM/yy"),
        s.memberId?.name || "-",
        s.type,
        `Periode ${s.installmentPeriod || "-"}`,
        formatCurrency(s.amount),
        s.status
      ]);
      
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [["Tanggal", "Anggota", "Tipe", "Periode", "Jumlah", "Status"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [236, 72, 153] },
        styles: { fontSize: 8 }
      });
    } else {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("DAFTAR ANGGOTA", 14, doc.lastAutoTable.finalY + 15);
      
      const tableData = memberReport.slice(0, 50).map(m => {
        const status = m.isCompleted ? "Lunas" : 
                       m.paymentStatus.overduePeriods > 0 ? "Overdue" : 
                       m.paymentStatus.partialPeriods > 0 ? "Partial" : "Aktif";
        return [
          m.uuid,
          m.name,
          m.product?.title || "-",
          formatCurrency(m.paymentStatus.totalPaid),
          `${m.paymentStatus.paidPeriods}/${m.product?.termDuration || 0}`,
          m.paymentStatus.overduePeriods > 0 ? `${m.paymentStatus.overduePeriods}` : "-",
          m.paymentStatus.partialPeriods > 0 ? `${m.paymentStatus.partialPeriods}` : "-",
          status
        ];
      });
      
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [["UUID", "Nama", "Produk", "Total Bayar", "Progress", "Overdue", "Partial", "Status"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [236, 72, 153] },
        styles: { fontSize: 7 }
      });
    }
    
    doc.save(`Laporan_Koperasi_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
    toast.success("PDF berhasil diunduh!");
  };

  // Export to CSV
  const exportToCSV = () => {
    let csvContent = "";
    
    if (activeTab === "savings") {
      csvContent = "Tanggal,Anggota,UUID,Tipe,Periode,Jumlah,Status,Keterangan\n";
      filteredSavings.forEach(s => {
        csvContent += `${format(new Date(s.savingsDate || s.createdAt), "yyyy-MM-dd")},`;
        csvContent += `"${s.memberId?.name || "-"}",`;
        csvContent += `${s.memberId?.uuid || "-"},`;
        csvContent += `${s.type},`;
        csvContent += `${s.installmentPeriod || "-"},`;
        csvContent += `${s.amount},`;
        csvContent += `${s.status},`;
        csvContent += `"${s.description || "-"}"\n`;
      });
    } else {
      csvContent = "UUID,Nama,Produk,Total Bayar,Total Wajib,Periode Lunas,Periode Overdue,Periode Partial,Status\n";
      memberReport.forEach(m => {
        const status = m.isCompleted ? "Lunas" : 
                       m.paymentStatus.overduePeriods > 0 ? "Overdue" : 
                       m.paymentStatus.partialPeriods > 0 ? "Partial" : "Aktif";
        csvContent += `${m.uuid},`;
        csvContent += `"${m.name}",`;
        csvContent += `"${m.product?.title || "-"}",`;
        csvContent += `${m.paymentStatus.totalPaid},`;
        csvContent += `${m.paymentStatus.totalRequired},`;
        csvContent += `${m.paymentStatus.paidPeriods},`;
        csvContent += `${m.paymentStatus.overduePeriods},`;
        csvContent += `${m.paymentStatus.partialPeriods},`;
        csvContent += `${status}\n`;
      });
    }
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_Koperasi_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
    link.click();
    toast.success("CSV berhasil diunduh!");
  };

  const resetFilters = () => {
    setDateFrom(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setDateTo(format(endOfMonth(new Date()), "yyyy-MM-dd"));
    setFilterStatus("all");
    setFilterMember("all");
    setFilterProduct("all");
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">🌸 Memuat laporan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">📊 Laporan Koperasi</h1>
        <div className="flex gap-2">
          <button
            onClick={exportToPDF}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
          >
            📄 Export PDF
          </button>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
          >
            📊 Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-3 border border-pink-100">
          <p className="text-xs text-gray-500">Total Anggota</p>
          <p className="text-xl font-bold text-gray-900">{summaryStats.totalMembers}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-green-100">
          <p className="text-xs text-gray-500">Lunas (TF)</p>
          <p className="text-xl font-bold text-green-600">{summaryStats.completedMembers}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-blue-100">
          <p className="text-xs text-gray-500">Total Simpanan</p>
          <p className="text-sm font-bold text-blue-600">{formatCurrency(summaryStats.totalSavingsAmount)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-purple-100">
          <p className="text-xs text-gray-500">Saldo Bersih</p>
          <p className="text-sm font-bold text-purple-600">{formatCurrency(summaryStats.netSavings)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-yellow-100">
          <p className="text-xs text-gray-500">Pending</p>
          <p className="text-xl font-bold text-yellow-600">{summaryStats.pendingCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-orange-100">
          <p className="text-xs text-gray-500">Partial (Bulan Ini)</p>
          <p className="text-xl font-bold text-orange-600">{summaryStats.membersWithPartial}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-red-100">
          <p className="text-xs text-gray-500">Overdue</p>
          <p className="text-xl font-bold text-red-600">{summaryStats.membersWithOverdue}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-3 border border-teal-100">
          <p className="text-xs text-gray-500">All Paid</p>
          <p className="text-xl font-bold text-teal-600">{summaryStats.membersAllPaid}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-pink-100">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">Semua Status</option>
              {activeTab === "savings" ? (
                <>
                  <option value="Approved">✅ Approved</option>
                  <option value="Pending">⏳ Pending</option>
                  <option value="Partial">🔶 Partial</option>
                  <option value="Rejected">❌ Rejected</option>
                </>
              ) : (
                <>
                  <option value="completed">✅ Lunas (TF)</option>
                  <option value="not_completed">⏳ Belum Lunas</option>
                  <option value="has_overdue">🔴 Ada Overdue</option>
                  <option value="has_partial">🟠 Partial (Bulan Ini)</option>
                  <option value="all_paid">💚 Semua Periode Lunas</option>
                </>
              )}
            </select>
          </div>
          {activeTab === "savings" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Anggota</label>
              <select
                value={filterMember}
                onChange={(e) => { setFilterMember(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 max-w-[200px]"
              >
                <option value="all">Semua Anggota</option>
                {members.map(m => (
                  <option key={m._id} value={m._id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Produk</label>
            <select
              value={filterProduct}
              onChange={(e) => { setFilterProduct(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">Semua Produk</option>
              {products.map(p => (
                <option key={p._id} value={p._id}>{p.title}</option>
              ))}
            </select>
          </div>
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setActiveTab("savings"); setCurrentPage(1); setFilterStatus("all"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "savings" 
              ? "bg-pink-500 text-white" 
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          💰 Transaksi Simpanan ({filteredSavings.length})
        </button>
        <button
          onClick={() => { setActiveTab("members"); setCurrentPage(1); setFilterStatus("all"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "members" 
              ? "bg-pink-500 text-white" 
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          👥 Status Anggota ({memberReport.length})
        </button>
        <button
          onClick={() => { setActiveTab("members"); setCurrentPage(1); setFilterStatus("has_overdue"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "members" && filterStatus === "has_overdue"
              ? "bg-red-500 text-white" 
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
        >
          🔴 Overdue ({summaryStats.membersWithOverdue})
        </button>
        <button
          onClick={() => { setActiveTab("members"); setCurrentPage(1); setFilterStatus("has_partial"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "members" && filterStatus === "has_partial"
              ? "bg-orange-500 text-white" 
              : "bg-orange-100 text-orange-700 hover:bg-orange-200"
          }`}
        >
          🟠 Partial ({summaryStats.membersWithPartial})
        </button>
        <button
          onClick={() => { setActiveTab("savings"); setCurrentPage(1); setFilterStatus("Pending"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "savings" && filterStatus === "Pending"
              ? "bg-yellow-500 text-white" 
              : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          }`}
        >
          ⏳ Pending ({summaryStats.pendingCount})
        </button>
        <button
          onClick={() => { setActiveTab("members"); setCurrentPage(1); setFilterStatus("has_partial"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "members" && filterStatus === "has_partial"
              ? "bg-orange-500 text-white" 
              : "bg-orange-100 text-orange-700 hover:bg-orange-200"
          }`}
        >
          🟠 Partial ({summaryStats.membersWithPartial})
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-pink-100">
        <div className="overflow-x-auto">
          {activeTab === "savings" ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-pink-50 to-rose-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Anggota</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Tipe</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Periode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Jumlah</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedData.currentData.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      Tidak ada data transaksi
                    </td>
                  </tr>
                ) : (
                  paginatedData.currentData.map((s) => (
                    <tr key={s._id} className="hover:bg-pink-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {format(new Date(s.savingsDate || s.createdAt), "dd MMM yyyy", { locale: id })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{s.memberId?.name || "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          s.type === "Setoran" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"
                        }`}>
                          {s.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">Periode {s.installmentPeriod || "-"}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(s.amount)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          s.status === "Approved" ? "bg-green-100 text-green-800" :
                          s.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                          s.status === "Partial" ? "bg-orange-100 text-orange-800" :
                          "bg-red-100 text-red-800"
                        }`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-pink-50 to-rose-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">UUID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Produk</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Total Bayar</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Overdue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Partial</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedData.currentData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                      Tidak ada data anggota
                    </td>
                  </tr>
                ) : (
                  paginatedData.currentData.map((m) => (
                    <tr key={m._id} className="hover:bg-pink-50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">{m.uuid}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{m.product?.title || "-"}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(m.paymentStatus.totalPaid)}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-pink-500 h-2 rounded-full" 
                              style={{ width: `${Math.min(100, m.paymentStatus.progress)}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-600">
                            {m.paymentStatus.paidPeriods}/{m.product?.termDuration || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {m.paymentStatus.overduePeriods > 0 ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                            🔴 {m.paymentStatus.overduePeriods} periode
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">✅ Tidak ada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {m.paymentStatus.partialPeriods > 0 ? (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">
                            🟠 {m.paymentStatus.partialPeriods} periode
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">✅ Tidak ada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {m.isCompleted ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                            ✅ Lunas
                          </span>
                        ) : m.paymentStatus.overduePeriods > 0 ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                            🔴 Overdue
                          </span>
                        ) : m.paymentStatus.partialPeriods > 0 ? (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">
                            🟠 Partial
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                            💙 Aktif
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        
        <Pagination
          currentPage={currentPage}
          totalPages={paginatedData.totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={paginatedData.totalItems}
        />
      </div>
    </div>
  );
};

export default Reports;
