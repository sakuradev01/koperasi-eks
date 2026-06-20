import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import jsPDF from "jspdf";
import { toast } from "react-toastify";
import {
  addInvoicePayment,
  approveInvoiceDraft,
  deleteInvoice,
  deleteInvoicePayment,
  getInvoice,
  getPublicInvoice,
  updateInvoicePayment,
} from "../../api/invoiceApi.jsx";
import {
  getAllCategories,
  getAssetsAccounts,
} from "../../api/accountingApi.jsx";
import { API_URL } from "../../api/config.js";
import "./invoice.css";

const companyProfile = {
  name: "KOPERASI SAKURA MITRA INTERNASIONAL",
  printName: "Koperasi Sakura Mitra Internasional",
  address: [
    "Ruko Dalton Utara No. 05, Jl. Scientia Square Selatan, Kel. Curug Sangereng, Kec. Kelapa Dua, Tangerang, Banten 15810 Indonesia",
  ],
  phone: "+6221 59995428",
  website: "www.sakuramitra.com",
};

const invoiceLetterheadSrc = "/KOPERASI%20LINGKARAN2.png";

const formatMoney = (amount, currency = "IDR") => {
  const locale = currency === "IDR" ? "id-ID" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "IDR" ? 0 : 2,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(Number(amount || 0));
};

const formatDeductionMoney = (amount, currency = "IDR") =>
  `(${formatMoney(Math.abs(Number(amount || 0)), currency)})`;

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const getProjectionDueDate = (projection) =>
  projection?.estimateDate ||
  projection?.dueDate ||
  projection?.projectionDueDate ||
  projection?.date ||
  projection?.estimate;

const getInvoiceDueDate = (invoice) => {
  if (!invoice) return null;
  if (invoice.dueDate) return invoice.dueDate;
  const projectionDates = (invoice.projections || [])
    .map(getProjectionDueDate)
    .filter(Boolean);
  return projectionDates.length
    ? projectionDates[projectionDates.length - 1]
    : null;
};

const formatPaymentDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
};

const toDateInputValue = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const formatJapaneseDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatAgingDays = (days, fallback = "Tepat waktu") => {
  const safeDays = Number(days || 0);
  if (safeDays > 0) return `${safeDays} hari telat`;
  if (safeDays < 0) return `${Math.abs(safeDays)} hari lebih awal`;
  return fallback;
};

const truncateText = (text, maxLength = 54) => {
  const value = String(text || "").trim();
  if (!value) return "-";
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
};

const formatFileSize = (size = 0) => {
  const value = Number(size || 0);
  if (!value) return "0 KB";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
};

const canPreviewImageFile = (file) => {
  if (!file) return false;
  const browserPreviewTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ];
  const browserPreviewExtensions = /\.(jpe?g|png|gif|webp|bmp)$/i;
  return (
    browserPreviewTypes.includes(file.type) ||
    browserPreviewExtensions.test(file.name || "")
  );
};

const canPreviewImageName = (fileName) => /\.(jpe?g|png|gif|webp|bmp)$/i.test(
  String(fileName || ""),
);

const getTransactionAttachmentUrl = (fileName) =>
  fileName
    ? `${API_URL}/uploads/transactions/${encodeURIComponent(fileName)}`
    : "";

const sanitizePrintFileName = (value) =>
  String(value || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const loadImageAsDataUrl = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = reject;
    image.src = src;
  });

const drawPdfWrappedText = (
  doc,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  options = {},
) => {
  const lines = doc.splitTextToSize(String(text || "-"), maxWidth);
  doc.text(lines, x, y, options);
  return y + lines.length * lineHeight;
};

const statusLabel = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  Paid: "Paid",
  Partial: "Partial",
  Unpaid: "Unpaid",
};

const normalizeWhatsAppPhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
};

function HtmlBlock({ html, empty = "Tidak ada catatan" }) {
  if (!html) return <i>{empty}</i>;
  return (
    <div className="inv-rich-text" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function InvoiceLetterhead({ title = "INVOICE" }) {
  return (
    <header className="inv-print-top">
      <div className="inv-print-letterhead-logo">
        <img
          className="inv-print-letterhead-img"
          src={invoiceLetterheadSrc}
          alt={companyProfile.name}
        />
      </div>
      <div className="inv-print-letterhead-copy">
        <h2 className="inv-print-document-title">{title}</h2>
        <strong className="inv-print-company-name">
          {companyProfile.printName}
        </strong>
        <address className="inv-print-letterhead-text">
          {companyProfile.address.map((line) => (
            <span key={line}>{line}</span>
          ))}
          <span>{companyProfile.phone}</span>
          <span>{companyProfile.website}</span>
        </address>
      </div>
    </header>
  );
}

function PrintPageFrame({ title = "INVOICE", children }) {
  return (
    <table className="inv-print-page-table">
      <thead>
        <tr>
          <td>
            <InvoiceLetterhead title={title} />
            <hr className="inv-print-divider" />
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

function PrintProjectionTable({
  projections = [],
  currency = "IDR",
  labels = {},
}) {
  if (!projections.length) return null;

  return (
    <div className="inv-print-projection">
      <h3>{labels.title || "Payment Projection"}</h3>
      <div className="inv-table-wrap inv-print-projection-wrap">
        <table className="inv-print-table compact inv-print-projection-table">
          <thead>
            <tr>
              <th className="center">{labels.no || "No"}</th>
              <th>{labels.description || "Description"}</th>
              <th>{labels.dueDate || "Due Date"}</th>
              <th className="right">{labels.amount || "Amount"}</th>
              <th>{labels.status || "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((projection, index) => {
              const normalizedStatus = String(
                projection.status || "Unpaid",
              ).toLowerCase();

              return (
                <tr key={projection._id || `${projection.description}-${index}`}>
                  <td className="center">{index + 1}</td>
                  <td>{projection.description || `Cicilan ${index + 1}`}</td>
                  <td>{formatDate(getProjectionDueDate(projection))}</td>
                  <td className="right">
                    {formatMoney(projection.amount, currency)}
                  </td>
                  <td>
                    <span className={`inv-status ${normalizedStatus}`}>
                      {statusLabel[projection.status] ||
                        statusLabel[normalizedStatus] ||
                        projection.status ||
                        "Unpaid"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentSearchSelect({
  value,
  options,
  onChange,
  placeholder = "Search...",
  emptyText = "No option found.",
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const inputRef = useRef(null);

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)),
    [options, value],
  );

  useEffect(() => {
    if (isOpen) return;
    setSearch(selectedOption?.label || "");
  }, [isOpen, selectedOption]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedLabel = selectedOption?.label?.toLowerCase() || "";

    if (!query || query === selectedLabel) return options.slice(0, 40);

    return options
      .filter((option) =>
        [option.label, option.meta, option.search]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 40);
  }, [options, search, selectedOption]);

  const selectOption = (option) => {
    onChange(option.value);
    setSearch(option.label);
    setIsOpen(false);
  };

  const openMenu = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        right: "auto",
        width: Math.max(rect.width, 320),
        zIndex: 100000,
      });
    }
    setIsOpen(true);
  };

  const menu = isOpen ? (
    <div
      className="inv-combobox-menu inv-combobox-menu-portal"
      style={menuStyle || undefined}
    >
      {filteredOptions.length ? (
        filteredOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            className={`inv-combobox-option ${
              String(option.value) === String(value) ? "active" : ""
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              selectOption(option);
            }}
          >
            <span className="inv-combobox-name">{option.label}</span>
            {option.meta ? (
              <span className="inv-combobox-meta">{option.meta}</span>
            ) : null}
          </button>
        ))
      ) : (
        <div className="inv-combobox-empty">{emptyText}</div>
      )}
    </div>
  ) : null;

  return (
    <div
      className="inv-combobox"
      onBlur={() => {
        window.setTimeout(() => setIsOpen(false), 120);
      }}
    >
      <input
        ref={inputRef}
        className="inv-input inv-combobox-input"
        value={search}
        placeholder={placeholder}
        onFocus={openMenu}
        onChange={(event) => {
          setSearch(event.target.value);
          openMenu();
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (filteredOptions[0]) selectOption(filteredOptions[0]);
          }
          if (event.key === "Escape") setIsOpen(false);
        }}
      />

      {value ? (
        <button
          type="button"
          className="inv-combobox-clear"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            setSearch("");
            setIsOpen(true);
          }}
          aria-label="Clear selected option"
        >
          ×
        </button>
      ) : null}

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export default function InvoiceDetail({
  printOnly = false,
  publicView = false,
  initialPrintVariant = "standard",
  initialDetailTab = "invoice",
}) {
  const navigate = useNavigate();
  const { invoiceNumber } = useParams();
  const autoPrintRef = useRef(false);
  const invoiceSectionRef = useRef(null);
  const paymentSectionRef = useRef(null);
  const paymentAttachmentInputRef = useRef(null);
  const previousDocumentTitleRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [printVariant, setPrintVariant] = useState(initialPrintVariant);
  const [activeDetailTab, setActiveDetailTab] = useState(initialDetailTab);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState("");
  const [approvingDraft, setApprovingDraft] = useState(false);
  const [assetsAccounts, setAssetsAccounts] = useState({});
  const [categories, setCategories] = useState([]);
  const [paymentSplits, setPaymentSplits] = useState([]);
  const [paymentAttachment, setPaymentAttachment] = useState(null);
  const [paymentAttachmentPreviewUrl, setPaymentAttachmentPreviewUrl] =
    useState("");
  const [paymentAttachmentZoomOpen, setPaymentAttachmentZoomOpen] =
    useState(false);
  const [existingPaymentAttachment, setExistingPaymentAttachment] =
    useState(null);
  const [paymentSplitMode, setPaymentSplitMode] = useState(false);
  const [paymentReceiptTarget, setPaymentReceiptTarget] = useState(null);
  const [paymentReceiptPreview, setPaymentReceiptPreview] = useState(null);
  const [notePreview, setNotePreview] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    accountId: "",
    categoryId: "",
    categoryType: "",
    projectionId: "",
    projectionIndex: "",
    method: "Bank",
    senderName: "",
    notes: "",
  });

  const getInvoicePrintFileName = useCallback(
    (prefix = "INVOICE") =>
      sanitizePrintFileName(
        `${prefix} - ${
          invoice?.invoiceNumber || invoiceNumber || "Invoice"
        } - ${
          invoice?.customerSnapshot?.name || "Customer"
        }`,
      ),
    [invoice?.customerSnapshot?.name, invoice?.invoiceNumber, invoiceNumber],
  );

  const preparePrintDocumentTitle = useCallback((prefix = "INVOICE") => {
    if (previousDocumentTitleRef.current === null) {
      previousDocumentTitleRef.current = document.title;
    }
    document.title = getInvoicePrintFileName(prefix);
  }, [getInvoicePrintFileName]);

  const loadInvoice = async () => {
    setLoading(true);
    setError("");
    try {
      const res = publicView
        ? await getPublicInvoice(invoiceNumber)
        : await getInvoice(invoiceNumber);
      if (!res?.success)
        throw new Error(res?.message || "Failed to load invoice");
      setInvoice(res.data);
    } catch (err) {
      setError(
        err?.response?.data?.message || err.message || "Failed to load invoice",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [invoiceNumber, publicView]);

  useEffect(() => {
    if (!printOnly) setActiveDetailTab(initialDetailTab);
  }, [initialDetailTab, invoiceNumber, printOnly]);

  useEffect(() => {
    if (
      !printOnly &&
      !publicView &&
      invoice?.status === "draft" &&
      activeDetailTab === "payment"
    ) {
      setActiveDetailTab("invoice");
      navigate(`/invoice/${invoiceNumber}`, { replace: true });
    }
  }, [
    activeDetailTab,
    invoice?.status,
    invoiceNumber,
    navigate,
    printOnly,
    publicView,
  ]);

  useEffect(() => {
    if (publicView) return;

    const loadAccountingOptions = async () => {
      try {
        const [accountsRes, categoriesRes] = await Promise.all([
          getAssetsAccounts(),
          getAllCategories(),
        ]);
        setAssetsAccounts(accountsRes?.data || {});
        setCategories(categoriesRes?.data || []);
      } catch (err) {
        console.error(
          "Failed to load invoice payment accounting options:",
          err,
        );
      }
    };

    loadAccountingOptions();
  }, [publicView]);

  useEffect(() => {
    if (!canPreviewImageFile(paymentAttachment)) {
      setPaymentAttachmentPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(paymentAttachment);
    setPaymentAttachmentPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [paymentAttachment]);

  useEffect(() => {
    if (!printOnly || !invoice || autoPrintRef.current) return;
    autoPrintRef.current = true;
    preparePrintDocumentTitle();
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [invoice, preparePrintDocumentTitle, printOnly]);

  useEffect(() => {
    const resetPaymentReceiptPrint = () => {
      setPaymentReceiptTarget(null);
      setPrintVariant(initialPrintVariant || "standard");
      if (previousDocumentTitleRef.current !== null) {
        document.title = previousDocumentTitleRef.current;
        previousDocumentTitleRef.current = null;
      }
    };

    window.addEventListener("afterprint", resetPaymentReceiptPrint);
    return () =>
      window.removeEventListener("afterprint", resetPaymentReceiptPrint);
  }, [initialPrintVariant]);

  useEffect(
    () => () => {
      if (paymentReceiptPreview?.url) {
        URL.revokeObjectURL(paymentReceiptPreview.url);
      }
    },
    [paymentReceiptPreview?.url],
  );

  const handlePrint = (variant = "standard") => {
    preparePrintDocumentTitle("INVOICE");
    setPaymentReceiptTarget(null);
    setActiveDetailTab("invoice");
    setPrintVariant(variant);
    window.setTimeout(() => window.print(), 80);
  };

  const buildPaymentReceiptPdf = useCallback(
    async (payment) => {
      if (!payment || !invoice) return null;

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 52;
      const rightX = pageWidth - margin;
      const fileName = getInvoicePrintFileName("PAYMENT");
      const customerName = invoice.customerSnapshot?.name || "-";
      const customerContact = [
        invoice.customerSnapshot?.phone || "-",
        invoice.customerSnapshot?.email || "",
      ]
        .filter(Boolean)
        .join(" | ");

      try {
        const logoDataUrl = await loadImageAsDataUrl(invoiceLetterheadSrc);
        doc.addImage(
          logoDataUrl,
          "PNG",
          margin,
          28,
          80,
          80,
          undefined,
          "FAST",
        );
      } catch (err) {
        console.warn("Failed to render receipt logo:", err);
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(28);
      doc.text("PAYMENT RECEIPT", rightX, 48, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text(companyProfile.printName, rightX, 78, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      let addressY = 96;
      const addressLines = doc.splitTextToSize(
        companyProfile.address.join(" "),
        330,
      );
      doc.text(addressLines, rightX, addressY, { align: "right" });
      addressY += addressLines.length * 11;
      doc.text(companyProfile.phone, rightX, addressY + 7, {
        align: "right",
      });
      doc.text(companyProfile.website, rightX, addressY + 22, {
        align: "right",
      });

      const dividerY = 142;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(1);
      doc.line(margin, dividerY, rightX, dividerY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("RECEIPT", margin, dividerY + 38);

      doc.setFontSize(9);
      doc.text("INVOICE", rightX, dividerY + 34, { align: "right" });
      doc.setFontSize(13);
      doc.text(String(invoice.invoiceNumber || "-"), rightX, dividerY + 56, {
        align: "right",
      });

      const partyY = dividerY + 96;
      doc.setFontSize(12);
      doc.text("To,", margin, partyY);
      doc.setFontSize(13);
      doc.text(String(customerName).toUpperCase(), margin, partyY + 22);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      drawPdfWrappedText(
        doc,
        customerContact.toUpperCase(),
        margin,
        partyY + 42,
        260,
        12,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Paid On,", margin, partyY + 82);
      doc.setFontSize(13);
      doc.text(formatPaymentDate(payment.paymentDate), margin, partyY + 104);

      doc.setFontSize(12);
      doc.text("Payment Method", rightX, partyY, { align: "right" });
      doc.setFontSize(13);
      doc.text(payment.method || "Bank", rightX, partyY + 26, {
        align: "right",
      });

      const detailY = partyY + 174;
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, detailY - 30, rightX, detailY - 30);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Description", margin, detailY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      drawPdfWrappedText(
        doc,
        payment.notes || "-",
        margin,
        detailY + 24,
        310,
        16,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Payment Amount", rightX, detailY, { align: "right" });
      doc.setFontSize(17);
      doc.text(
        formatMoney(payment.amount, invoice.currency),
        rightX,
        detailY + 32,
        { align: "right" },
      );

      doc.setDrawColor(203, 213, 225);
      doc.line(margin, detailY + 88, rightX, detailY + 88);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Copyright © ${new Date().getFullYear()} ${companyProfile.website}`,
        pageWidth / 2,
        pageHeight - 34,
        { align: "center" },
      );

      return { doc, fileName };
    },
    [getInvoicePrintFileName, invoice],
  );

  const closePaymentReceiptPreview = useCallback(() => {
    setPaymentReceiptPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const downloadPaymentReceiptPreview = useCallback(() => {
    if (!paymentReceiptPreview?.url || !paymentReceiptPreview?.fileName) return;
    const link = document.createElement("a");
    link.href = paymentReceiptPreview.url;
    link.download = `${paymentReceiptPreview.fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [paymentReceiptPreview]);

  const handlePaymentReceiptPrint = (payment) => {
    if (!payment) return;
    buildPaymentReceiptPdf(payment)
      .then((result) => {
        if (!result) return;
        const url = URL.createObjectURL(result.doc.output("blob"));
        setPaymentReceiptPreview((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return {
            url,
            fileName: result.fileName,
          };
        });
      })
      .catch((err) => {
        console.error("Failed to preview payment receipt:", err);
        toast.error("Gagal menampilkan preview payment receipt");
      });
  };

  const projectionTotal = useMemo(
    () =>
      (invoice?.projections || []).reduce(
        (sum, projection) => sum + Number(projection.amount || 0),
        0,
      ),
    [invoice],
  );

  const flatAssetAccounts = useMemo(
    () => Object.values(assetsAccounts).flatMap((items) => items || []),
    [assetsAccounts],
  );

  const accountOptions = useMemo(
    () =>
      flatAssetAccounts.map((account) => {
        const code = account.accountCode || account.account_code || "";
        const name = account.accountName || account.account_name || "Account";
        const currency = account.currency || "";
        return {
          value: account._id || account.id,
          label: [code, name].filter(Boolean).join(" - "),
          meta: currency ? `Currency: ${currency}` : "",
          search: [code, name, currency].filter(Boolean).join(" "),
        };
      }),
    [flatAssetAccounts],
  );

  const categoryOptions = useMemo(
    () =>
      (categories || [])
        .filter((category) => (category.type || "account") === "account")
        .map((category) => {
        const type = category.type || "account";
        const code = category.code ? ` (${category.code})` : "";
        return {
          key: `${type}-${category.id}`,
          value: `${type}|${category.id}`,
          label: `${String(category.name || "").replace(/^-+\s*/, "")}${code}`,
          meta: "Account",
          search: [category.name, category.code, type]
            .filter(Boolean)
            .join(" "),
        };
      }),
    [categories],
  );

  const outstandingProjections = useMemo(
    () =>
      (invoice?.projections || []).filter(
        (projection) =>
          Number(projection.remainingAmount ?? projection.amount) > 0,
      ),
    [invoice],
  );

  const suggestedPaymentProjection = useMemo(() => {
  if (!outstandingProjections.length) return null;

  return [...outstandingProjections].sort((a, b) => {
    const dateDiff =
      new Date(a.estimateDate).getTime() - new Date(b.estimateDate).getTime();

    if (dateDiff !== 0) return dateDiff;

    return Number(a.projectionIndex || 0) - Number(b.projectionIndex || 0);
  })[0];
}, [outstandingProjections]);

  const projectionOptions = useMemo(
    () =>
      outstandingProjections.map((projection, index) => {
        const projectionIndex = projection.projectionIndex || index + 1;
        const isSuggested =
          suggestedPaymentProjection &&
          String(suggestedPaymentProjection._id) === String(projection._id);
        return {
          value: projection._id,
          label: `${isSuggested ? "Suggested - " : ""}Cicilan ${projectionIndex} - ${
            projection.description || "Projection"
          }`,
          meta: [
            isSuggested ? "Rekomendasi pembayaran berikutnya" : "",
            `Due ${formatDate(projection.estimateDate)}`,
            `Sisa ${formatMoney(
              projection.remainingAmount ?? projection.amount,
              invoice?.currency,
            )}`,
          ]
            .filter(Boolean)
            .join(" | "),
          search: [
            isSuggested ? "suggested rekomendasi" : "",
            projectionIndex,
            projection.description,
            projection.status,
            projection.amount,
          ]
            .filter(Boolean)
            .join(" "),
        };
      }),
    [invoice, outstandingProjections, suggestedPaymentProjection],
  );

  const selectedAccount = useMemo(
    () =>
      flatAssetAccounts.find(
        (account) => String(account._id) === String(paymentForm.accountId),
      ),
    [flatAssetAccounts, paymentForm.accountId],
  );

  const selectedPaymentProjection = useMemo(
    () =>
      (invoice?.projections || []).find(
        (projection) => String(projection._id) === String(paymentForm.projectionId),
      ),
    [invoice, paymentForm.projectionId],
  );

  const invoiceIsDraft = invoice?.status === "draft";
  const paymentRecords = invoice?.payments || [];
  const currentEditingPayment = useMemo(
    () =>
      paymentRecords.find(
        (payment) => String(payment._id) === String(editingPaymentId),
      ),
    [editingPaymentId, paymentRecords],
  );
  const legacyPaymentRecords = useMemo(
    () =>
      paymentRecords.filter(
        (payment) => !payment.projectionId && !payment.projectionIndex,
      ),
    [paymentRecords],
  );
  const getPaymentProjectionLabel = (payment) => {
    if (!payment?.projectionIndex) return "Unassigned / Legacy";
    return [
      `Cicilan ${payment.projectionIndex}`,
      payment.projectionDescription,
    ]
      .filter(Boolean)
      .join(" - ");
  };
  const getProjectionReceiptPayment = (projection) => {
    const realizations = Array.isArray(projection?.realizations)
      ? projection.realizations.filter(Boolean)
      : [];
    return realizations.length ? realizations[realizations.length - 1] : null;
  };
  const paymentCurrencyPrefix =
    selectedAccount?.currency || invoice?.currency || "Rp";
  const paymentAmount = Number(paymentForm.amount || 0);
  const selectedProjectionEditableRemaining = useMemo(() => {
    if (!selectedPaymentProjection) return 0;
    let remaining = Number(
      selectedPaymentProjection.remainingAmount ??
        selectedPaymentProjection.amount ??
        0,
    );
    const editingMatchesProjection =
      currentEditingPayment &&
      (String(currentEditingPayment.projectionId || "") ===
        String(selectedPaymentProjection._id || "") ||
        (Number(currentEditingPayment.projectionIndex || 0) > 0 &&
          Number(currentEditingPayment.projectionIndex) ===
            Number(
              selectedPaymentProjection.projectionIndex ||
                (invoice?.projections || []).findIndex(
                  (projection) =>
                    String(projection._id) ===
                    String(selectedPaymentProjection._id),
                ) +
                  1,
            )));

    if (editingMatchesProjection) {
      remaining += Number(currentEditingPayment.amount || 0);
    }

    return remaining;
  }, [currentEditingPayment, invoice, selectedPaymentProjection]);
  const splitUsedAmount = paymentSplits.reduce(
    (sum, split) => sum + Number(split.amount || 0),
    0,
  );
  const splitRemaining = paymentAmount - splitUsedAmount;

  const clearPaymentAttachment = () => {
    setPaymentAttachment(null);
    setPaymentAttachmentZoomOpen(false);
    if (paymentAttachmentInputRef.current) {
      paymentAttachmentInputRef.current.value = "";
    }
  };

  const resetPaymentState = () => {
    setPaymentForm({
      paymentDate: new Date().toISOString().slice(0, 10),
      amount: "",
      accountId: "",
      categoryId: "",
      categoryType: "",
      projectionId: "",
      projectionIndex: "",
      method: "Bank",
      senderName: "",
      notes: "",
    });
    setPaymentSplits([]);
    clearPaymentAttachment();
    setExistingPaymentAttachment(null);
    setPaymentSplitMode(false);
    setEditingPaymentId("");
  };

  const switchDetailTab = (tabName) => {
    if (tabName === "payment" && invoiceIsDraft) {
      toast.info("Approve draft invoice dulu sebelum masuk ke Payment");
      return;
    }

    const sectionRef =
      tabName === "payment" ? paymentSectionRef : invoiceSectionRef;
    if (publicView) return;

    const detailPath =
      tabName === "payment"
        ? `/payment/${invoiceNumber}`
        : `/invoice/${invoiceNumber}`;

    setActiveDetailTab(tabName);
    if (!printOnly && window.location.pathname !== detailPath) {
      navigate(detailPath);
    }

    window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 40);
  };

  const buildProjectionPaymentPatch = (projection = null) => {
    if (!projection) {
      return {
        projectionId: "",
        projectionIndex: "",
        amount: "",
        notes: "",
      };
    }

    const projectionIndex =
      projection.projectionIndex ||
      (invoice?.projections || []).findIndex(
        (item) => String(item._id) === String(projection._id),
      ) + 1;
    const remainingAmount = Number(
      projection.remainingAmount ?? projection.amount ?? 0,
    );

    return {
      projectionId: projection._id || "",
      projectionIndex: projectionIndex ? String(projectionIndex) : "",
      amount: remainingAmount > 0 ? String(remainingAmount) : "",
      notes: `Payment for: Cicilan ${projectionIndex} - ${
        projection.description || "Invoice projection"
      }`,
    };
  };

  const startPayment = (projection = null) => {
    if (invoiceIsDraft) {
      toast.error(
        "Invoice masih draft. Approve draft dulu sebelum record payment",
      );
      return;
    }

    const targetProjection = projection || suggestedPaymentProjection;

    setPaymentForm({
      paymentDate: new Date().toISOString().slice(0, 10),
      accountId: "",
      categoryId: "",
      categoryType: "",
      ...buildProjectionPaymentPatch(targetProjection),
      method: "Bank",
      senderName: "",
    });
    setPaymentSplits([]);
    clearPaymentAttachment();
    setExistingPaymentAttachment(null);
    setPaymentSplitMode(false);
    setEditingPaymentId("");
    setAddingPayment(true);
    switchDetailTab("payment");
  };

  const startEditPayment = (payment) => {
    if (invoiceIsDraft) {
      toast.error("Invoice masih draft. Approve draft dulu sebelum edit payment");
      return;
    }
    const existingSplitRows = (payment.splits || []).map((split) => ({
      amount: String(split.amount || ""),
      categoryId: split.categoryId || "",
      categoryType: split.categoryType || "account",
      description: split.description || "",
    }));

    setPaymentForm({
      paymentDate: toDateInputValue(payment.paymentDate),
      amount: String(payment.amount || ""),
      accountId: payment.accountId || "",
      categoryId: payment.categoryId || "",
      categoryType: payment.categoryType || "",
      projectionId: payment.projectionId || "",
      projectionIndex: payment.projectionIndex
        ? String(payment.projectionIndex)
        : "",
      method: payment.method || "Bank",
      senderName: payment.senderName || "",
      notes: payment.notes || "",
    });
    setPaymentSplits(
      existingSplitRows.length || !payment.isSplit
        ? existingSplitRows
        : [
            { amount: "", categoryId: "", categoryType: "account" },
            { amount: "", categoryId: "", categoryType: "account" },
          ],
    );
    clearPaymentAttachment();
    setExistingPaymentAttachment(
      payment.attachment
        ? {
            fileName: payment.attachment,
            originalName: payment.attachmentOriginalName || payment.attachment,
          }
        : null,
    );
    setPaymentSplitMode(Boolean(payment.isSplit));
    setEditingPaymentId(payment._id || "");
    setAddingPayment(true);
    switchDetailTab("payment");
  };

  const selectPaymentProjection = (projectionId) => {
    const projection = (invoice?.projections || []).find(
      (item) => String(item._id) === String(projectionId),
    );

    setPaymentForm((prev) => {
      const patch = buildProjectionPaymentPatch(projection || null);
      if (editingPaymentId) {
        return {
          ...prev,
          projectionId: patch.projectionId,
          projectionIndex: patch.projectionIndex,
          notes: prev.notes || patch.notes,
        };
      }
      return {
        ...prev,
        ...patch,
      };
    });
  };

  const getProjectionAgingLabel = (projection) => {
    const hasRealization = (projection.realizations || []).length > 0;
    if (!hasRealization && String(projection.status || "").toLowerCase() === "unpaid") {
      const dueDate = new Date(projection.estimateDate);
      if (!Number.isNaN(dueDate.getTime()) && dueDate > new Date()) {
        return "Belum jatuh tempo";
      }
    }
    return formatAgingDays(projection.agingDays, "Tepat waktu");
  };

  const getProjectionSuggestionReason = (projection) => {
    if (!projection) return "";
    if (String(projection.status || "").toLowerCase() === "partial") {
      return "Lanjutkan cicilan partial yang masih ada sisa";
    }
    if (Number(projection.agingDays || 0) > 0) {
      return "Prioritas karena sudah lewat jatuh tempo";
    }
    return "Cicilan terdekat yang masih belum lunas";
  };

  const selectPaymentCategory = (value) => {
    const [categoryType, categoryId] = (value || "|").split("|");
    setPaymentForm((prev) => ({
      ...prev,
      categoryType: categoryType || "",
      categoryId: categoryId || "",
    }));
  };

  const initPaymentSplit = () => {
    if (paymentAmount <= 0) {
      toast.error("Isi amount dulu sebelum split transaction");
      return;
    }
    setPaymentSplitMode(true);
    const existingSplitRows = (currentEditingPayment?.splits || []).map(
      (split) => ({
        amount: String(split.amount || ""),
        categoryId: split.categoryId || "",
        categoryType: split.categoryType || "account",
        description: split.description || "",
      }),
    );
    if (paymentSplits.length < 2 && existingSplitRows.length >= 2) {
      setPaymentSplits(existingSplitRows);
      return;
    }
    if (paymentSplits.length < 2) {
      setPaymentSplits([
        { amount: "", categoryId: "", categoryType: "account" },
        { amount: "", categoryId: "", categoryType: "account" },
      ]);
    }
  };

  const cancelPaymentSplit = () => {
    setPaymentSplitMode(false);
    setPaymentSplits([]);
  };

  const addPaymentSplit = () => {
    setPaymentSplits((prev) => [
      ...prev,
      { amount: "", categoryId: "", categoryType: "account" },
    ]);
  };

  const removePaymentSplit = (index) => {
    setPaymentSplits((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      return next.length >= 2
        ? next
        : [...next, { amount: "", categoryId: "", categoryType: "account" }];
    });
  };

  const updatePaymentSplit = (index, patch) => {
    setPaymentSplits((prev) =>
      prev.map((split, currentIndex) =>
        currentIndex === index ? { ...split, ...patch } : split,
      ),
    );
  };

  const updatePaymentSplitCategory = (index, value) => {
    const [categoryType, categoryId] = (value || "|").split("|");
    updatePaymentSplit(index, {
      categoryType: categoryType || "account",
      categoryId: categoryId || "",
    });
  };

  const handlePaymentAttachment = (file) => {
    if (!file) return;
    setPaymentAttachmentZoomOpen(false);
    if (file.size > 6 * 1024 * 1024) {
      clearPaymentAttachment();
      toast.error("Attachment maksimal 6MB");
      return;
    }
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/tiff",
      "image/bmp",
      "image/heic",
      "application/pdf",
    ];
    const allowedExt = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "tiff",
      "tif",
      "bmp",
      "heic",
      "pdf",
    ];
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowed.includes(file.type) && !allowedExt.includes(extension)) {
      clearPaymentAttachment();
      toast.error("Attachment harus JPG, PNG, GIF, TIFF, BMP, HEIC, atau PDF");
      return;
    }
    setPaymentAttachment(file);
  };

  const getInvoiceUrl = () =>
    `${window.location.origin}/public/invoice/${invoiceNumber}`;

  const sendInvoiceViaWhatsApp = () => {
    const phone = normalizeWhatsAppPhone(invoice?.customerSnapshot?.phone);
    if (!phone) {
      toast.error("Nomor customer belum tersedia");
      return;
    }
    const message = [
      `*${companyProfile.name}*`,
      "",
      `*INVOICE #${invoiceNumber}*`,
      `Dear ${invoice?.customerSnapshot?.name || "Customer"},`,
      "",
      `Invoice Number: ${invoiceNumber}`,
      `Invoice Date: ${formatDate(invoice?.issuedDate)}`,
      `Payment Due: ${formatDate(invoice?.dueDate)}`,
      `Total Amount: ${formatMoney(invoice?.total, invoice?.currency)}`,
      `Amount Due: ${formatMoney(invoice?.amountDue, invoice?.currency)}`,
      "",
      `View invoice: ${getInvoiceUrl()}`,
      "",
      `Best regards,`,
      companyProfile.name,
      companyProfile.phone,
      companyProfile.website,
    ].join("\n");

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const sendInvoiceViaEmail = () => {
    const email = invoice?.customerSnapshot?.email || "";
    if (!email) {
      toast.error("Email customer belum tersedia");
      return;
    }
    const subject = `Invoice #${invoiceNumber} from ${companyProfile.name}`;
    const body = [
      `Dear ${invoice?.customerSnapshot?.name || "Customer"},`,
      "",
      "Please find your invoice details below:",
      "",
      `Invoice Number: ${invoiceNumber}`,
      `Invoice Date: ${formatDate(invoice?.issuedDate)}`,
      `Payment Due: ${formatDate(invoice?.dueDate)}`,
      `Total Amount: ${formatMoney(invoice?.total, invoice?.currency)}`,
      `Amount Due: ${formatMoney(invoice?.amountDue, invoice?.currency)}`,
      "",
      `View invoice: ${getInvoiceUrl()}`,
      "",
      "Best regards,",
      companyProfile.name,
      companyProfile.phone,
      companyProfile.website,
    ].join("\n");

    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  const submitPayment = async () => {
    setError("");
    const amount = Number(paymentForm.amount || 0);

    if (amount <= 0) {
      toast.error("Amount tidak valid");
      return;
    }
    if ((invoice?.projections || []).length && !paymentForm.projectionId) {
      toast.error("Pilih cicilan/proyeksi pembayaran");
      return;
    }
    if (
      selectedPaymentProjection &&
      amount > selectedProjectionEditableRemaining + 0.01
    ) {
      toast.error(
        `Amount melebihi sisa cicilan. Sisa: ${formatMoney(
          selectedProjectionEditableRemaining,
          invoice.currency,
        )}`,
      );
      return;
    }
    if (!paymentForm.accountId) {
      toast.error("Record Account wajib dipilih");
      return;
    }
    if (paymentSplitMode) {
      if (paymentSplits.length < 2) {
        toast.error("Split transaction minimal 2 baris");
        return;
      }

      const invalidSplit = paymentSplits.some(
        (split) =>
          Number(split.amount || 0) <= 0 ||
          !split.categoryId ||
          !split.categoryType,
      );
      if (invalidSplit) {
        toast.error("Semua split wajib punya amount dan category");
        return;
      }
      if (Math.abs(splitRemaining) > 0.01) {
        toast.error(
          `Split belum balance. Remaining: ${formatMoney(
            splitRemaining,
            invoice.currency,
          )}`,
        );
        return;
      }
    } else if (
      !(editingPaymentId && currentEditingPayment?.isSplit) &&
      (!paymentForm.categoryId || !paymentForm.categoryType)
    ) {
      toast.error("Category wajib dipilih");
      return;
    }

    try {
      const payload = new FormData();
      payload.append("paymentDate", paymentForm.paymentDate);
      payload.append("amount", String(amount));
      payload.append("accountId", paymentForm.accountId);
      payload.append("method", paymentForm.method || "Bank");
      payload.append("senderName", paymentForm.senderName || "");
      payload.append("notes", paymentForm.notes || "");
      if (paymentForm.projectionId) {
        payload.append("projectionId", paymentForm.projectionId);
        payload.append("projectionIndex", paymentForm.projectionIndex || "");
      }

      if (paymentSplitMode) {
        payload.append(
          "splits",
          JSON.stringify(
            paymentSplits.map((split) => ({
              amount: Number(split.amount || 0),
              categoryId: split.categoryId,
              categoryType: split.categoryType || "account",
              description: split.description || "",
            })),
          ),
        );
      } else if (!(editingPaymentId && currentEditingPayment?.isSplit)) {
        payload.append("categoryId", paymentForm.categoryId);
        payload.append("categoryType", paymentForm.categoryType);
      }

      if (paymentAttachment) {
        payload.append("proofAttachment", paymentAttachment);
      }

      const res = editingPaymentId
        ? await updateInvoicePayment(invoiceNumber, editingPaymentId, payload)
        : await addInvoicePayment(invoiceNumber, payload);
      if (!res?.success)
        throw new Error(res?.message || "Failed to save payment");
      toast.success(editingPaymentId ? "Payment updated" : "Payment added");
      setInvoice(res.data);
      resetPaymentState();
      setAddingPayment(false);
    } catch (err) {
      setError(
        err?.response?.data?.message || err.message || "Failed to add payment",
      );
    }
  };

  const removePayment = async (paymentId) => {
    if (!window.confirm("Hapus pembayaran ini?")) return;
    try {
      const res = await deleteInvoicePayment(invoiceNumber, paymentId);
      if (!res?.success)
        throw new Error(res?.message || "Failed to delete payment");
      toast.success("Payment deleted");
      setInvoice(res.data);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to delete payment",
      );
    }
  };

  const approveDraft = async () => {
    if (
      !window.confirm(
        "Approve draft invoice ini? Setelah approve, invoice bisa dipakai untuk record payment.",
      )
    ) {
      return;
    }

    setApprovingDraft(true);
    setError("");
    try {
      const res = await approveInvoiceDraft(invoiceNumber);
      if (!res?.success)
        throw new Error(res?.message || "Failed to approve draft");
      toast.success("Draft invoice approved");
      setInvoice(res.data);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to approve draft",
      );
    } finally {
      setApprovingDraft(false);
    }
  };

  const removeInvoice = async () => {
    if (!window.confirm(`Hapus invoice ${invoiceNumber}?`)) return;
    try {
      const res = await deleteInvoice(invoiceNumber);
      if (!res?.success)
        throw new Error(res?.message || "Failed to delete invoice");
      toast.success("Invoice deleted");
      navigate("/invoice");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to delete invoice",
      );
    }
  };

  const PaymentOverviewTables = () => (
    <div className="inv-payment-overview inv-no-print">
      {suggestedPaymentProjection && !invoiceIsDraft ? (
        <div className="inv-payment-suggestion-card">
          <div>
            <span>Suggested next payment</span>
            <strong>
              Cicilan{" "}
              {suggestedPaymentProjection.projectionIndex ||
                (invoice.projections || []).findIndex(
                  (item) =>
                    String(item._id) ===
                    String(suggestedPaymentProjection._id),
                ) + 1}{" "}
              - {suggestedPaymentProjection.description || "Projection"}
            </strong>
            <small>{getProjectionSuggestionReason(suggestedPaymentProjection)}</small>
          </div>
          <div className="inv-payment-suggestion-side">
            <span>
              Sisa{" "}
              {formatMoney(
                suggestedPaymentProjection.remainingAmount ??
                  suggestedPaymentProjection.amount,
                invoice.currency,
              )}
            </span>
            <button
              type="button"
              onClick={() => startPayment(suggestedPaymentProjection)}
            >
              Pay Suggested
            </button>
          </div>
        </div>
      ) : null}

      <div className="inv-projection-card">
        <div className="inv-projection-head linked">
          <span>Payment Projection</span>
          <span>Realization</span>
        </div>
        <div className="inv-table-wrap">
          <table className="inv-table inv-linked-payment-table">
            <thead>
              <tr>
                <th>Aging</th>
                <th>Projection</th>
                <th>Due Date</th>
                <th className="right">Projected</th>
                <th>Payment</th>
                <th className="right">Amount</th>
                <th>Keterangan</th>
                <th className="center">Attc</th>
                <th className="center">Action</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.projections || []).length ? (
                (invoice.projections || []).map((projection, index) => {
                  const projectionIndex = projection.projectionIndex || index + 1;
                  const realizations = (projection.realizations || []).length
                    ? projection.realizations
                    : [null];
                  const projectionStatus = String(
                    projection.status || "Unpaid",
                  ).toLowerCase();
                  const projectionReceiptPayment =
                    getProjectionReceiptPayment(projection);

                  return realizations.map((payment, paymentIndex) => (
                    <tr
                      key={`${projection._id}-${payment?._id || "empty"}`}
                      className={
                        paymentIndex === 0 ? "inv-projection-row-start" : ""
                      }
                    >
                      {paymentIndex === 0 ? (
                        <>
                          <td rowSpan={realizations.length}>
                            <span
                              className={`inv-aging-pill ${
                                Number(projection.agingDays || 0) > 0
                                  ? "late"
                                  : "ok"
                              }`}
                            >
                              {getProjectionAgingLabel(projection)}
                            </span>
                          </td>
                          <td rowSpan={realizations.length}>
                            <span className="inv-row-badge blue">
                              {projectionIndex}
                            </span>
                            <strong>{projection.description}</strong>
                            <div className="inv-projection-mini">
                              Paid{" "}
                              {formatMoney(
                                projection.paidAmount || 0,
                                invoice.currency,
                              )}{" "}
                              / Remaining{" "}
                              {formatMoney(
                                projection.remainingAmount ?? projection.amount,
                                invoice.currency,
                              )}
                            </div>
                          </td>
                          <td rowSpan={realizations.length}>
                            {formatDate(projection.estimateDate)}
                          </td>
                          <td rowSpan={realizations.length} className="right">
                            {formatMoney(projection.amount, invoice.currency)}
                            <div>
                              <span
                                className={`inv-status ${projectionStatus}`}
                              >
                                {statusLabel[projection.status] ||
                                  projection.status ||
                                  "Unpaid"}
                              </span>
                            </div>
                          </td>
                        </>
                      ) : null}
                      <td>
                        {payment ? (
                          <>
                            <span className="inv-row-badge pink">
                              {projectionIndex}.{paymentIndex + 1}
                            </span>
                            <strong>{formatDate(payment.paymentDate)}</strong>
                            <div className="inv-payment-method">
                              {payment.method || "Bank"}
                            </div>
                          </>
                        ) : (
                          <span className="inv-muted">No realization</span>
                        )}
                      </td>
                      <td className="right">
                        {payment ? (
                          <strong>
                            {formatMoney(payment.amount, invoice.currency)}
                          </strong>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {payment?.notes ? (
                          <button
                            type="button"
                            className="inv-note-preview-btn"
                            onClick={() =>
                              setNotePreview({
                                title: `Cicilan ${projectionIndex}`,
                                body: payment.notes,
                              })
                            }
                          >
                            {truncateText(payment.notes)}
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="center">
                        {payment?.attachment ? (
                          <a
                            className="inv-file-link"
                            href={`${API_URL}/uploads/transactions/${encodeURIComponent(
                              payment.attachment,
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      {paymentIndex === 0 ? (
                        <td rowSpan={realizations.length} className="center">
                          {invoiceIsDraft ? (
                            <span className="inv-muted-dash">-</span>
                          ) : projectionStatus === "paid" &&
                            projectionReceiptPayment ? (
                            <button
                              type="button"
                              className="inv-view-receipt-btn"
                              onClick={() =>
                                handlePaymentReceiptPrint(
                                  projectionReceiptPayment,
                                )
                              }
                            >
                              View Payment Receipt
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="inv-pay-projection-btn"
                              onClick={() => startPayment(projection)}
                            >
                              Pay
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ));
                })
              ) : (
                <tr>
                  <td colSpan="9" className="center">
                    No payment projection
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3">Total Projection</td>
                <td className="right">
                  {formatMoney(projectionTotal, invoice.currency)}
                </td>
                <td>Total Received</td>
                <td className="right">
                  {formatMoney(invoice.totalPaid, invoice.currency)}
                </td>
                <td colSpan="3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {legacyPaymentRecords.length ? (
        <div className="inv-projection-card inv-legacy-payment-card">
          <div className="inv-projection-head legacy">
            Unassigned / Legacy Realization
          </div>
          <div className="inv-table-wrap">
            <table className="inv-table inv-samit-realization-table">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th className="right">Amount</th>
                  <th>Keterangan</th>
                  <th className="center">Attc</th>
                  <th className="center">Action</th>
                </tr>
              </thead>
              <tbody>
                {legacyPaymentRecords.map((payment, index) => (
                  <tr key={payment._id}>
                    <td>
                      <span className="inv-row-badge pink">{index + 1}</span>
                      <strong>{formatDate(payment.paymentDate)}</strong>
                      <div className="inv-payment-method">
                        {payment.method || "Bank"}
                      </div>
                    </td>
                    <td className="right">
                      <strong>
                        {formatMoney(payment.amount, invoice.currency)}
                      </strong>
                    </td>
                    <td>
                      {payment.notes ? (
                        <button
                          type="button"
                          className="inv-note-preview-btn"
                          onClick={() =>
                            setNotePreview({
                              title: "Unassigned / Legacy Payment",
                              body: payment.notes,
                            })
                          }
                        >
                          {truncateText(payment.notes)}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="center">
                      {payment.attachment ? (
                        <a
                          className="inv-file-link"
                          href={`${API_URL}/uploads/transactions/${encodeURIComponent(
                            payment.attachment,
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="center">
                      <button
                        type="button"
                        className="inv-mini-print"
                        onClick={() => startEditPayment(payment)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inv-mini-print"
                        onClick={() => handlePaymentReceiptPrint(payment)}
                      >
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="inv-payment-summary-card">
        <div className="inv-payment-summary-item blue">
          <span>Total Projection</span>
          <strong>{formatMoney(projectionTotal, invoice.currency)}</strong>
        </div>
        <div className="inv-payment-summary-item pink">
          <span>Total Received</span>
          <strong>{formatMoney(invoice.totalPaid, invoice.currency)}</strong>
        </div>
        <div className="inv-payment-summary-item violet">
          <span>Amount Due</span>
          <strong>
            {Number(invoice.amountDue) < 0
              ? `(${formatMoney(Math.abs(invoice.amountDue), invoice.currency)})`
              : formatMoney(invoice.amountDue, invoice.currency)}
          </strong>
        </div>
      </div>
    </div>
  );

  const PaymentRecordList = () => (
    <div className="inv-payment-ledger">
      {!paymentRecords.length ? (
        <div className="inv-empty">No payment data</div>
      ) : (
        paymentRecords.map((payment, index) => (
          <article className="inv-payment-record" key={payment._id}>
            <div className="inv-payment-record-number">{index + 1}</div>
            <div className="inv-payment-record-body">
              <div className="inv-payment-record-top">
                <div>
                  <span>Payment received</span>
                  <strong>{formatDate(payment.paymentDate)}</strong>
                  {payment.projectionIndex ? (
                    <em className="inv-payment-record-marker">
                      Cicilan {payment.projectionIndex}
                      {payment.projectionDescription
                        ? ` - ${payment.projectionDescription}`
                        : ""}
                    </em>
                  ) : (
                    <em className="inv-payment-record-marker legacy">
                      Unassigned / Legacy
                    </em>
                  )}
                  <small>
                    {payment.notes || "-"} - <b>{payment.method || "Bank"}</b>
                  </small>
                </div>
                <strong className="inv-payment-record-amount">
                  {formatMoney(payment.amount, invoice.currency)}
                </strong>
              </div>
              <div className="inv-payment-record-actions">
                <button type="button" onClick={() => startEditPayment(payment)}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handlePaymentReceiptPrint(payment)}
                >
                  Print
                </button>
                {payment.attachment ? (
                  <a
                    href={`${API_URL}/uploads/transactions/${encodeURIComponent(
                      payment.attachment,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Attachment
                  </a>
                ) : (
                  <span>No attachment</span>
                )}
                <button
                  type="button"
                  onClick={() => removePayment(payment._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );

  return (
    <div
      className={`inv-page inv-invoice-page ${
        publicView ? "inv-public-page" : ""
      }`}
    >
      {publicView ? (
        <div className="inv-public-toolbar inv-no-print">
          <div>
            <span>Public Invoice</span>
            <strong>{invoiceNumber}</strong>
          </div>
          <div className="inv-public-actions">
            <button type="button" onClick={() => handlePrint("standard")}>
              Print / Save PDF
            </button>
            <button type="button" onClick={() => handlePrint("japan")}>
              Print Japan
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="inv-samit-hero inv-no-print">
            <div>
              <h1>
                <button
                  type="button"
                  className="inv-back-icon"
                  onClick={() => navigate("/invoice")}
                  aria-label="Back to invoice list"
                >
                  ‹
                </button>
                Invoice {invoiceNumber}
                <span className={`inv-status ${invoice?.status || "draft"}`}>
                  {statusLabel[invoice?.status] || invoice?.status || "Draft"}
                </span>
              </h1>
              <div className="inv-breadcrumb">
                <button type="button" onClick={() => navigate("/dashboard")}>
                  Dashboard
                </button>
                <span>/</span>
                <button type="button" onClick={() => navigate("/invoice")}>
                  Invoice
                </button>
                <span>/</span>
                <strong>{invoiceNumber}</strong>
              </div>
            </div>
            <div className="inv-hero-blob" aria-hidden="true" />
          </div>

          <div className="inv-samit-toolbar inv-no-print">
            <div className="inv-samit-tabs">
              <button
                type="button"
                className={`inv-samit-tab ${
                  activeDetailTab === "invoice" ? "active" : ""
                }`}
                onClick={() => switchDetailTab("invoice")}
              >
                Invoice
              </button>
              <button
                type="button"
                className={`inv-samit-tab ${
                  activeDetailTab === "payment" ? "active" : ""
                } ${invoiceIsDraft ? "disabled" : ""}`}
                onClick={() => switchDetailTab("payment")}
                disabled={invoiceIsDraft}
                title={
                  invoiceIsDraft
                    ? "Approve draft dulu untuk membuka Payment"
                    : ""
                }
              >
                Payment
              </button>
            </div>
            <div className="inv-samit-toolbar-actions">
              <button
                type="button"
                className="inv-btn-success"
                onClick={sendInvoiceViaWhatsApp}
              >
                WhatsApp
              </button>
              <button
                type="button"
                className="inv-btn-info"
                onClick={sendInvoiceViaEmail}
              >
                Email
              </button>
              <div className="inv-action-menu">
                <button
                  type="button"
                  className="inv-option-trigger"
                  onClick={() => setShowActionMenu((prev) => !prev)}
                  aria-label="More invoice actions"
                >
                  ▾
                </button>
                {showActionMenu ? (
                  <ul className="inv-option-section">
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionMenu(false);
                          navigate(`/invoice/${invoiceNumber}/edit`);
                        }}
                      >
                        Edit
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionMenu(false);
                          removeInvoice();
                        }}
                      >
                        Delete
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionMenu(false);
                          handlePrint("standard");
                        }}
                      >
                        Print
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionMenu(false);
                          handlePrint("japan");
                        }}
                      >
                        Print (Japan)
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          {!loading && invoiceIsDraft ? (
            <div className="inv-draft-bar inv-no-print">
              <p>
                <strong>Draft invoice</strong>
                <span>
                  Invoice masih draft dan belum bisa menerima payment.
                </span>
              </p>
              <button
                type="button"
                className="inv-btn"
                onClick={approveDraft}
                disabled={approvingDraft}
              >
                {approvingDraft ? "Approving..." : "Approve Draft"}
              </button>
            </div>
          ) : null}
        </>
      )}

      {error ? <div className="inv-error inv-no-print">{error}</div> : null}
      {loading ? (
        <div className="inv-card inv-sub inv-no-print">
          Loading invoice detail...
        </div>
      ) : null}

      {!loading && invoice ? (
        <>
          <div
            className={`inv-tab-panel ${
              activeDetailTab === "invoice" ? "" : "is-hidden"
            }`}
            ref={invoiceSectionRef}
          >
            <div className="inv-print-shell">
              <section
                className={`inv-print-sheet ${
                  printVariant === "standard" ? "" : "is-hidden"
                }`}
                id="printableArea"
              >
                <PrintPageFrame>
                  <div className="inv-print-bill-row">
                  <address className="inv-print-to">
                    <h6>To,</h6>
                    <h4>{invoice.customerSnapshot?.name || "-"}</h4>
                    <p>{invoice.customerSnapshot?.productTitle || "-"}</p>
                    {invoice.customerSnapshot?.referralCode ? (
                      <p className="inv-referral-line">
                        Kode referal: <strong>{invoice.customerSnapshot.referralCode}</strong>
                      </p>
                    ) : null}
                    <p>
                      {invoice.customerSnapshot?.completeAddress ||
                        "Alamat belum diisi"}
                    </p>
                    <strong>{invoice.customerSnapshot?.phone || "-"}</strong>
                    <strong>{invoice.customerSnapshot?.email || "-"}</strong>
                  </address>

                  <table className="inv-print-meta">
                    <tbody>
                      <tr>
                        <td>Invoice Number</td>
                        <td>:</td>
                        <td>{invoice.invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td>Sales Code</td>
                        <td>:</td>
                        <td>{invoice.salesCode || "-"}</td>
                      </tr>
                      <tr>
                        <td>Invoice Date</td>
                        <td>:</td>
                        <td>{formatDate(invoice.issuedDate)}</td>
                      </tr>
                      <tr>
                        <td>Payment Due</td>
                        <td>:</td>
                        <td>{formatDate(getInvoiceDueDate(invoice))}</td>
                      </tr>
                      <tr>
                        <td>Amount Due</td>
                        <td>:</td>
                        <td>
                          {formatMoney(invoice.amountDue, invoice.currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="inv-table-wrap inv-print-items-wrap">
                  <table className="inv-print-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="center">Quantity</th>
                        <th className="right">Price</th>
                        <th className="right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invoice.items || []).map((item) => (
                        <tr key={item._id}>
                          <td>
                            <strong>{item.title}</strong>
                            <div>{item.description || "-"}</div>
                          </td>
                          <td className="center">{item.quantity}</td>
                          <td className="right">
                            {formatMoney(item.price, invoice.currency)}
                          </td>
                          <td className="right">
                            {formatMoney(item.amount, invoice.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="inv-print-summary-row">
                  <table className="inv-print-summary">
                    <tbody>
                      <tr>
                        <td>Subtotal</td>
                        <td>:</td>
                        <td>
                          {formatMoney(invoice.subtotal, invoice.currency)}
                        </td>
                      </tr>
                      {(invoice.discounts || []).map((discount) => (
                        <tr className="discount" key={discount._id}>
                          <td>{discount.label}</td>
                          <td>:</td>
                          <td>
                            <i>
                              {discount.type === "percentage"
                                ? `${discount.value}%`
                                : formatDeductionMoney(
                                    discount.value,
                                    invoice.currency,
                                  )}
                            </i>
                          </td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td>Total</td>
                        <td>:</td>
                        <td>{formatMoney(invoice.total, invoice.currency)}</td>
                      </tr>
                      {(invoice.payments || []).map((payment) => (
                        <tr className="payment" key={payment._id}>
                          <td>
                            Payment on {formatPaymentDate(payment.paymentDate)}{" "}
                            by {payment.method}
                          </td>
                          <td>:</td>
                          <td>
                            ({formatMoney(payment.amount, invoice.currency)})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <hr className="inv-print-divider" />

                <div className="inv-print-amount-due">
                  <span>Amount due</span>
                  <strong
                    className={Number(invoice.amountDue) < 0 ? "negative" : ""}
                  >
                    {Number(invoice.amountDue) < 0
                      ? `(${formatMoney(Math.abs(invoice.amountDue), invoice.currency)})`
                      : formatMoney(invoice.amountDue, invoice.currency)}
                  </strong>
                </div>

                <PrintProjectionTable
                  projections={invoice.projections || []}
                  currency={invoice.currency}
                />

                  <div className="inv-print-terms inv-print-page-break">
                  <h3>Note/Term of Services</h3>
                  <HtmlBlock html={invoice.terms} />
                </div>

                {!publicView ? (
                  <>
                    <div className="inv-personal-note inv-no-print">
                      <h3>Personal Note</h3>
                      <HtmlBlock html={invoice.notes} empty="-" />
                    </div>

                    <div className="inv-detail-footer-actions inv-no-print">
                      <button
                        type="button"
                        className="inv-detail-action danger"
                        onClick={removeInvoice}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="inv-detail-action edit"
                        onClick={() =>
                          navigate(`/invoice/${invoiceNumber}/edit`)
                        }
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inv-detail-action print"
                        onClick={() => handlePrint("standard")}
                      >
                        Print
                      </button>
                    </div>
                  </>
                  ) : null}
                </PrintPageFrame>
              </section>

              <section
                className={`inv-print-sheet inv-print-japan ${
                  printVariant === "japan" ? "" : "is-hidden"
                }`}
              >
                <PrintPageFrame title="請求書">
                  <div className="inv-print-bill-row">
                  <address className="inv-print-to">
                    <h6>ご請求先</h6>
                    <h4>{invoice.customerSnapshot?.name || "-"}</h4>
                    <p>{invoice.customerSnapshot?.productTitle || "-"}</p>
                    {invoice.customerSnapshot?.referralCode ? (
                      <p className="inv-referral-line">
                        紹介コード: <strong>{invoice.customerSnapshot.referralCode}</strong>
                      </p>
                    ) : null}
                    <p>
                      {invoice.customerSnapshot?.completeAddress ||
                        "住所未入力"}
                    </p>
                    <strong>{invoice.customerSnapshot?.phone || "-"}</strong>
                    <strong>{invoice.customerSnapshot?.email || "-"}</strong>
                  </address>

                  <table className="inv-print-meta">
                    <tbody>
                      <tr>
                        <td>請求書番号</td>
                        <td>:</td>
                        <td>{invoice.invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td>営業コード</td>
                        <td>:</td>
                        <td>{invoice.salesCode || "-"}</td>
                      </tr>
                      <tr>
                        <td>発行日</td>
                        <td>:</td>
                        <td>{formatJapaneseDate(invoice.issuedDate)}</td>
                      </tr>
                      <tr>
                        <td>支払期限</td>
                        <td>:</td>
                        <td>{formatJapaneseDate(getInvoiceDueDate(invoice))}</td>
                      </tr>
                      <tr>
                        <td>請求残額</td>
                        <td>:</td>
                        <td>
                          {formatMoney(invoice.amountDue, invoice.currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="inv-table-wrap inv-print-items-wrap">
                  <table className="inv-print-table">
                    <thead>
                      <tr>
                        <th>品目</th>
                        <th className="center">数量</th>
                        <th className="right">単価</th>
                        <th className="right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invoice.items || []).map((item) => (
                        <tr key={`jp-item-${item._id}`}>
                          <td>
                            <strong>{item.title}</strong>
                            <div>{item.description || "-"}</div>
                          </td>
                          <td className="center">{item.quantity}</td>
                          <td className="right">
                            {formatMoney(item.price, invoice.currency)}
                          </td>
                          <td className="right">
                            {formatMoney(item.amount, invoice.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="inv-print-summary-row">
                  <table className="inv-print-summary">
                    <tbody>
                      <tr>
                        <td>小計</td>
                        <td>:</td>
                        <td>
                          {formatMoney(invoice.subtotal, invoice.currency)}
                        </td>
                      </tr>
                      {(invoice.discounts || []).map((discount) => (
                        <tr
                          className="discount"
                          key={`jp-discount-${discount._id}`}
                        >
                          <td>{discount.label}</td>
                          <td>:</td>
                          <td>
                            <i>
                              {discount.type === "percentage"
                                ? `${discount.value}%`
                                : formatDeductionMoney(
                                    discount.value,
                                    invoice.currency,
                                  )}
                            </i>
                          </td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td>合計</td>
                        <td>:</td>
                        <td>{formatMoney(invoice.total, invoice.currency)}</td>
                      </tr>
                      {(invoice.payments || []).map((payment) => (
                        <tr
                          className="payment"
                          key={`jp-payment-${payment._id}`}
                        >
                          <td>
                            入金 {formatJapaneseDate(payment.paymentDate)} /{" "}
                            {payment.method}
                          </td>
                          <td>:</td>
                          <td>
                            ({formatMoney(payment.amount, invoice.currency)})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <hr className="inv-print-divider" />

                <div className="inv-print-amount-due">
                  <span>請求残額</span>
                  <strong
                    className={Number(invoice.amountDue) < 0 ? "negative" : ""}
                  >
                    {Number(invoice.amountDue) < 0
                      ? `(${formatMoney(Math.abs(invoice.amountDue), invoice.currency)})`
                      : formatMoney(invoice.amountDue, invoice.currency)}
                  </strong>
                </div>

                <PrintProjectionTable
                  projections={invoice.projections || []}
                  currency={invoice.currency}
                  labels={{
                    title: "Payment Projection",
                    no: "No",
                    description: "内容",
                    dueDate: "支払期限",
                    amount: "金額",
                    status: "Status",
                  }}
                />

                  <div className="inv-print-terms inv-print-page-break">
                  <h3>備考・条件</h3>
                  <HtmlBlock html={invoice.terms} />
                </div>
                </PrintPageFrame>
              </section>

              <section
                className={`inv-print-sheet inv-payment-receipt-sheet ${
                  printVariant === "receipt" && paymentReceiptTarget
                    ? ""
                    : "is-hidden"
                }`}
              >
                {paymentReceiptTarget ? (
                  <PrintPageFrame title="PAYMENT RECEIPT">
                    <div className="inv-receipt-body">
                      <div className="inv-receipt-title-row">
                        <div>
                          <h2>RECEIPT</h2>
                        </div>
                        <div className="inv-receipt-invoice-ref">
                          <span>Invoice</span>
                          <strong>{invoice.invoiceNumber}</strong>
                        </div>
                      </div>

                      <div className="inv-receipt-party-row">
                        <div className="inv-receipt-party-left">
                          <div>
                            <strong>To,</strong>
                            <span>{invoice.customerSnapshot?.name || "-"}</span>
                            <small>
                              {invoice.customerSnapshot?.phone || "-"}
                              {invoice.customerSnapshot?.email
                                ? ` | ${invoice.customerSnapshot.email}`
                                : ""}
                            </small>
                          </div>
                          <div>
                            <strong>Paid On,</strong>
                            <span>
                              {formatPaymentDate(
                                paymentReceiptTarget.paymentDate,
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="inv-receipt-method">
                          <strong>Payment Method</strong>
                          <p>{paymentReceiptTarget.method || "Bank"}</p>
                        </div>
                      </div>

                      <div className="inv-receipt-detail-row">
                        <div className="inv-receipt-description">
                          <strong>Description</strong>
                          <p>{paymentReceiptTarget.notes || "-"}</p>
                        </div>

                        <div className="inv-receipt-amount-box">
                          <strong>Payment Amount</strong>
                          <p>
                            {formatMoney(
                              paymentReceiptTarget.amount,
                              invoice.currency,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <p className="inv-receipt-footer">
                      Copyright © {new Date().getFullYear()}
                      <br />
                      {companyProfile.website}
                    </p>
                  </PrintPageFrame>
                ) : null}
              </section>
            </div>
            {!publicView ? <PaymentOverviewTables /> : null}
          </div>

          {!publicView ? (
            <section
              className={`inv-payment-section inv-no-print inv-tab-panel ${
                activeDetailTab === "payment" ? "" : "is-hidden"
              }`}
              id="payment"
              ref={paymentSectionRef}
            >
              <div className="inv-payment-section-head">
                <div>
                  <div
                    className="inv-section-title"
                    style={{ marginBottom: 4 }}
                  >
                    Payment
                  </div>
                  <div className="inv-sub">
                    Record pembayaran yang sudah diterima untuk invoice ini.
                  </div>
                </div>
                <div className="inv-payment-head-summary">
                  <small>amount due</small>
                  <strong>
                    {formatMoney(invoice.amountDue, invoice.currency)}
                  </strong>
                  <span>
                    {formatMoney(invoice.totalPaid, invoice.currency)}
                  </span>
                </div>
                <button
                  type="button"
                  className="inv-btn-secondary"
                  onClick={() => startPayment()}
                >
                  New Payment
                </button>
              </div>

              {addingPayment ? (
                <div className="inv-payment-modal-backdrop">
                  <div
                    className="inv-payment-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="invoice-payment-modal-title"
                  >
                    <div className="inv-payment-modal-head">
                      <h2 id="invoice-payment-modal-title">
                        {editingPaymentId ? "Edit Payment" : "Record Payment"}
                      </h2>
                      <button
                        type="button"
                        className="inv-payment-modal-close"
                        onClick={() => {
                          setAddingPayment(false);
                          resetPaymentState();
                        }}
                        aria-label="Close payment form"
                      >
                        ×
                      </button>
                    </div>

                    <div className="inv-payment-modal-body">
                      <div className="inv-grid">
                        {(invoice.projections || []).length ? (
                          <div className="inv-grid-12">
                            <label className="inv-label">
                              Untuk Cicilan/Proyeksi{" "}
                              <span className="inv-required">*</span>
                              {selectedPaymentProjection &&
                              suggestedPaymentProjection &&
                              String(selectedPaymentProjection._id) ===
                                String(suggestedPaymentProjection._id) ? (
                                <span className="inv-suggested-label">
                                  Suggested
                                </span>
                              ) : null}
                            </label>
                            <PaymentSearchSelect
                              value={paymentForm.projectionId}
                              options={projectionOptions}
                              placeholder="Search cicilan/proyeksi..."
                              emptyText="Tidak ada cicilan yang masih punya sisa."
                              onChange={selectPaymentProjection}
                            />
                            {selectedPaymentProjection ? (
                              <div className="inv-payment-target-hint">
                                <strong>
                                  Cicilan{" "}
                                  {selectedPaymentProjection.projectionIndex ||
                                    paymentForm.projectionIndex}
                                </strong>
                                <span>
                                  Sisa{" "}
                                  {formatMoney(
                                    selectedPaymentProjection.remainingAmount ??
                                      selectedPaymentProjection.amount,
                                    invoice.currency,
                                  )}
                                </span>
                                <span>
                                  Due{" "}
                                  {formatDate(
                                    selectedPaymentProjection.estimateDate,
                                  )}
                                </span>
                                {selectedPaymentProjection &&
                                suggestedPaymentProjection &&
                                String(selectedPaymentProjection._id) ===
                                  String(suggestedPaymentProjection._id) ? (
                                  <span>
                                    {getProjectionSuggestionReason(
                                      selectedPaymentProjection,
                                    )}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {editingPaymentId && currentEditingPayment?.isSplit ? (
                          <div className="inv-grid-12">
                            <div className="inv-payment-edit-alert">
                              Payment ini split transaction. Baris split di
                              bawah bisa diedit, dan total split harus tetap
                              sama dengan amount payment.
                            </div>
                          </div>
                        ) : null}
                        <div className="inv-grid-6">
                          <label className="inv-label">Payment date</label>
                          <input
                            className="inv-input"
                            type="date"
                            value={paymentForm.paymentDate}
                            onChange={(event) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                paymentDate: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="inv-grid-6">
                          <label className="inv-label">
                            Amount ({invoice.currency || "IDR"})
                          </label>
                          <input
                            className="inv-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentForm.amount}
                            onChange={(event) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                amount: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="inv-grid-12">
                          <label className="inv-label">
                            Record Account{" "}
                            <span className="inv-required">*</span>
                          </label>
                          <PaymentSearchSelect
                            value={paymentForm.accountId}
                            options={accountOptions}
                            placeholder="Search account..."
                            emptyText="Account tidak ditemukan."
                            onChange={(accountId) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                accountId,
                              }))
                            }
                          />
                        </div>
                        {!paymentSplitMode &&
                        !(editingPaymentId && currentEditingPayment?.isSplit) ? (
                          <div className="inv-grid-12">
                            <label className="inv-label">
                              Category <span className="inv-required">*</span>
                            </label>
                            <PaymentSearchSelect
                              value={
                                paymentForm.categoryId
                                  ? `${paymentForm.categoryType}|${paymentForm.categoryId}`
                                  : ""
                              }
                              options={categoryOptions}
                              placeholder="Search category..."
                              emptyText="Category tidak ditemukan."
                              onChange={selectPaymentCategory}
                            />
                          </div>
                        ) : null}
                        <div className="inv-grid-12">
                          {!paymentSplitMode ? (
                            <button
                              type="button"
                              className="inv-split-btn"
                              onClick={initPaymentSplit}
                            >
                              {editingPaymentId && currentEditingPayment?.isSplit
                                ? "Edit split transaction"
                                : "Split transaction"}
                            </button>
                          ) : (
                            <div className="inv-split-box">
                              <div className="inv-split-header">
                                <strong>Split Transaction</strong>
                                <div className="inv-split-summary">
                                  <span>
                                    Total:{" "}
                                    <strong>
                                      {formatMoney(
                                        splitUsedAmount,
                                        invoice.currency,
                                      )}
                                    </strong>
                                  </span>
                                  <span>
                                    Remaining:{" "}
                                    <strong
                                      className={
                                        Math.abs(splitRemaining) <= 0.01
                                          ? "balanced"
                                          : "unbalanced"
                                      }
                                    >
                                      {formatMoney(
                                        splitRemaining,
                                        invoice.currency,
                                      )}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                              <div className="inv-split-items">
                                {paymentSplits.map((split, index) => {
                                  const runningUsed = paymentSplits
                                    .slice(0, index)
                                    .reduce(
                                      (sum, row) =>
                                        sum + Number(row.amount || 0),
                                      0,
                                    );
                                  const maxForThis = Math.max(
                                    paymentAmount - runningUsed,
                                    0,
                                  );
                                  const currentValue = Number(split.amount || 0);
                                  const exceedsMax =
                                    currentValue > maxForThis + 0.01;

                                  return (
                                    <div className="inv-split-row" key={index}>
                                    <div>
                                      <label className="inv-label">
                                        Amount {index + 1}
                                      </label>
                                      <div className="inv-split-amount-input">
                                        <span>{paymentCurrencyPrefix}</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={split.amount}
                                          onChange={(event) =>
                                            updatePaymentSplit(index, {
                                              amount: event.target.value,
                                            })
                                          }
                                          placeholder="0"
                                        />
                                      </div>
                                      <small
                                        className={`inv-split-hint ${
                                          exceedsMax ? "warning" : ""
                                        }`}
                                      >
                                        {exceedsMax
                                          ? "Exceeds max! "
                                          : "Max: "}
                                        {formatMoney(
                                          maxForThis,
                                          invoice.currency,
                                        )}
                                      </small>
                                    </div>
                                    <div>
                                      <label className="inv-label">
                                        Category
                                      </label>
                                      <PaymentSearchSelect
                                        value={
                                          split.categoryId
                                            ? `${split.categoryType}|${split.categoryId}`
                                            : ""
                                        }
                                        options={categoryOptions}
                                        placeholder="Search category..."
                                        emptyText="Category tidak ditemukan."
                                        onChange={(value) =>
                                          updatePaymentSplitCategory(
                                            index,
                                            value,
                                          )
                                        }
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      className="inv-split-remove"
                                      onClick={() => removePaymentSplit(index)}
                                      aria-label={`Remove split ${index + 1}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                  );
                                })}
                              </div>
                              <div className="inv-split-actions">
                                <button type="button" onClick={addPaymentSplit}>
                                  Add another split
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={cancelPaymentSplit}
                                >
                                  Cancel split
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="inv-grid-6">
                          <label className="inv-label">Sender name</label>
                          <input
                            className="inv-input"
                            value={paymentForm.senderName}
                            onChange={(event) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                senderName: event.target.value,
                              }))
                            }
                            placeholder="Nama pengirim"
                          />
                        </div>
                        <div className="inv-grid-6">
                          <label className="inv-label">Payment method</label>
                          <select
                            className="inv-select"
                            value={paymentForm.method}
                            onChange={(event) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                method: event.target.value,
                              }))
                            }
                          >
                            <option value="">select one</option>
                            <option value="Bank">Bank payment</option>
                            <option value="Cash">Cash</option>
                            <option value="Transfer">Transfer</option>
                            <option value="QRIS">QRIS</option>
                            <option value="Check">Check</option>
                            <option value="CC">Credit Card</option>
                            <option value="PayPal">PayPal</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="inv-grid-12">
                          <label className="inv-label">Attachment</label>
                          <div className="inv-file-box">
                            <input
                              ref={paymentAttachmentInputRef}
                              type="file"
                              accept=".jpg,.jpeg,.png,.pdf,.heic,.tiff,.tif,.bmp,.gif"
                              onChange={(event) =>
                                handlePaymentAttachment(event.target.files?.[0])
                              }
                            />
                            {existingPaymentAttachment && !paymentAttachment ? (
                              <div className="inv-file-preview-card">
                                {canPreviewImageName(
                                  existingPaymentAttachment.fileName,
                                ) ? (
                                  <a
                                    className="inv-file-preview-image"
                                    href={getTransactionAttachmentUrl(
                                      existingPaymentAttachment.fileName,
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <img
                                      src={getTransactionAttachmentUrl(
                                        existingPaymentAttachment.fileName,
                                      )}
                                      alt={
                                        existingPaymentAttachment.originalName
                                      }
                                    />
                                    <span>View attachment</span>
                                  </a>
                                ) : (
                                  <div className="inv-file-preview-placeholder">
                                    <strong>Attachment tersimpan</strong>
                                    <span>
                                      {existingPaymentAttachment.originalName}
                                    </span>
                                  </div>
                                )}
                                <div className="inv-file-meta">
                                  <span>
                                    Attachment saat ini
                                    <small>
                                      {existingPaymentAttachment.originalName}
                                    </small>
                                  </span>
                                  <a
                                    href={getTransactionAttachmentUrl(
                                      existingPaymentAttachment.fileName,
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View
                                  </a>
                                </div>
                              </div>
                            ) : null}
                            {paymentAttachment ? (
                              <div className="inv-file-preview-card">
                                {paymentAttachmentPreviewUrl ? (
                                  <button
                                    type="button"
                                    className="inv-file-preview-image"
                                    onClick={() =>
                                      setPaymentAttachmentZoomOpen(true)
                                    }
                                  >
                                    <img
                                      src={paymentAttachmentPreviewUrl}
                                      alt={`Preview ${paymentAttachment.name}`}
                                    />
                                    <span>Click untuk zoom</span>
                                  </button>
                                ) : (
                                  <div className="inv-file-preview-placeholder">
                                    <strong>Preview tidak tersedia</strong>
                                    <span>
                                      File sudah dipilih. PDF/HEIC/TIFF tetap
                                      bisa disimpan, tapi tidak selalu bisa
                                      dipreview browser.
                                    </span>
                                  </div>
                                )}
                                <div className="inv-file-meta">
                                  <span>
                                    {paymentAttachment.name}
                                    <small>
                                      {formatFileSize(paymentAttachment.size)}
                                    </small>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={clearPaymentAttachment}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p>
                                {existingPaymentAttachment
                                  ? "Pilih file baru kalau ingin mengganti attachment."
                                  : "File maksimal 6MB: JPG, PNG, GIF, TIFF, BMP, HEIC, atau PDF."}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="inv-grid-12">
                          <label className="inv-label">Notes</label>
                          <textarea
                            className="inv-textarea"
                            value={paymentForm.notes}
                            onChange={(event) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                notes: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="inv-payment-modal-footer">
                      <button
                        type="button"
                        className="inv-btn-ghost"
                        onClick={() => {
                          setAddingPayment(false);
                          resetPaymentState();
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inv-btn"
                        onClick={submitPayment}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <PaymentRecordList />
            </section>
          ) : null}
        </>
      ) : null}
      {paymentReceiptPreview ? (
        <div className="inv-pdf-preview-backdrop inv-no-print">
          <div
            className="inv-pdf-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-payment-receipt-preview-title"
          >
            <div className="inv-pdf-preview-head">
              <div>
                <h2 id="invoice-payment-receipt-preview-title">
                  Preview Payment Receipt
                </h2>
                <span>{paymentReceiptPreview.fileName}.pdf</span>
              </div>
              <button
                type="button"
                onClick={closePaymentReceiptPreview}
                aria-label="Close payment receipt preview"
              >
                ×
              </button>
            </div>
            <iframe
              className="inv-pdf-preview-frame"
              src={paymentReceiptPreview.url}
              title="Payment receipt PDF preview"
            />
            <div className="inv-pdf-preview-actions">
              <button
                type="button"
                className="inv-btn-ghost"
                onClick={closePaymentReceiptPreview}
              >
                Close
              </button>
              <button
                type="button"
                className="inv-btn"
                onClick={downloadPaymentReceiptPreview}
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {notePreview ? (
        <div className="inv-note-modal-backdrop inv-no-print">
          <div
            className="inv-note-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-note-preview-title"
          >
            <div className="inv-note-modal-head">
              <h2 id="invoice-note-preview-title">{notePreview.title}</h2>
              <button
                type="button"
                onClick={() => setNotePreview(null)}
                aria-label="Close note preview"
              >
                ×
              </button>
            </div>
            <div className="inv-note-modal-body">{notePreview.body}</div>
          </div>
        </div>
      ) : null}
      {paymentAttachmentZoomOpen && paymentAttachmentPreviewUrl ? (
        <div
          className="inv-image-zoom-backdrop inv-no-print"
          onClick={() => setPaymentAttachmentZoomOpen(false)}
        >
          <div
            className="inv-image-zoom-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${paymentAttachment?.name || "attachment"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inv-image-zoom-head">
              <span>{paymentAttachment?.name || "Attachment preview"}</span>
              <button
                type="button"
                onClick={() => setPaymentAttachmentZoomOpen(false)}
                aria-label="Close image preview"
              >
                ×
              </button>
            </div>
            <img
              src={paymentAttachmentPreviewUrl}
              alt={`Preview ${paymentAttachment?.name || "attachment"}`}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}