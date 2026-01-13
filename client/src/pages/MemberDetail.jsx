import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import api from "../api/index.jsx";
import { loanApi, loanPaymentApi } from "../api/loanApi.jsx";
import Pagination from "../components/Pagination.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { toast } from "react-toastify";
import jsPDF from "jspdf";
import "jspdf-autotable";

const MemberDetail = () => {
  const { uuid } = useParams();
  const navigate = useNavigate();
  
  const [member, setMember] = useState(null);
  const [savings, setSavings] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loanProducts, setLoanProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("simpanan");
  
  // Pagination for savings
  const [currentSavingsPage, setCurrentSavingsPage] = useState(1);
  const [currentLoansPage, setCurrentLoansPage] = useState(1);
  const [currentPeriodPage, setCurrentPeriodPage] = useState(1);
  const itemsPerPage = 10;

  // Modal state for proof image
  const [showProofModal, setShowProofModal] = useState(false);
  const [currentProofImage, setCurrentProofImage] = useState(null);
  const [currentTransactionInfo, setCurrentTransactionInfo] = useState(null);

  // Product upgrade state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeStep, setUpgradeStep] = useState(1);
  const [selectedNewProduct, setSelectedNewProduct] = useState(null);
  const [upgradeCalculation, setUpgradeCalculation] = useState(null);
  const [products, setProducts] = useState([]);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // Loan application state
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanStep, setLoanStep] = useState(1);
  const [selectedLoanProduct, setSelectedLoanProduct] = useState(null);
  const [loanCalculation, setLoanCalculation] = useState(null);
  const [loanFormData, setLoanFormData] = useState({
    downPayment: 0,
    description: "",
  });
  
  // Loan detail state
  const [selectedLoanDetail, setSelectedLoanDetail] = useState(null);
  const [loanPaymentHistory, setLoanPaymentHistory] = useState([]);
  const [showLoanDetailModal, setShowLoanDetailModal] = useState(false);
  const [showPaymentProofModal, setShowPaymentProofModal] = useState(false);
  const [selectedPaymentProof, setSelectedPaymentProof] = useState(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    if (uuid) {
      fetchMemberDetail();
      fetchMemberSavings();
      fetchProducts();
      fetchLoanProducts();
    }
  }, [uuid]);

  useEffect(() => {
    if (member?._id) {
      fetchMemberLoans();
    }
  }, [member]);

  const fetchMemberDetail = async () => {
    try {
      const response = await api.get("/api/admin/members");
      if (response.data.success) {
        const foundMember = response.data.data.find(m => m.uuid === uuid);
        if (foundMember) {
          setMember(foundMember);
        } else {
          setError("Anggota tidak ditemukan");
        }
      }
    } catch (err) {
      setError("Gagal memuat data anggota");
      console.error("Member fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberSavings = async () => {
    try {
      // First, try to fetch savings filtered by memberId for better performance
      if (member?._id) {
        // Try member-specific endpoint with high limit
        const response = await api.get(`/api/admin/savings?memberId=${member._id}&limit=100`);
        if (response.data.success) {
          const savingsData = response.data.data?.savings || response.data.data || response.data.savings || [];
          let allSavings = [...savingsData];
          
          // Check if we need to fetch more pages
          const totalItems = response.data.data?.pagination?.totalItems || response.data.pagination?.totalItems;
          if (totalItems && totalItems > 100) {
            const totalPages = Math.ceil(totalItems / 100);
            
            // Fetch remaining pages in parallel for better performance
            const pagePromises = [];
            for (let page = 2; page <= totalPages; page++) {
              pagePromises.push(api.get(`/api/admin/savings?memberId=${member._id}&limit=100&page=${page}`));
            }
            
            const additionalResponses = await Promise.all(pagePromises);
            additionalResponses.forEach(resp => {
              if (resp.data.success) {
                const additionalData = resp.data.data?.savings || resp.data.data || resp.data.savings || [];
                allSavings.push(...additionalData);
              }
            });
          }
          
          setSavings(allSavings);
          console.log(`Total member savings fetched: ${allSavings.length}`);
          return;
        }
      }
      
      // Fallback: Fetch all and filter client-side
      const response = await api.get("/api/admin/savings?limit=100");
      if (response.data.success) {
        const savingsData = response.data.data?.savings || response.data.data || response.data.savings || [];
        const memberSavings = Array.isArray(savingsData) ? savingsData.filter(
          saving => saving.memberId?._id === member?._id || 
                   saving.memberId?.uuid === uuid ||
                   (typeof saving.memberId === 'string' && saving.memberId === member?._id)
        ) : [];
        
        // Check if there might be more pages to fetch
        const totalItems = response.data.data?.pagination?.totalItems || response.data.pagination?.totalItems;
        if (totalItems && totalItems > 100) {
          const totalPages = Math.ceil(totalItems / 100);
          
          for (let page = 2; page <= totalPages; page++) {
            const nextResponse = await api.get(`/api/admin/savings?limit=100&page=${page}`);
            if (nextResponse.data.success) {
              const nextData = nextResponse.data.data?.savings || nextResponse.data.data || nextResponse.data.savings || [];
              const nextMemberSavings = Array.isArray(nextData) ? nextData.filter(
                saving => saving.memberId?._id === member?._id || 
                         saving.memberId?.uuid === uuid ||
                         (typeof saving.memberId === 'string' && saving.memberId === member?._id)
              ) : [];
              
              if (nextMemberSavings.length > 0) {
                memberSavings.push(...nextMemberSavings);
              }
            }
          }
        }
        
        setSavings(memberSavings);
        console.log(`Total member savings fetched: ${memberSavings.length}`);
      }
    } catch (err) {
      console.error("Savings fetch error:", err);
      setSavings([]); // Set empty array on error
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get("/api/admin/products");
      if (response.data.success) {
        setProducts(response.data.data || []);
      }
    } catch (err) {
      console.error("Products fetch error:", err);
    }
  };

  const fetchMemberLoans = async () => {
    if (!member?._id) return;
    
    try {
      const response = await loanApi.getByMember(member._id);
      if (response.success) {
        setLoans(response.data || []);
      }
    } catch (err) {
      console.error("Loans fetch error:", err);
      setLoans([]);
    }
  };

  const fetchLoanProducts = async () => {
    try {
      const response = await api.get("/api/admin/loan-products");
      if (response.data.success) {
        setLoanProducts(response.data.data || []);
      }
    } catch (err) {
      console.error("Loan products fetch error:", err);
    }
  };

  const fetchLoanPaymentHistory = async (loanId) => {
    try {
      const response = await loanPaymentApi.getByLoan(loanId);
      if (response.success) {
        setLoanPaymentHistory(response.data.paymentSchedule || []);
        console.log("Payment history:", response.data);
      }
    } catch (err) {
      console.error("Loan payment history error:", err);
      setLoanPaymentHistory([]);
    }
  };

  const handleShowLoanDetail = async (loan) => {
    setSelectedLoanDetail(loan);
    await fetchLoanPaymentHistory(loan._id);
    setShowLoanDetailModal(true);
  };

  const handleLoanCalculation = async () => {
    if (!selectedLoanProduct || !member) return;
    
    try {
      const response = await loanApi.calculate({
        loanProductId: selectedLoanProduct._id,
        downPayment: loanFormData.downPayment || selectedLoanProduct.downPayment,
      });
      
      if (response.success) {
        setLoanCalculation(response.data);
        setLoanStep(2);
      }
    } catch (err) {
      console.error("Loan calculation error:", err);
      toast.error(err.response?.data?.message || "Gagal menghitung cicilan");
    }
  };

  const handleLoanApplication = async () => {
    if (!loanCalculation || !member || !selectedLoanProduct) return;
    
    try {
      const response = await loanApi.apply({
        memberId: member._id,
        loanProductId: selectedLoanProduct._id,
        downPayment: loanFormData.downPayment || selectedLoanProduct.downPayment,
        description: loanFormData.description,
      });
      
      if (response.success) {
        toast.success("Pengajuan pinjaman berhasil dibuat!");
        setShowLoanModal(false);
        setLoanStep(1);
        setSelectedLoanProduct(null);
        setLoanCalculation(null);
        setLoanFormData({ downPayment: 0, description: "" });
        fetchMemberLoans();
      }
    } catch (err) {
      console.error("Loan application error:", err);
      toast.error(err.response?.data?.message || "Gagal mengajukan pinjaman");
    }
  };

  const handleUpgradeCalculation = async () => {
    if (!selectedNewProduct || !member) return;
    
    setUpgradeLoading(true);
    try {
      const response = await api.post("/api/admin/product-upgrade/calculate", {
        memberId: member._id,
        newProductId: selectedNewProduct._id
      });
      
      if (response.data.success) {
        setUpgradeCalculation(response.data.data);
        setUpgradeStep(2);
        toast.info("📊 Kalkulasi upgrade berhasil dihitung");
      }
    } catch (err) {
      console.error("Upgrade calculation error:", err);
      toast.error(err.response?.data?.message || "Gagal menghitung kompensasi upgrade");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleUpgradeExecution = async () => {
    if (!upgradeCalculation) return;
    
    setUpgradeLoading(true);
    try {
      const response = await api.post("/api/admin/product-upgrade/execute", {
        memberId: member._id,
        newProductId: selectedNewProduct._id,
        calculationResult: upgradeCalculation
      });
      
      if (response.data.success) {
        toast.success("🎉 Upgrade produk berhasil dilakukan!");
        setShowUpgradeModal(false);
        setUpgradeStep(1);
        setSelectedNewProduct(null);
        setUpgradeCalculation(null);
        // Refresh member data
        fetchMemberDetail();
        fetchMemberSavings();
      }
    } catch (err) {
      console.error("Upgrade execution error:", err);
      toast.error(err.response?.data?.message || "Gagal melakukan upgrade produk");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleCloseUpgradeModal = () => {
    setShowUpgradeModal(false);
    setUpgradeStep(1);
    setSelectedNewProduct(null);
    setUpgradeCalculation(null);
  };

  // Re-fetch savings when member data is loaded
  useEffect(() => {
    if (member) {
      fetchMemberSavings();
    }
  }, [member]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Generate PDF Mutasi Simpanan
  const generateMutasiPDF = () => {
    if (!member || !savings) {
      toast.error("Data member atau simpanan tidak tersedia");
      return;
    }

    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    let yPos = 20;
    
    // Get current date for period
    const currentDate = new Date();
    const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", 
                       "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    const currentMonth = monthNames[currentDate.getMonth()];
    const currentYear = currentDate.getFullYear();
    
    // helper: ambil tanggal bayar (prioritas: latest payments[], lalu paymentDate, fallback savingsDate/createdAt)
    const getPaidDateRaw = (s) => {
      const dates = (s.payments || [])
        .map(p => p.paymentDate || p.date)
        .filter(Boolean)
        .sort((a, b) => new Date(a) - new Date(b));

      return dates.length
        ? dates[dates.length - 1]
        : (s.paymentDate || s.savingsDate || s.createdAt || null);
    };

    const getPeriodNum = (s) => {
      const p = s.installmentPeriod ?? s.installment_period ?? s.period;
      const n = Number(p);
      return Number.isFinite(n) ? n : null;
    };

    // Filter approved + SORT: period dulu (biar ga kebalik), lalu tanggal bayar
    const approvedSavings = [...(savings || [])]
      .filter(s => s.status === "Approved")
      .sort((a, b) => {
        const pa = getPeriodNum(a);
        const pb = getPeriodNum(b);

        // kalau dua-duanya punya periode, urutkan by periode
        if (pa != null && pb != null && pa !== pb) return pa - pb;

        // fallback urut by tanggal bayar
        const da = new Date(getPaidDateRaw(a) || 0);
        const db = new Date(getPaidDateRaw(b) || 0);
        return da - db;
      });

    // Calculate opening balance (assuming starts from 0)
    let saldo = 0;
    const saldoAwal = 0;

    // Prepare transaction data
    const transactions = approvedSavings.map(saving => {
      const amount = Number(saving.amount || 0);
      const isDebit = saving.type === "Penarikan";

      saldo += isDebit ? -amount : amount;

      const paidRaw = getPaidDateRaw(saving);
      const period = getPeriodNum(saving);

      const periodeStr = period ? ` - Periode ${period}` : "";

      return {
        date: paidRaw ? format(new Date(paidRaw), "dd/MM") : "-",
        description: `${(saving.type || "Setoran").toUpperCase()} - ${saving.description || "Simpanan Rutin"}${periodeStr}${saving.notes ? " - " + saving.notes : ""}`,
        type: saving.type,
        amount,
        isDebit,
        balance: saldo
      };
    });
    
    // Calculate totals
    const totalCredit = transactions.filter(t => !t.isDebit).reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = transactions.filter(t => t.isDebit).reduce((sum, t) => sum + t.amount, 0);
    const saldoAkhir = saldo;
    
    // Function to add header on each page
    const addHeader = (pageNum, totalPages) => {
      yPos = 20;
      
      // Title
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("REKENING SIMPANAN", 20, yPos);
      yPos += 8;
      
      // Member info with border
      const memberInfoStartY = yPos - 2;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(member.name.toUpperCase(), 22, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      const address = member.completeAddress && member.completeAddress.trim() !== '-' ? member.completeAddress : "ALAMAT TIDAK TERSEDIA";
      doc.text(address, 22, yPos);
      yPos += 5;
      const phoneNum = member.phone && member.phone.trim() !== '-' ? member.phone : "TELEPON TIDAK TERSEDIA";
      doc.text(phoneNum, 22, yPos);
      yPos += 5;
      doc.text("INDONESIA", 22, yPos);
      yPos += 5;
      
      // Draw border around member info
      doc.setLineWidth(0.8);
      doc.setDrawColor(0, 0, 0); // Black color
      doc.rect(20, memberInfoStartY - 3, 90, yPos - memberInfoStartY, 'S');
      
      // Account info on the right with border
      const accountInfoStartY = 25;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const accNum = member.accountNumber && member.accountNumber.trim() !== '-' ? member.accountNumber : "REKENING TIDAK TERSEDIA";
      doc.text(`NO. REKENING : ${accNum}`, pageWidth - 94, 28);
      doc.text(`HALAMAN : ${pageNum} / ${totalPages}`, pageWidth - 94, 33);
      doc.text(`PERIODE : ${currentMonth} ${currentYear}`, pageWidth - 94, 38);
      doc.text("MATA UANG : IDR", pageWidth - 94, 43);
      
      // Draw border around account info
      doc.setLineWidth(0.8);
      doc.rect(pageWidth - 96, accountInfoStartY - 2, 76, 22, 'S');
      
      yPos += 5;
      
      // Notes with 2 column layout and border
      const notesStartY = yPos;
      
      // Draw border first
      const notesHeight = 30; // Fixed height for notes section
      doc.setLineWidth(0.8);
      doc.setDrawColor(0, 0, 0);
      doc.rect(20, notesStartY, pageWidth - 40, notesHeight, 'S');
      
      // Add CATATAN header inside border
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("CATATAN:", 24, notesStartY + 6);
      
      // Calculate 50% width for each column
      const columnWidth = (pageWidth - 40) / 2; // Total width divided by 2
      const leftColumnX = 24; // Start position for left column
      const rightColumnX = 20 + columnWidth + 4; // Start position for right column (middle + padding)
      
      // Calculate available text width for each column (with padding)
      const textWidth = columnWidth - 8; // Leave some padding from edges
      
      // Left column note (50% width)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      
      // Left note as single string for better text wrapping
      const leftNoteText = "• Apabila anggota tidak melakukan sanggahan atas Laporan Mutasi Simpanan ini sampai dengan akhir bulan berikutnya, anggota dianggap telah menyetujui segala data yang tercantum pada Laporan Mutasi Simpanan ini.";
      
      // Use splitTextToSize for automatic text wrapping
      const leftLines = doc.splitTextToSize(leftNoteText, textWidth);
      
      let leftY = notesStartY + 11;
      leftLines.forEach(line => {
        doc.text(line, leftColumnX, leftY);
        leftY += 3.5;
      });
      
      // Right column note (50% width)
      const rightNoteText = "• Koperasi berhak setiap saat melakukan koreksi apabila ada kesalahan pada Laporan Mutasi Simpanan.";
      
      // Use splitTextToSize for automatic text wrapping
      const rightLines = doc.splitTextToSize(rightNoteText, textWidth);
      
      let rightY = notesStartY + 11;
      rightLines.forEach(line => {
        doc.text(line, rightColumnX, rightY);
        rightY += 3.5;
      });
      
      // Draw vertical line between columns
      doc.setLineWidth(0.3);
      doc.line(20 + columnWidth, notesStartY, 20 + columnWidth, notesStartY + notesHeight);
      
      // Update yPos after notes section
      yPos = notesStartY + notesHeight + 6;
      
      // Table header
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("TANGGAL", 20, yPos);
      doc.text("KETERANGAN", 40, yPos);
      doc.text("MUTASI", 120, yPos);
      doc.text("SALDO", 160, yPos);
      
      // Line under header
      doc.setLineWidth(0.5);
      doc.line(20, yPos + 2, pageWidth - 20, yPos + 2);
      yPos += 7;
    };
    
    // Calculate total pages needed (considering multi-line descriptions)
    const rowsPerPage = 22; // Reduced to accommodate multi-line descriptions
    // Estimate total rows including multi-line descriptions
    let estimatedRows = 2; // Opening + summary
    transactions.forEach(tx => {
      const lines = doc.splitTextToSize(tx.description, 75);
      estimatedRows += lines.length > 1 ? lines.length * 0.7 : 1;
    });
    const totalPages = Math.ceil(estimatedRows / rowsPerPage);
    
    // Start first page
    addHeader(1, totalPages);
    
    // Add opening balance
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(format(new Date(currentYear, currentDate.getMonth(), 1), "dd/MM"), 20, yPos);
    doc.text("SALDO AWAL", 40, yPos);
    doc.text(formatCurrency(saldoAwal).replace("Rp", "").trim(), 160, yPos, { align: "right" });
    yPos += 5;
    
    let currentPage = 1;
    let rowCount = 1;
    
    // Add transactions
    transactions.forEach((tx, index) => {
      // Check if need new page
      if (rowCount >= rowsPerPage) {
        // Add footer
        doc.setFontSize(8);
        doc.text(`Bersambung ke Halaman berikut`, pageWidth - 60, pageHeight - 15);
        
        // New page
        doc.addPage();
        currentPage++;
        addHeader(currentPage, totalPages);
        rowCount = 0;
      }
      
      // Add transaction row
      doc.setFontSize(9);
      doc.text(tx.date, 20, yPos);
      
      // Handle long description with word wrap
      let desc = tx.description;
      const maxWidth = 75; // Maximum width for description column
      
      // Split text into lines if too long
      const lines = doc.splitTextToSize(desc, maxWidth);
      
      // Print first line with other columns
      doc.text(lines[0], 40, yPos);
      
      // Amount with DB/CR indicator
      const amountStr = formatCurrency(tx.amount).replace("Rp", "").trim();
      if (tx.isDebit) {
        doc.text(amountStr + " DB", 120, yPos);
      } else {
        doc.text(amountStr + " CR", 120, yPos);
      }
      
      // Balance
      doc.text(formatCurrency(tx.balance).replace("Rp", "").trim(), 160, yPos, { align: "right" });
      
      // Print additional lines if description is multi-line
      if (lines.length > 1) {
        for (let i = 1; i < lines.length; i++) {
          yPos += 4;
          rowCount += 0.3; // Count partial rows for pagination
          
          // Check if need new page for additional lines
          if (rowCount >= rowsPerPage) {
            // Add footer
            doc.setFontSize(8);
            doc.text(`Bersambung ke Halaman berikut`, pageWidth - 60, pageHeight - 15);
            
            // New page
            doc.addPage();
            currentPage++;
            addHeader(currentPage, totalPages);
            rowCount = 0;
          }
          
          doc.setFontSize(9);
          doc.text(lines[i], 40, yPos);
        }
      }
      
      yPos += 5;
      rowCount++;
    });
    
    // Add summary at the end
    yPos += 5;
    doc.setLineWidth(0.5);
    doc.line(20, yPos, pageWidth - 20, yPos);
    yPos += 7;
    
    doc.setFont("helvetica", "bold");
    doc.text("SALDO AWAL :", 20, yPos);
    doc.text(formatCurrency(saldoAwal).replace("Rp", "").trim(), 80, yPos, { align: "right" });
    yPos += 5;
    
    doc.text("MUTASI CR :", 20, yPos);
    doc.text(formatCurrency(totalCredit).replace("Rp", "").trim(), 80, yPos, { align: "right" });
    doc.text(transactions.filter(t => !t.isDebit).length.toString(), 95, yPos);
    yPos += 5;
    
    doc.text("MUTASI DB :", 20, yPos);
    doc.text(formatCurrency(totalDebit).replace("Rp", "").trim(), 80, yPos, { align: "right" });
    doc.text(transactions.filter(t => t.isDebit).length.toString(), 95, yPos);
    yPos += 5;
    
    doc.text("SALDO AKHIR :", 20, yPos);
    doc.text(formatCurrency(saldoAkhir).replace("Rp", "").trim(), 80, yPos, { align: "right" });
    
    // Footer on last page
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("KOPERASI", pageWidth - 40, pageHeight - 15);
    
    // Save the PDF
    const fileName = `Mutasi_Simpanan_${member.uuid}_${currentMonth}_${currentYear}.pdf`;
    doc.save(fileName);
    
    toast.success("PDF Mutasi Simpanan berhasil diunduh");
  };

  const getStatusBadge = (status) => {
    const badges = {
      Pending: "bg-yellow-100 text-yellow-800",
      Approved: "bg-green-100 text-green-800",
      Rejected: "bg-red-100 text-red-800",
    };
    return badges[status] || "bg-gray-100 text-gray-800";
  };

  const getMemberName = (memberId) => {
    if (!memberId) return "Unknown";
    if (typeof memberId === "object" && memberId.name) {
      return memberId.name;
    }
    return member?.name || "Unknown";
  };

  const getProductName = (productId) => {
    if (!productId) return "Unknown";
    if (typeof productId === "object" && productId.title) {
      return productId.title;
    }
    return member?.product?.title || "Unknown";
  };

  // Pagination logic for savings
  const totalSavingsPages = Math.ceil(savings.length / itemsPerPage);
  const startSavingsIndex = (currentSavingsPage - 1) * itemsPerPage;
  const currentSavings = savings.slice(startSavingsIndex, startSavingsIndex + itemsPerPage);

  const handleSavingsPageChange = (page) => {
    setCurrentSavingsPage(page);
  };

  const handlePeriodPageChange = (page) => {
    setCurrentPeriodPage(page);
  };

  // Calculate totals
  const totalSetoran = savings
    .filter(s => s.type === "Setoran" && s.status === "Approved")
    .reduce((sum, s) => sum + s.amount, 0);
  
  const totalPenarikan = savings
    .filter(s => s.type === "Penarikan" && s.status === "Approved")
    .reduce((sum, s) => sum + s.amount, 0);

  const saldoSimpanan = totalSetoran - totalPenarikan;

  // Generate period status table
  const generatePeriodStatus = () => {
    if (!member?.product) return [];
    
    // Get total periods from product's termDuration (correct field name)
    let totalPeriods = member.product.termDuration;
    
    // If no termDuration defined in product, try to determine from existing savings data
    if (!totalPeriods && savings.length > 0) {
      const maxPeriod = Math.max(...savings.map(s => s.installmentPeriod || 1));
      totalPeriods = Math.max(maxPeriod, 12); // At least 12 periods
    }
    
    // Default to 36 if still no periods determined
    totalPeriods = totalPeriods || 36;
    const periodStatus = [];
    
    // Get upgrade info if exists
    const upgradeInfo = member.upgradeInfo || member.currentUpgradeId;
    const hasUpgraded = member.hasUpgraded;
    
    // Get savings start date (use savingsStartDate if set, otherwise use member createdAt)
    const startDate = member.savingsStartDate 
      ? new Date(member.savingsStartDate) 
      : new Date(member.createdAt);
    
    // Debug log upgrade info
    console.log('=== UPGRADE DEBUG ===');
    console.log('hasUpgraded:', hasUpgraded);
    console.log('upgradeInfo:', upgradeInfo);
    console.log('member.currentUpgradeId:', member.currentUpgradeId);
    console.log('member.upgradeInfo:', member.upgradeInfo);
    console.log('currentProductDeposit:', member.product.depositAmount);
    console.log('savingsStartDate:', startDate);
    if (upgradeInfo) {
      console.log('completedPeriodsAtUpgrade:', upgradeInfo.completedPeriodsAtUpgrade);
      console.log('oldMonthlyDeposit:', upgradeInfo.oldMonthlyDeposit);
      console.log('newMonthlyDeposit:', upgradeInfo.newMonthlyDeposit);
      console.log('newPaymentWithCompensation:', upgradeInfo.newPaymentWithCompensation);
    }
    
    for (let period = 1; period <= totalPeriods; period++) {
      // Find all transactions for this period
      const periodTransactions = savings.filter(s => s.installmentPeriod === period);
      
      let status = 'belum_bayar';
      let totalPaid = 0;
      
      // Calculate total approved amount for this period FIRST
      const approvedTransactions = periodTransactions.filter(t => t.status === 'Approved');
      totalPaid = approvedTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      // Calculate required amount based on upgrade status
      let requiredAmount = member.product.depositAmount || 0;
      
      // If member has upgraded, adjust required amount based on period
      if (hasUpgraded && upgradeInfo) {
        const completedAtUpgrade = upgradeInfo.completedPeriodsAtUpgrade ?? 0;
        const oldDeposit = upgradeInfo.oldMonthlyDeposit ?? 0;
        const newPayment = upgradeInfo.newPaymentWithCompensation ?? 0;
        
        // Debug for first few periods
        if (period <= 5) {
          console.log(`Period ${period}: completedAtUpgrade=${completedAtUpgrade}, oldDeposit=${oldDeposit}, newPayment=${newPayment}`);
        }
        
        // IMPORTANT: Check if period is within completed periods at upgrade
        // completedAtUpgrade could be 0 if no periods were completed before upgrade
        if (completedAtUpgrade > 0 && period <= completedAtUpgrade && oldDeposit > 0) {
          // Periods completed BEFORE upgrade use OLD amount
          requiredAmount = oldDeposit;
        } else if (newPayment > 0) {
          // Periods AFTER upgrade (or all periods if completedAtUpgrade is 0) use new amount + compensation
          requiredAmount = newPayment;
        }
        
        if (period <= 5) {
          console.log(`Period ${period}: requiredAmount set to ${requiredAmount}`);
        }
      }
      
      // Calculate the month for this period
      // Period 1 = startDate month, Period 2 = startDate + 1 month, etc.
      const periodDate = new Date(startDate.getFullYear(), startDate.getMonth() + (period - 1), 1);
      const monthName = periodDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      
      // SMART STATUS DETECTION for upgraded members
      // If period was completed before upgrade, check against OLD target
      let transactions = [];
      
      if (periodTransactions.length > 0) {
        // Sort by date, newest first
        const sortedTransactions = periodTransactions.sort((a, b) => new Date(b.savingsDate) - new Date(a.savingsDate));
        
        transactions = sortedTransactions.map(tx => ({
          ...tx,
          rejectionReason: tx.rejectionReason || null
        }));
        
        // Check latest transaction status
        const latestTransaction = sortedTransactions[0];
        
        if (latestTransaction.status === 'Rejected') {
          status = 'rejected';
        } else if (latestTransaction.status === 'Pending') {
          status = 'pending';
        } else if (totalPaid >= requiredAmount) {
          status = 'paid';
        } else if (totalPaid > 0) {
          status = 'partial';
        }
      }
      
      periodStatus.push({
        period,
        monthName, // Added month name
        status,
        totalPaid,
        requiredAmount,
        remainingAmount: Math.max(0, requiredAmount - totalPaid),
        transactions,
        percentage: requiredAmount > 0 ? Math.min((totalPaid / requiredAmount) * 100, 100) : 0
      });
    }
    
    return periodStatus;
  };

  const periodStatusData = generatePeriodStatus();

  // Pagination for period status (moved after periodStatusData is defined)
  const totalPeriodPages = Math.ceil(periodStatusData.length / itemsPerPage);
  const startPeriodIndex = (currentPeriodPage - 1) * itemsPerPage;
  const currentPeriodData = periodStatusData.slice(startPeriodIndex, startPeriodIndex + itemsPerPage);

  const getStatusInfo = (status) => {
    const statusMap = {
      'paid': { label: 'Lunas', class: 'bg-green-100 text-green-800', icon: '✅' },
      'partial': { label: 'Sebagian', class: 'bg-yellow-100 text-yellow-800', icon: '⚠️' },
      'pending': { label: 'Pending', class: 'bg-blue-100 text-blue-800', icon: '⏳' },
      'rejected': { label: 'Ditolak', class: 'bg-red-100 text-red-800', icon: '❌' },
      'belum_bayar': { label: 'Belum Bayar', class: 'bg-gray-100 text-gray-600', icon: '⭕' }
    };
    return statusMap[status] || statusMap['belum_bayar'];
  };

  // Handle proof image modal
  const handleShowProof = (transaction) => {
    if (transaction.proofFile) {
      setCurrentProofImage(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/uploads/simpanan/${transaction.proofFile}`);
      setCurrentTransactionInfo({
        amount: transaction.amount,
        date: transaction.savingsDate,
        status: transaction.status,
        description: transaction.description,
        rejectionReason: transaction.rejectionReason
      });
      setShowProofModal(true);
    }
  };

  const closeProofModal = () => {
    setShowProofModal(false);
    setCurrentProofImage(null);
    setCurrentTransactionInfo(null);
  };

  const getPaidDateRaw = (tx) => {
    // dukung beberapa kemungkinan struktur
    const dates = (tx?.payments || [])
      .map(p => p?.paymentDate || p?.date)
      .filter(Boolean)
      .sort((a, b) => new Date(a) - new Date(b));

    return dates.length ? dates[dates.length - 1] : (tx?.paymentDate || null);
  };

  const formatDateSafe = (d, fmt = "dd/MM/yyyy") => {
    if (!d) return "-";
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return "-";
    return format(dt, fmt, { locale: id });
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-32 sm:w-32 border-b-2 border-pink-600 mx-auto"></div>
          <p className="mt-4 text-sm sm:text-base text-gray-600">🌸 Memuat detail anggota...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="text-red-600 text-4xl sm:text-6xl mb-4">⚠️</div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-sm sm:text-base text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate("/master/anggota")}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700"
          >
            Kembali ke Daftar Anggota
          </button>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <div className="text-gray-400 text-4xl sm:text-6xl mb-4">👤</div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Anggota Tidak Ditemukan</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-4">Anggota dengan UUID "{uuid}" tidak ditemukan</p>
          <button
            onClick={() => navigate("/master/anggota")}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700"
          >
            Kembali ke Daftar Anggota
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate("/master/anggota")}
            className="text-pink-600 hover:text-pink-800 flex items-center"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Kembali
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            🌸 Detail Anggota
          </h1>
          {member.isCompleted && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
              ✅ LUNAS
            </span>
          )}
        </div>
        
        {/* Button Tandai Lunas */}
        <div className="flex space-x-2">
          {!member.isCompleted ? (
            <button
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: "Tandai Lunas",
                  message: "Apakah Anda yakin ingin menandai member ini sebagai LUNAS?\n\nIni menandakan uang tabungan sudah di-transfer ke student.",
                  type: "success",
                  onConfirm: async () => {
                    setConfirmLoading(true);
                    try {
                      const response = await api.patch(`/api/admin/members/${member.uuid}/complete`);
                      if (response.data.success) {
                        toast.success("✅ Member berhasil ditandai sebagai LUNAS!");
                        fetchMemberDetail();
                      }
                    } catch (err) {
                      toast.error(err.response?.data?.message || "Gagal menandai lunas");
                    } finally {
                      setConfirmLoading(false);
                      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    }
                  },
                });
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm"
            >
              ✅ Tandai Lunas
            </button>
          ) : (
            <button
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: "Batalkan Status Lunas",
                  message: "Apakah Anda yakin ingin membatalkan status lunas member ini?",
                  type: "warning",
                  onConfirm: async () => {
                    setConfirmLoading(true);
                    try {
                      const response = await api.patch(`/api/admin/members/${member.uuid}/uncomplete`);
                      if (response.data.success) {
                        toast.success("↩️ Status lunas berhasil dibatalkan");
                        fetchMemberDetail();
                      }
                    } catch (err) {
                      toast.error(err.response?.data?.message || "Gagal membatalkan status lunas");
                    } finally {
                      setConfirmLoading(false);
                      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    }
                  },
                });
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold text-sm"
            >
              ↩️ Batalkan Lunas
            </button>
          )}
        </div>
      </div>

      {/* Member Info Card */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-pink-100">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Informasi Dasar</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">UUID</label>
                <p className="text-sm text-gray-900 font-mono">{member.uuid}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Nama</label>
                <p className="text-sm text-gray-900 font-semibold">{member.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Username</label>
                <p className="text-sm text-gray-900">{member.user?.username}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Gender</label>
                <p className="text-sm text-gray-900">
                  <span className={`px-2 py-1 rounded-full text-xs ${member.gender === 'L' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}`}>
                    {member.gender === 'L' ? '👨 Laki-laki' : '👩 Perempuan'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Kontak & Alamat</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Telepon</label>
                <p className="text-sm text-gray-900">{member.phone || "-"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Kota</label>
                <p className="text-sm text-gray-900">{member.city || "-"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Alamat Lengkap</label>
                <p className="text-sm text-gray-900">{member.completeAddress || "-"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">No Rekening</label>
                <p className="text-sm text-gray-900 font-mono">{member.accountNumber || "-"}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Produk & Saldo</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Produk Simpanan</label>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900">
                    {member.product ? (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                        🌸 {member.product.title}
                      </span>
                    ) : (
                      <span className="text-gray-400">Belum memilih produk</span>
                    )}
                  </p>
                  {member.product && (
                    <div className="flex items-center space-x-2">
                      {member.hasUpgraded ? (
                        <div className="relative group">
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs cursor-help">
                            ✨ Sudah Upgrade
                          </span>
                          
                          {/* Upgrade History Tooltip Card */}
                          {member.currentUpgradeId && (
                            <div className="absolute right-0 top-6 w-96 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                              <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-300 shadow-xl">
                                <div className="flex items-start space-x-2 mb-3">
                                  <span className="text-2xl">🎯</span>
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-blue-900 mb-2">Riwayat Upgrade Produk</h4>
                                    
                                    {/* Previous Product */}
                                    <div className="mb-3">
                                      <p className="text-xs text-gray-600 mb-1">Produk Sebelumnya:</p>
                                      <div className="flex items-center space-x-2">
                                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                                          📦 {member.currentUpgradeId.oldProductId?.title || 'Produk Lama'}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                          (Rp {(member.currentUpgradeId.oldMonthlyDeposit || 0).toLocaleString('id-ID')}/bulan)
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* Current Product */}
                                    <div className="mb-3">
                                      <p className="text-xs text-gray-600 mb-1">Produk Saat Ini:</p>
                                      <div className="flex items-center space-x-2">
                                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                                          ✨ {member.currentUpgradeId.newProductId?.title || member.product.title}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                          (Rp {(member.currentUpgradeId.newMonthlyDeposit || 0).toLocaleString('id-ID')}/bulan)
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* Upgrade Details */}
                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-200">
                                      <div>
                                        <p className="text-xs text-gray-600">Tanggal Upgrade:</p>
                                        <p className="text-xs font-semibold text-gray-800">
                                          {member.currentUpgradeId.upgradeDate ? 
                                            new Date(member.currentUpgradeId.upgradeDate).toLocaleDateString('id-ID', {
                                              day: 'numeric',
                                              month: 'short',
                                              year: 'numeric'
                                            }) : 
                                            'N/A'
                                          }
                                        </p>
                                      </div>
                                      
                                      <div>
                                        <p className="text-xs text-gray-600">Periode Selesai:</p>
                                        <p className="text-xs font-semibold text-gray-800">
                                          {member.currentUpgradeId.completedPeriodsAtUpgrade || 0} periode
                                        </p>
                                      </div>
                                      
                                      <div>
                                        <p className="text-xs text-gray-600">Kompensasi/Bulan:</p>
                                        <p className="text-xs font-semibold text-purple-700">
                                          Rp {(member.currentUpgradeId.compensationPerMonth || 0).toLocaleString('id-ID')}
                                        </p>
                                      </div>
                                      
                                      <div>
                                        <p className="text-xs text-gray-600">Total Bayar/Bulan:</p>
                                        <p className="text-xs font-semibold text-green-700">
                                          Rp {(member.currentUpgradeId.newPaymentWithCompensation || 0).toLocaleString('id-ID')}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* Info Badge */}
                                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                      <p className="text-xs text-yellow-800">
                                        💡 <strong>Info:</strong> Kompensasi akan dibayarkan hingga periode ke-{member.product?.termDuration || 36} sebagai penyesuaian dari upgrade produk.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowUpgradeModal(true)}
                          className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600"
                        >
                          🚀 Upgrade Produk
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {member.hasUpgraded && member.upgradeInfo && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <p className="text-xs font-semibold text-blue-800 mb-1">Detail Upgrade:</p>
                  <div className="space-y-1 text-xs text-blue-700">
                    <p>Produk Lama: {member.upgradeInfo.oldProductId?.title} ({formatCurrency(member.upgradeInfo.oldMonthlyDeposit)}/bulan)</p>
                    <p>Produk Baru: {member.upgradeInfo.newProductId?.title} ({formatCurrency(member.upgradeInfo.newMonthlyDeposit)}/bulan)</p>
                    <p>Periode Lunas Saat Upgrade: {member.upgradeInfo.completedPeriodsAtUpgrade} periode</p>
                    <p>Kompensasi/Bulan: {formatCurrency(member.upgradeInfo.compensationPerMonth)}</p>
                    <p className="font-semibold">Total Setoran Baru: {formatCurrency(member.upgradeInfo.newPaymentWithCompensation)}/bulan</p>
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-500">Total Saldo Simpanan</label>
                <p className="text-lg font-bold text-green-600">{formatCurrency(saldoSimpanan)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-gray-500">Total Setoran</label>
                  <p className="font-semibold text-green-600">{formatCurrency(totalSetoran)}</p>
                </div>
                <div>
                  <label className="text-gray-500">Total Penarikan</label>
                  <p className="font-semibold text-red-600">{formatCurrency(totalPenarikan)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-pink-100">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("simpanan")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "simpanan"
                  ? "border-pink-500 text-pink-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              💰 Simpanan ({savings.length})
            </button>
            <button
              onClick={() => setActiveTab("pinjaman")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "pinjaman"
                  ? "border-pink-500 text-pink-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              🏦 Pinjaman ({loans.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "simpanan" && (
            <div>
              {/* Header with Print Button */}
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Ringkasan Proyeksi & Realisasi</h3>
                <button
                  onClick={() => generateMutasiPDF()}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Mutasi Simpanan
                </button>
              </div>
              
              {/* Projection Cards */}
              <div className="mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Proyeksi Card */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-blue-800">📊 Proyeksi Total</h4>
                      <div className="text-blue-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-blue-700 mb-2">
                      {member?.product ? formatCurrency((member.product.depositAmount || 0) * periodStatusData.length) : 'Rp 0'}
                    </div>
                    <div className="text-sm text-blue-600">
                      {member?.product ? `${formatCurrency(member.product.depositAmount)} × ${periodStatusData.length} periode` : 'Belum ada produk'}
                    </div>
                  </div>

                  {/* Realisasi Card */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-green-800">💰 Realisasi (Approved)</h4>
                      <div className="text-green-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-green-700 mb-2">
                      {formatCurrency(totalSetoran)}
                    </div>
                    <div className="text-sm text-green-600">
                      {periodStatusData.filter(p => p.status === 'paid').length} periode lunas
                    </div>
                  </div>

                  {/* Progress Card */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-purple-800">📈 Progress</h4>
                      <div className="text-purple-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-purple-700 mb-2">
                      {member?.product ? 
                        `${(((totalSetoran) / ((member.product.depositAmount || 1) * periodStatusData.length)) * 100).toFixed(1)}%`
                        : '0%'
                      }
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-2 mb-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                        style={{ 
                          width: member?.product ? 
                            `${Math.min(((totalSetoran) / ((member.product.depositAmount || 1) * periodStatusData.length)) * 100, 100)}%`
                            : '0%'
                        }}
                      ></div>
                    </div>
                    <div className="text-sm text-purple-600">
                      Dari target keseluruhan
                    </div>
                  </div>
                </div>
              </div>

              {/* Period Status Overview */}
              {member?.product && periodStatusData.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Periode Pembayaran</h3>
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center text-sm">
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          {periodStatusData.filter(p => p.status === 'paid').length}
                        </div>
                        <div className="text-gray-600">Lunas</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-yellow-600">
                          {periodStatusData.filter(p => p.status === 'partial').length}
                        </div>
                        <div className="text-gray-600">Sebagian</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-600">
                          {periodStatusData.filter(p => p.status === 'pending').length}
                        </div>
                        <div className="text-gray-600">Pending</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-600">
                          {(() => {
                            // Count periods that have ANY rejected transactions
                            const rejectedCount = periodStatusData.filter(p => {
                              if (p.transactions.length === 0) return false;
                              
                              // Check if ANY transaction in this period is rejected
                              const hasRejected = p.transactions.some(tx => tx.status === 'Rejected');
                              
                              return hasRejected;
                            });
                            
                            return rejectedCount.length;
                          })()}
                        </div>
                        <div className="text-gray-600">Ditolak</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-gray-600">
                          {periodStatusData.filter(p => p.status === 'belum_bayar').length}
                        </div>
                        <div className="text-gray-600">Belum Bayar</div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-pink-50 to-rose-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Periode
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Bulan
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Tanggal Upload
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Tanggal Bayar
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Dibayar
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Target
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Sisa
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Progress
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-pink-700 uppercase tracking-wider">
                            Transaksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {currentPeriodData.map((period) => {
                          const statusInfo = getStatusInfo(period.status);
                          return (
                            <tr key={period.period} className="hover:bg-pink-50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                Periode {period.period}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                                  📅 {period.monthName}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {(() => {
                                  if (period.transactions.length === 0) return "-";
                                  const latestTx = [...period.transactions].sort(
                                    (a, b) => new Date(b.savingsDate) - new Date(a.savingsDate)
                                  )[0];
                                  return formatDateSafe(latestTx.savingsDate, "dd/MM/yyyy");
                                })()}
                              </td>

                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {(() => {
                                  if (period.transactions.length === 0) return "-";
                                  const latestTx = [...period.transactions].sort(
                                    (a, b) => new Date((getPaidDateRaw(b) || b.savingsDate)) - new Date((getPaidDateRaw(a) || a.savingsDate))
                                  )[0];
                                  return formatDateSafe(getPaidDateRaw(latestTx), "dd/MM/yyyy");
                                })()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.class}`}>
                                  {statusInfo.icon} {statusInfo.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                <span className={period.totalPaid > 0 ? 'font-semibold text-green-600' : 'text-gray-400'}>
                                  {formatCurrency(period.totalPaid)}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {formatCurrency(period.requiredAmount)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                <span className={period.remainingAmount > 0 ? 'font-semibold text-red-600' : 'text-gray-400'}>
                                  {formatCurrency(period.remainingAmount)}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                <div className="flex items-center">
                                  <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                                    <div 
                                      className={`h-2 rounded-full ${
                                        period.percentage >= 100 ? 'bg-green-500' : 
                                        period.percentage > 0 ? 'bg-yellow-500' : 'bg-gray-300'
                                      }`}
                                      style={{ width: `${Math.min(period.percentage, 100)}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs text-gray-600 w-12">
                                    {period.percentage.toFixed(0)}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {period.transactions.length > 0 ? (
                                  <div className="space-y-1">
                                    {period.transactions.map((tx, idx) => (
                                      <div key={idx} className="text-xs mb-2 p-2 bg-gray-50 rounded border">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center space-x-2">
                                            <button
                                              onClick={tx.proofFile ? () => handleShowProof(tx) : undefined}
                                              className={`inline-flex items-center px-1 py-0.5 rounded text-white text-xs ${
                                                tx.status === 'Approved' ? 'bg-green-500' :
                                                tx.status === 'Pending' ? 'bg-yellow-500' :
                                                'bg-red-500'
                                              } ${tx.proofFile ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                                              title={tx.proofFile ? 'Klik untuk lihat bukti pembayaran' : tx.status}
                                            >
                                              {tx.status}
                                              {tx.proofFile && (
                                                <span className="ml-1">📷</span>
                                              )}
                                            </button>
                                            <span className="font-semibold">{formatCurrency(tx.amount)}</span>
                                          </div>
                                          <div className="flex items-center space-x-1">
                                            <span className="text-gray-500 text-xs">
                                              {format(new Date(tx.savingsDate), "dd/MM", { locale: id })}
                                            </span>
                                          </div>
                                        </div>
                                        {tx.status === 'Rejected' && tx.rejectionReason && (
                                          <div className="text-red-600 text-xs italic mt-1">
                                            💬 "{tx.rejectionReason}"
                                          </div>
                                        )}
                                        {tx.description && (
                                          <div className="text-gray-600 text-xs mt-1 truncate" title={tx.description}>
                                            📝 {tx.description}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination for Period Status */}
                  {totalPeriodPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={currentPeriodPage}
                        totalPages={totalPeriodPages}
                        onPageChange={handlePeriodPageChange}
                        itemsPerPage={itemsPerPage}
                        totalItems={periodStatusData.length}
                      />
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {activeTab === "pinjaman" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Riwayat Pinjaman</h3>
                <button
                  onClick={() => setShowLoanModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Ajukan Pinjaman
                </button>
              </div>

              {loans.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <div className="text-6xl mb-4">💳</div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">Belum Ada Pinjaman</h4>
                  <p className="text-gray-500 mb-4">Member ini belum memiliki pinjaman aktif</p>
                  <button
                    onClick={() => setShowLoanModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Ajukan Pinjaman Sekarang
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Produk
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Total Pinjaman
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Cicilan/Bulan
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Progress
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Sisa Pinjaman
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Jatuh Tempo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {loans.map((loan) => (
                        <tr key={loan._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleShowLoanDetail(loan)}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {loan.loanProductId?.title || "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(loan.loanAmount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(loan.monthlyInstallment)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center">
                              <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                                <div 
                                  className={`h-2 rounded-full ${
                                    loan.status === "Completed" ? 'bg-green-500' : 
                                    loan.paidPeriods > 0 ? 'bg-blue-500' : 'bg-gray-300'
                                  }`}
                                  style={{ width: `${(loan.paidPeriods / loan.totalPeriods) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-600 w-20">
                                {loan.paidPeriods}/{loan.totalPeriods} bulan
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                            <span className={loan.outstandingAmount > 0 ? 'text-orange-600' : 'text-green-600'}>
                              {formatCurrency(loan.outstandingAmount || 0)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              loan.status === 'Active' ? 'bg-green-100 text-green-800' :
                              loan.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                              loan.status === 'Completed' ? 'bg-blue-100 text-blue-800' :
                              loan.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                              loan.status === 'Overdue' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {loan.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {loan.nextDueDate ? 
                              format(new Date(loan.nextDueDate), "dd MMM yyyy", { locale: id }) : 
                              "-"
                            }
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShowLoanDetail(loan);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Product Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <h2 className="text-xl font-bold text-gray-800">🚀 Upgrade Produk Simpanan</h2>
              <button
                onClick={handleCloseUpgradeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {upgradeStep === 1 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Pilih Produk Baru</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Produk saat ini: <span className="font-semibold">{member.product?.title}</span> 
                    ({formatCurrency(member.product?.depositAmount)}/bulan)
                  </p>
                  
                  <div className="space-y-3">
                    {products
                      .filter(p => p.depositAmount > (member.product?.depositAmount || 0))
                      .map(product => (
                        <div
                          key={product._id}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            selectedNewProduct?._id === product._id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300'
                          }`}
                          onClick={() => setSelectedNewProduct(product)}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="font-semibold">{product.title}</h4>
                              <p className="text-sm text-gray-600">
                                Setoran: {formatCurrency(product.depositAmount)}/bulan
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Durasi: {product.termDuration} bulan</p>
                              <p className="text-sm text-gray-500">Return: {product.returnProfit}%</p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                  
                  {products.filter(p => p.depositAmount > (member.product?.depositAmount || 0)).length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      Tidak ada produk dengan setoran lebih tinggi yang tersedia
                    </p>
                  )}
                </div>
              )}

              {upgradeStep === 2 && upgradeCalculation && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Review Kalkulasi Upgrade</h3>
                  
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Produk Lama:</p>
                        <p className="font-semibold">{upgradeCalculation.oldProductTitle}</p>
                        <p className="text-sm">{formatCurrency(upgradeCalculation.oldMonthlyDeposit)}/bulan</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Produk Baru:</p>
                        <p className="font-semibold">{upgradeCalculation.newProductTitle}</p>
                        <p className="text-sm">{formatCurrency(upgradeCalculation.newMonthlyDeposit)}/bulan</p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-3">
                      <p className="text-sm text-gray-600">Periode yang sudah lunas:</p>
                      <p className="font-semibold">{upgradeCalculation.completedPeriodsAtUpgrade} dari {upgradeCalculation.totalPeriods} periode</p>
                    </div>
                    
                    <div className="border-t pt-3">
                      <p className="text-sm text-gray-600">Sisa periode:</p>
                      <p className="font-semibold">{upgradeCalculation.remainingPeriods} periode</p>
                    </div>
                    
                    {/* DETAIL PERHITUNGAN KOMPENSASI - untuk Finance */}
                    <div className="border-t pt-3">
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                          📊 Detail Perhitungan Kompensasi
                        </p>
                        
                        {upgradeCalculation.compensationPerMonth > 0 ? (
                          <div className="space-y-4 text-sm">
                            {/* Step 1: Selisih Setoran */}
                            <div className="bg-gray-50 p-3 rounded border-l-4 border-blue-400">
                              <p className="font-semibold text-gray-700 mb-1">1️⃣ Selisih Setoran per Bulan</p>
                              <div className="font-mono text-xs bg-white p-2 rounded">
                                <p>Setoran Baru - Setoran Lama</p>
                                <p className="text-blue-600">
                                  = {formatCurrency(upgradeCalculation.newMonthlyDeposit)} - {formatCurrency(upgradeCalculation.oldMonthlyDeposit)}
                                </p>
                                <p className="font-bold text-green-600">
                                  = {formatCurrency(upgradeCalculation.newMonthlyDeposit - upgradeCalculation.oldMonthlyDeposit)}
                                </p>
                              </div>
                            </div>
                            
                            {/* Step 2: Total Kekurangan */}
                            <div className="bg-gray-50 p-3 rounded border-l-4 border-orange-400">
                              <p className="font-semibold text-gray-700 mb-1">2️⃣ Total Kekurangan dari Periode Lama</p>
                              <div className="font-mono text-xs bg-white p-2 rounded">
                                <p>Selisih × Periode Lunas</p>
                                <p className="text-blue-600">
                                  = {formatCurrency(upgradeCalculation.newMonthlyDeposit - upgradeCalculation.oldMonthlyDeposit)} × {upgradeCalculation.completedPeriodsAtUpgrade}
                                </p>
                                <p className="font-bold text-green-600">
                                  = {formatCurrency((upgradeCalculation.newMonthlyDeposit - upgradeCalculation.oldMonthlyDeposit) * upgradeCalculation.completedPeriodsAtUpgrade)}
                                </p>
                              </div>
                            </div>
                            
                            {/* Step 3: Kompensasi per Bulan */}
                            <div className="bg-gray-50 p-3 rounded border-l-4 border-purple-400">
                              <p className="font-semibold text-gray-700 mb-1">3️⃣ Kompensasi per Bulan</p>
                              <div className="font-mono text-xs bg-white p-2 rounded">
                                <p>Total Kekurangan ÷ Sisa Periode</p>
                                <p className="text-blue-600">
                                  = {formatCurrency((upgradeCalculation.newMonthlyDeposit - upgradeCalculation.oldMonthlyDeposit) * upgradeCalculation.completedPeriodsAtUpgrade)} ÷ {upgradeCalculation.remainingPeriods}
                                </p>
                                <p className="font-bold text-green-600">
                                  = {formatCurrency(upgradeCalculation.compensationPerMonth)}
                                </p>
                              </div>
                            </div>
                            
                            {/* Step 4: Total Pembayaran Baru */}
                            <div className="bg-green-50 p-3 rounded border-l-4 border-green-500">
                              <p className="font-semibold text-gray-700 mb-1">4️⃣ Total Pembayaran Baru per Bulan</p>
                              <div className="font-mono text-xs bg-white p-2 rounded">
                                <p>Setoran Baru + Kompensasi</p>
                                <p className="text-blue-600">
                                  = {formatCurrency(upgradeCalculation.newMonthlyDeposit)} + {formatCurrency(upgradeCalculation.compensationPerMonth)}
                                </p>
                                <p className="font-bold text-green-700 text-base">
                                  = {formatCurrency(upgradeCalculation.newPaymentWithCompensation)}
                                </p>
                              </div>
                            </div>
                            
                            {/* Summary Box */}
                            <div className="bg-blue-100 p-3 rounded-lg mt-3">
                              <p className="text-xs text-blue-800">
                                <strong>📝 Ringkasan:</strong> Anggota sudah bayar {upgradeCalculation.completedPeriodsAtUpgrade} periode dengan setoran {formatCurrency(upgradeCalculation.oldMonthlyDeposit)}/bulan. 
                                Karena upgrade ke produk dengan setoran {formatCurrency(upgradeCalculation.newMonthlyDeposit)}/bulan, 
                                ada kekurangan {formatCurrency((upgradeCalculation.newMonthlyDeposit - upgradeCalculation.oldMonthlyDeposit) * upgradeCalculation.completedPeriodsAtUpgrade)} yang harus dicicil 
                                selama {upgradeCalculation.remainingPeriods} periode sisa.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 text-sm">
                            <div className="bg-orange-50 p-3 rounded border-l-4 border-orange-400">
                              <p className="font-semibold text-orange-800 mb-2">⚠️ Tidak Ada Kompensasi</p>
                              <div className="font-mono text-xs bg-white p-2 rounded">
                                <p>Setoran Lama: {formatCurrency(upgradeCalculation.oldMonthlyDeposit)}</p>
                                <p>Setoran Baru: {formatCurrency(upgradeCalculation.newMonthlyDeposit)}</p>
                                <p className="mt-2 text-orange-700">
                                  {upgradeCalculation.oldMonthlyDeposit >= upgradeCalculation.newMonthlyDeposit 
                                    ? "Produk baru memiliki setoran lebih kecil/sama, tidak perlu kompensasi."
                                    : upgradeCalculation.completedPeriodsAtUpgrade === 0
                                      ? "Belum ada periode yang lunas, tidak ada kekurangan yang perlu dikompensasi."
                                      : "Tidak ada kompensasi yang diperlukan."
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="border-t pt-3 bg-blue-50 -m-4 mt-3 p-4 rounded-b-lg">
                      <p className="text-sm text-blue-800 font-semibold">💰 Hasil Akhir:</p>
                      <div className="mt-2 space-y-1">
                        {upgradeCalculation.compensationPerMonth > 0 ? (
                          <>
                            <p className="text-sm">Kompensasi per bulan: {formatCurrency(upgradeCalculation.compensationPerMonth)}</p>
                            <p className="text-lg font-bold text-blue-900">
                              Total pembayaran baru: {formatCurrency(upgradeCalculation.newPaymentWithCompensation)}/bulan
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-orange-700">Tidak ada kompensasi (produk baru lebih mahal)</p>
                            <p className="text-lg font-bold text-blue-900">
                              Pembayaran baru: {formatCurrency(upgradeCalculation.newMonthlyDeposit)}/bulan
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-800">
                      <strong>⚠️ Perhatian:</strong> Setelah upgrade, pembayaran untuk sisa periode akan menggunakan
                      {upgradeCalculation.compensationPerMonth > 0 
                        ? ` nominal baru + kompensasi sebesar ${formatCurrency(upgradeCalculation.newPaymentWithCompensation)} per bulan.`
                        : ` nominal produk baru sebesar ${formatCurrency(upgradeCalculation.newMonthlyDeposit)} per bulan (tanpa kompensasi).`
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCloseUpgradeModal}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                disabled={upgradeLoading}
              >
                Batal
              </button>
              
              <div className="space-x-3">
                {upgradeStep === 1 && (
                  <button
                    onClick={handleUpgradeCalculation}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
                    disabled={!selectedNewProduct || upgradeLoading}
                  >
                    {upgradeLoading ? 'Menghitung...' : 'Hitung Kompensasi'}
                  </button>
                )}
                
                {upgradeStep === 2 && (
                  <>
                    <button
                      onClick={() => setUpgradeStep(1)}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                      disabled={upgradeLoading}
                    >
                      Kembali
                    </button>
                    <button
                      onClick={handleUpgradeExecution}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300"
                      disabled={upgradeLoading}
                    >
                      {upgradeLoading ? 'Memproses...' : 'Konfirmasi Upgrade'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proof Image Modal */}
      {showProofModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Bukti Pembayaran</h3>
                {currentTransactionInfo && (
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold">{formatCurrency(currentTransactionInfo.amount)}</span>
                    <span className="mx-2">•</span>
                    <span>{format(new Date(currentTransactionInfo.date), "dd MMM yyyy", { locale: id })}</span>
                    <span className="mx-2">•</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      currentTransactionInfo.status === 'Approved' ? 'bg-green-100 text-green-800' :
                      currentTransactionInfo.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {currentTransactionInfo.status}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={closeProofModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4">
              {currentProofImage && (
                <div className="text-center">
                  <img
                    src={currentProofImage}
                    alt="Bukti Pembayaran"
                    className="max-w-full max-h-[60vh] object-contain mx-auto rounded-lg shadow-lg"
                    onError={(e) => {
                      e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21,15 16,10 5,21'/%3E%3C/svg%3E";
                      e.target.className = "max-w-full max-h-[60vh] object-contain mx-auto rounded-lg shadow-lg opacity-50";
                    }}
                  />
                </div>
              )}

              {/* Transaction Details */}
              {currentTransactionInfo && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Detail Transaksi</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Jumlah:</span>
                      <span className="ml-2 font-semibold">{formatCurrency(currentTransactionInfo.amount)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Tanggal:</span>
                      <span className="ml-2">{format(new Date(currentTransactionInfo.date), "dd MMMM yyyy", { locale: id })}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Status:</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs ${
                        currentTransactionInfo.status === 'Approved' ? 'bg-green-100 text-green-800' :
                        currentTransactionInfo.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {currentTransactionInfo.status}
                      </span>
                    </div>
                    {currentTransactionInfo.description && (
                      <div className="md:col-span-2">
                        <span className="text-gray-600">Keterangan:</span>
                        <span className="ml-2">{currentTransactionInfo.description}</span>
                      </div>
                    )}
                    {currentTransactionInfo.rejectionReason && (
                      <div className="md:col-span-2">
                        <span className="text-gray-600">Alasan Penolakan:</span>
                        <span className="ml-2 text-red-600 italic">"{currentTransactionInfo.rejectionReason}"</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={closeProofModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loan Application Modal */}
      {showLoanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <h2 className="text-xl font-bold text-gray-800">💳 Ajukan Pinjaman</h2>
              <button
                onClick={() => {
                  setShowLoanModal(false);
                  setLoanStep(1);
                  setSelectedLoanProduct(null);
                  setLoanCalculation(null);
                  setLoanFormData({ downPayment: 0, description: "" });
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {loanStep === 1 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Pilih Produk Pinjaman</h3>
                  
                  <div className="space-y-3">
                    {loanProducts.map(product => (
                      <div
                        key={product._id}
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${
                          selectedLoanProduct?._id === product._id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                        onClick={() => {
                          setSelectedLoanProduct(product);
                          setLoanFormData(prev => ({ ...prev, downPayment: product.downPayment }));
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-semibold">{product.title}</h4>
                            <p className="text-sm text-gray-600">
                              Plafon: {formatCurrency(product.maxLoanAmount)}
                            </p>
                            <p className="text-sm text-gray-600">
                              DP Minimal: {formatCurrency(product.downPayment)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">Tenor: {product.loanTerm} bulan</p>
                            <p className="text-sm text-gray-500">Bunga: {product.interestRate}%</p>
                            {product.description && (
                              <p className="text-xs text-gray-400 mt-1">{product.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {loanProducts.length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      Tidak ada produk pinjaman yang tersedia
                    </p>
                  )}

                  {selectedLoanProduct && (
                    <div className="mt-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Uang Muka (DP)
                      </label>
                      <input
                        type="number"
                        value={loanFormData.downPayment}
                        onChange={(e) => setLoanFormData(prev => ({ ...prev, downPayment: parseFloat(e.target.value) || 0 }))}
                        min={selectedLoanProduct.downPayment}
                        max={selectedLoanProduct.maxLoanAmount}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Minimal: {formatCurrency(selectedLoanProduct.downPayment)} - Maksimal: {formatCurrency(selectedLoanProduct.maxLoanAmount)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {loanStep === 2 && loanCalculation && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Review Kalkulasi Pinjaman</h3>
                  
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Produk:</p>
                        <p className="font-semibold">{loanCalculation.productName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Harga Produk:</p>
                        <p className="font-semibold">{formatCurrency(loanCalculation.productPrice)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Uang Muka (DP):</p>
                        <p className="font-semibold">{formatCurrency(loanCalculation.downPayment)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Jumlah Pinjaman:</p>
                        <p className="font-semibold">{formatCurrency(loanCalculation.loanAmount)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Bunga ({loanCalculation.interestRate}%):</p>
                        <p className="font-semibold">{formatCurrency(loanCalculation.interestAmount)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Pembayaran:</p>
                        <p className="font-semibold text-blue-600">{formatCurrency(loanCalculation.totalPayment)}</p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-3">
                      <p className="text-sm text-gray-600">Tenor:</p>
                      <p className="font-semibold">{loanCalculation.tenor} bulan</p>
                    </div>
                    
                    <div className="border-t pt-3 bg-blue-50 -m-4 mt-3 p-4 rounded-b-lg">
                      <p className="text-sm text-blue-800 font-semibold">Cicilan Bulanan:</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatCurrency(loanCalculation.monthlyInstallment)}/bulan
                      </p>
                    </div>
                  </div>

                  {/* Payment Schedule Table */}
                  {loanCalculation.paymentSchedule && (
                    <div className="mt-6">
                      <h4 className="font-semibold text-gray-800 mb-2">Jadwal Pembayaran</h4>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Periode</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Jatuh Tempo</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Cicilan</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Sisa</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {loanCalculation.paymentSchedule.map((schedule) => (
                              <tr key={schedule.period} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-900">Bulan {schedule.period}</td>
                                <td className="px-3 py-2 text-gray-900">
                                  {format(new Date(schedule.dueDate), "dd MMM yyyy", { locale: id })}
                                </td>
                                <td className="px-3 py-2 font-medium text-gray-900">
                                  {formatCurrency(schedule.amount)}
                                </td>
                                <td className="px-3 py-2 text-gray-900">
                                  {formatCurrency(schedule.remainingBalance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Keterangan Pinjaman
                    </label>
                    <textarea
                      value={loanFormData.description}
                      onChange={(e) => setLoanFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="3"
                      placeholder="Tambahkan keterangan jika diperlukan..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  if (loanStep === 2) {
                    setLoanStep(1);
                  } else {
                    setShowLoanModal(false);
                    setLoanStep(1);
                    setSelectedLoanProduct(null);
                    setLoanCalculation(null);
                    setLoanFormData({ downPayment: 0, description: "" });
                  }
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                {loanStep === 2 ? 'Kembali' : 'Batal'}
              </button>

              <div>
                {loanStep === 1 && selectedLoanProduct && (
                  <button
                    onClick={handleLoanCalculation}
                    className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Hitung Cicilan
                  </button>
                )}
                
                {loanStep === 2 && (
                  <button
                    onClick={handleLoanApplication}
                    className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700"
                  >
                    Ajukan Pinjaman
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loan Detail Modal */}
      {showLoanDetailModal && selectedLoanDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <h2 className="text-xl font-bold text-gray-800">📋 Detail Pinjaman</h2>
              <button
                onClick={() => {
                  setShowLoanDetailModal(false);
                  setSelectedLoanDetail(null);
                  setLoanPaymentHistory([]);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Loan Information */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-3">Informasi Pinjaman</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Produk</p>
                    <p className="font-medium">{selectedLoanDetail.loanProductId?.title || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                      selectedLoanDetail.status === "Active" ? "bg-green-100 text-green-800" :
                      selectedLoanDetail.status === "Completed" ? "bg-blue-100 text-blue-800" :
                      selectedLoanDetail.status === "Overdue" ? "bg-red-100 text-red-800" :
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {selectedLoanDetail.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Tanggal Pengajuan</p>
                    <p className="font-medium">
                      {selectedLoanDetail.applicationDate ? 
                        format(new Date(selectedLoanDetail.applicationDate), "dd MMM yyyy", { locale: id }) : 
                        "-"
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Pinjaman</p>
                    <p className="font-medium text-blue-600">{formatCurrency(selectedLoanDetail.loanAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Uang Muka (DP)</p>
                    <p className="font-medium">{formatCurrency(selectedLoanDetail.downPayment)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Tenor</p>
                    <p className="font-medium">{selectedLoanDetail.tenor} bulan</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Cicilan/Bulan</p>
                    <p className="font-medium text-green-600">{formatCurrency(selectedLoanDetail.monthlyInstallment)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Bunga</p>
                    <p className="font-medium">{selectedLoanDetail.interestRate}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Pembayaran</p>
                    <p className="font-medium">{formatCurrency(selectedLoanDetail.totalPayment)}</p>
                  </div>
                </div>
              </div>

              {/* Payment Progress */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-3">Progress Pembayaran</h3>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Progress:</span>
                    <span className="text-sm font-medium">
                      {selectedLoanDetail.paidPeriods} dari {selectedLoanDetail.totalPeriods} periode
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className={`h-3 rounded-full transition-all ${
                        selectedLoanDetail.status === "Completed" ? 'bg-green-500' :
                        selectedLoanDetail.paidPeriods > 0 ? 'bg-blue-500' : 'bg-gray-400'
                      }`}
                      style={{ width: `${(selectedLoanDetail.paidPeriods / selectedLoanDetail.totalPeriods) * 100}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-sm text-gray-600">Sisa Pinjaman</p>
                      <p className="text-lg font-bold text-orange-600">
                        {formatCurrency(selectedLoanDetail.outstandingAmount || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Jatuh Tempo Berikutnya</p>
                      <p className="text-lg font-bold">
                        {selectedLoanDetail.nextDueDate ? 
                          format(new Date(selectedLoanDetail.nextDueDate), "dd MMM yyyy", { locale: id }) : 
                          "-"
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Schedule */}
              {loanPaymentHistory.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Jadwal Pembayaran</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Periode</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Jatuh Tempo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Jumlah</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Tanggal Bayar</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Bukti</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {loanPaymentHistory.map((schedule, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">
                              Periode {schedule.period}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {format(new Date(schedule.dueDate), "dd MMM yyyy", { locale: id })}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {formatCurrency(schedule.expectedAmount)}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                schedule.status === "Approved" ? "bg-green-100 text-green-800" :
                                schedule.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                                schedule.status === "Rejected" ? "bg-red-100 text-red-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                {schedule.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {schedule.actualPayment ? 
                                format(new Date(schedule.actualPayment.paymentDate), "dd MMM yyyy", { locale: id }) : 
                                "-"
                              }
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {schedule.actualPayment?.proofFile ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPaymentProof(schedule.actualPayment.proofFile);
                                    setShowPaymentProofModal(true);
                                  }}
                                  className="text-blue-600 hover:text-blue-800 underline text-xs"
                                >
                                  📷 Lihat
                                </button>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowLoanDetailModal(false);
                    setSelectedLoanDetail(null);
                    setLoanPaymentHistory([]);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Proof Image Modal */}
      {showPaymentProofModal && selectedPaymentProof && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
             onClick={() => {
               setShowPaymentProofModal(false);
               setSelectedPaymentProof(null);
             }}>
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden"
               onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-white">
              <h3 className="text-lg font-semibold text-gray-800">📷 Bukti Pembayaran</h3>
              <button
                onClick={() => {
                  setShowPaymentProofModal(false);
                  setSelectedPaymentProof(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            {/* Image Container */}
            <div className="p-4 bg-gray-50 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${selectedPaymentProof}`}
                alt="Bukti Pembayaran"
                className="w-full h-auto object-contain"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjIwMCIgeT0iMTUwIiBzdHlsZT0iZmlsbDojYWFhO2ZvbnQtd2VpZ2h0OmJvbGQ7Zm9udC1zaXplOjI0cHg7Zm9udC1mYW1pbHk6QXJpYWwsSGVsdmV0aWNhLHNhbnMtc2VyaWY7ZG9taW5hbnQtYmFzZWxpbmU6Y2VudHJhbCI+R2FtYmFyIHRpZGFrIGRpdGVtdWthbjwvdGV4dD48L3N2Zz4=';
                }}
              />
            </div>
            
            {/* Modal Footer with Actions */}
            <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center">
              <a
                href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${selectedPaymentProof}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                🔗 Buka di Tab Baru
              </a>
              <button
                onClick={() => {
                  setShowPaymentProofModal(false);
                  setSelectedPaymentProof(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        loading={confirmLoading}
      />
    </div>
  );
};

export default MemberDetail;