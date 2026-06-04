import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { getMembers } from "../../api/accountingApi.jsx";
import {
  createInvoice,
  getInvoice,
  getInvoiceMeta,
  updateInvoice,
  validateInvoiceNumber,
} from "../../api/invoiceApi.jsx";
import {
  createInvoiceProduct,
  getInvoiceProducts,
} from "../../api/invoiceProductApi.jsx";
import { getTosList } from "../../api/tosApi.jsx";
import RichTextEditor from "./RichTextEditor.jsx";
import "./invoice.css";

const formatMoney = (amount, currency = "IDR") => {
  const locale = currency === "IDR" ? "id-ID" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "IDR" ? 0 : 2,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(Number(amount || 0));
};

const normalizeNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseMoneyInput = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value)
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!raw) return "";

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/\./g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeMoney = (value) => normalizeNumber(parseMoneyInput(value));

const formatMoneyInput = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(normalizeMoney(value));
};

const toDateInput = (value) => {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
};

const addMonthsToDateInput = (value, months = 1) => {
  const source = value ? new Date(value) : new Date();
  if (Number.isNaN(source.getTime())) return toDateInput(new Date());
  source.setMonth(source.getMonth() + months);
  return toDateInput(source);
};

const emptyItem = () => ({
  productId: "",
  title: "",
  description: "",
  quantity: 1,
  price: 0,
});
const emptyDiscount = () => ({ label: "", type: "fixed", value: 0 });
const emptyProjection = (date = "") => ({
  description: "",
  estimateDate: date,
  amount: 0,
});

const INVOICE_DRAFT_KEY = "koperasi_invoice_create_draft_v1";

const emptyProductForm = () => ({
  title: "",
  price: "",
  description: "",
});

function MoneyInput({ value, onChange, placeholder = "0" }) {
  return (
    <input
      className="inv-input"
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={formatMoneyInput(value)}
      onChange={(event) => onChange(parseMoneyInput(event.target.value))}
    />
  );
}

const getMemberLabel = (member) => {
  if (!member) return "";
  return [member.name, member.uuid ? `• ${member.uuid}` : ""]
    .filter(Boolean)
    .join(" ");
};

const getMemberSearchValue = (member) =>
  [
    member?.name,
    member?.uuid,
    member?.email,
    member?.phone,
    member?.completeAddress,
    member?.product?.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const getProductLabel = (product) => {
  if (!product) return "";
  return product.title || "Untitled product";
};

const getProductSearchValue = (product) =>
  [product?.title, product?.description, product?.price]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLowerCase();

function CustomerCombobox({ members, value, onChange }) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedMember = useMemo(
    () =>
      members.find((member) => String(member._id) === String(value)) || null,
    [members, value],
  );

  useEffect(() => {
    if (isOpen) return;
    setSearch(selectedMember ? getMemberLabel(selectedMember) : "");
  }, [isOpen, selectedMember]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedLabel = selectedMember
      ? getMemberLabel(selectedMember).toLowerCase()
      : "";

    if (!query || query === selectedLabel) return members.slice(0, 30);

    return members
      .filter((member) => getMemberSearchValue(member).includes(query))
      .slice(0, 30);
  }, [members, search, selectedMember]);

  const selectMember = (member) => {
    onChange(member._id);
    setSearch(getMemberLabel(member));
    setIsOpen(false);
  };

  return (
    <div
      className="inv-combobox"
      onBlur={() => {
        window.setTimeout(() => setIsOpen(false), 120);
      }}
    >
      <input
        className="inv-input inv-combobox-input"
        value={search}
        placeholder="Search nama, UUID, email, atau nomor HP..."
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setIsOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (filteredMembers[0]) selectMember(filteredMembers[0]);
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
          aria-label="Clear customer"
        >
          ×
        </button>
      ) : null}

      {isOpen ? (
        <div className="inv-combobox-menu">
          {filteredMembers.length ? (
            filteredMembers.map((member) => (
              <button
                type="button"
                key={member._id}
                className={`inv-combobox-option ${
                  String(member._id) === String(value) ? "active" : ""
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectMember(member);
                }}
              >
                <span className="inv-combobox-name">{member.name}</span>
                <span className="inv-combobox-meta">
                  {member.uuid || "-"} {member.phone ? `• ${member.phone}` : ""}
                </span>
                <span className="inv-combobox-meta">
                  {member.email || "-"}{" "}
                  {member.product?.title ? `• ${member.product.title}` : ""}
                </span>
              </button>
            ))
          ) : (
            <div className="inv-combobox-empty">
              Tidak ada anggota yang cocok.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ProductCombobox({ products, value, onSelect, onClear }) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedProduct = useMemo(
    () =>
      products.find((product) => String(product._id) === String(value)) || null,
    [products, value],
  );

  useEffect(() => {
    if (isOpen) return;
    setSearch(selectedProduct ? getProductLabel(selectedProduct) : "");
  }, [isOpen, selectedProduct]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedLabel = selectedProduct
      ? getProductLabel(selectedProduct).toLowerCase()
      : "";
    const visibleProducts = products.filter(
      (product) =>
        product.archived !== true || String(product._id) === String(value),
    );

    if (!query || query === selectedLabel) return visibleProducts.slice(0, 30);

    return visibleProducts
      .filter((product) => getProductSearchValue(product).includes(query))
      .slice(0, 30);
  }, [products, search, selectedProduct, value]);

  const selectProduct = (product) => {
    onSelect(product);
    setSearch(getProductLabel(product));
    setIsOpen(false);
  };

  return (
    <div
      className="inv-combobox"
      onBlur={() => {
        window.setTimeout(() => setIsOpen(false), 120);
      }}
    >
      <input
        className="inv-input inv-combobox-input"
        value={search}
        placeholder="Search product invoice..."
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setIsOpen(true);
          if (value) onClear();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (filteredProducts[0]) selectProduct(filteredProducts[0]);
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
            onClear();
            setSearch("");
            setIsOpen(true);
          }}
          aria-label="Clear product"
        >
          ×
        </button>
      ) : null}

      {isOpen ? (
        <div className="inv-combobox-menu">
          {filteredProducts.length ? (
            filteredProducts.map((product) => (
              <button
                type="button"
                key={product._id}
                className={`inv-combobox-option ${
                  String(product._id) === String(value) ? "active" : ""
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectProduct(product);
                }}
              >
                <span className="inv-combobox-name">
                  {getProductLabel(product)}
                </span>
                <span className="inv-combobox-meta">
                  Harga {formatMoney(product.price || 0)}{" "}
                  {product.archived ? " • Archived" : ""}
                </span>
                {product.description ? (
                  <span className="inv-combobox-meta">
                    {product.description}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="inv-combobox-empty">
              Tidak ada product yang cocok.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { invoiceNumber } = useParams();
  const isEdit = Boolean(invoiceNumber);
  const today = new Date().toISOString().slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [tosTemplates, setTosTemplates] = useState([]);
  const [currencies, setCurrencies] = useState([
    "IDR",
    "JPY",
    "USD",
    "AUD",
    "EUR",
    "GBP",
  ]);
  const [invoiceNumberLocked, setInvoiceNumberLocked] = useState(false);
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState(
    invoiceNumber || "",
  );
  const [form, setForm] = useState({
    invoiceNumber: "",
    memberId: "",
    salesCode: "",
    issuedDate: today,
    dueDate: today,
    currency: "IDR",
    exchangeRate: 1,
    notes: "",
    terms: "",
    tosId: "",
    termsTitle: "",
  });
  const [items, setItems] = useState([emptyItem()]);
  const [discounts, setDiscounts] = useState([emptyDiscount()]);
  const [projections, setProjections] = useState([emptyProjection(today)]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState(emptyProductForm());
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [invoiceNumberCheck, setInvoiceNumberCheck] = useState({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [membersRes, productsRes, metaRes, invoiceRes, tosRes] =
          await Promise.all([
            getMembers(),
            getInvoiceProducts({ filter: "all" }),
            getInvoiceMeta({ issuedDate: today }),
            isEdit ? getInvoice(invoiceNumber) : Promise.resolve(null),
            getTosList({ filter: "active" }),
          ]);

        if (membersRes?.success) {
          setMembers(
            [...(membersRes.data || [])].sort((a, b) =>
              String(a.name || "").localeCompare(String(b.name || "")),
            ),
          );
        }
        if (metaRes?.success) {
          setCurrencies(metaRes.data?.currencies || currencies);
        }
        if (productsRes?.success) {
          setProducts(
            [...(productsRes.data?.invoiceProducts || [])].sort((a, b) =>
              String(a.title || "").localeCompare(String(b.title || "")),
            ),
          );
        }
        if (tosRes?.success) {
          setTosTemplates(tosRes.data?.tos || []);
        }

        if (isEdit) {
          if (!invoiceRes?.success)
            throw new Error(invoiceRes?.message || "Failed to load invoice");
          const invoice = invoiceRes.data;
          setOriginalInvoiceNumber(invoice.invoiceNumber);
          setForm({
            invoiceNumber: invoice.invoiceNumber || "",
            memberId: invoice.memberId || "",
            salesCode: invoice.salesCode || "",
            issuedDate: toDateInput(invoice.issuedDate),
            dueDate: toDateInput(invoice.dueDate),
            currency: invoice.currency || "IDR",
            exchangeRate: invoice.exchangeRate || 1,
            notes: invoice.notes || "",
            terms: invoice.terms || "",
            tosId: invoice.tosId || "",
            termsTitle: invoice.termsTitle || "",
          });
          setItems(
            (invoice.items || []).length
              ? invoice.items.map((item) => ({
                  productId: item.productId?._id || item.productId || "",
                  title: item.title || "",
                  description: item.description || "",
                  quantity: item.quantity || 1,
                  price: item.price || 0,
                }))
              : [emptyItem()],
          );
          setDiscounts(
            (invoice.discounts || []).length
              ? (invoice.discounts || []).map((discount) => ({
                  label: discount.label || "",
                  type: discount.type || "fixed",
                  value:
                    discount.type === "percentage"
                      ? discount.value || 0
                      : discount.amount || discount.value || 0,
                }))
              : [emptyDiscount()],
          );
          setProjections(
            (invoice.projections || []).length
              ? invoice.projections.map((projection) => ({
                  _id: projection._id || "",
                  description: projection.description || "",
                  estimateDate: toDateInput(projection.estimateDate),
                  amount: projection.amount || 0,
                }))
              : [emptyProjection(toDateInput(invoice.dueDate))],
          );
        } else {
          const savedDraft = (() => {
            try {
              return JSON.parse(localStorage.getItem(INVOICE_DRAFT_KEY) || "null");
            } catch {
              return null;
            }
          })();

          if (savedDraft?.form) {
            setForm({
              ...savedDraft.form,
              invoiceNumber:
                savedDraft.form.invoiceNumber ||
                metaRes?.data?.nextInvoiceNumber ||
                "",
              issuedDate: savedDraft.form.issuedDate || today,
              dueDate: savedDraft.form.dueDate || today,
              currency: savedDraft.form.currency || "IDR",
              exchangeRate: savedDraft.form.exchangeRate || 1,
            });
            setItems(
              Array.isArray(savedDraft.items) && savedDraft.items.length
                ? savedDraft.items
                : [emptyItem()],
            );
            setDiscounts(
              Array.isArray(savedDraft.discounts) &&
                savedDraft.discounts.length
                ? savedDraft.discounts
                : [emptyDiscount()],
            );
            setProjections(
              Array.isArray(savedDraft.projections) &&
                savedDraft.projections.length
                ? savedDraft.projections
                : [emptyProjection(today)],
            );
            toast.info("Draft invoice terakhir dipulihkan dari browser.");
          } else {
            setForm((prev) => ({
              ...prev,
              invoiceNumber:
                metaRes?.data?.nextInvoiceNumber || prev.invoiceNumber,
            }));
          }
        }
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err.message ||
            "Failed to load form references",
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [invoiceNumber, isEdit, today]);

  useEffect(() => {
    if (isEdit || loading) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        INVOICE_DRAFT_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          form,
          items,
          discounts,
          projections,
        }),
      );
    }, 300);

    return () => window.clearTimeout(timer);
  }, [discounts, form, isEdit, items, loading, projections]);

  useEffect(() => {
    if (isEdit || invoiceNumberLocked || !form.issuedDate) return;

    let ignore = false;
    getInvoiceMeta({ issuedDate: form.issuedDate })
      .then((res) => {
        if (!ignore && res?.success) {
          setForm((prev) => ({
            ...prev,
            invoiceNumber: res.data?.nextInvoiceNumber || prev.invoiceNumber,
          }));
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [form.issuedDate, invoiceNumberLocked, isEdit]);

  useEffect(() => {
    const invoiceNumberValue = String(form.invoiceNumber || "")
      .trim()
      .toUpperCase();

    if (!invoiceNumberValue) {
      setInvoiceNumberCheck({ status: "idle", message: "" });
      return;
    }

    if (
      isEdit &&
      originalInvoiceNumber &&
      invoiceNumberValue === String(originalInvoiceNumber).toUpperCase()
    ) {
      setInvoiceNumberCheck({
        status: "available",
        message: "Nomor invoice saat ini.",
      });
      return;
    }

    let ignore = false;
    setInvoiceNumberCheck({
      status: "checking",
      message: "Mengecek nomor invoice...",
    });

    const timer = window.setTimeout(() => {
      validateInvoiceNumber({
        invoiceNumber: invoiceNumberValue,
        exclude: isEdit ? originalInvoiceNumber : "",
      })
        .then((res) => {
          if (ignore) return;
          const available = Boolean(res?.data?.available);
          setInvoiceNumberCheck({
            status: available ? "available" : "duplicate",
            message: available
              ? "Nomor invoice bisa dipakai."
              : "Nomor invoice sudah dipakai.",
          });
        })
        .catch(() => {
          if (!ignore) {
            setInvoiceNumberCheck({
              status: "error",
              message: "Gagal mengecek nomor invoice.",
            });
          }
        });
    }, 350);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [form.invoiceNumber, isEdit, originalInvoiceNumber]);

  const selectedMember = useMemo(
    () =>
      members.find((member) => String(member._id) === String(form.memberId)) ||
      null,
    [members, form.memberId],
  );

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + normalizeNumber(item.quantity) * normalizeNumber(item.price),
        0,
      ),
    [items],
  );

  const normalizedDiscounts = useMemo(() => {
    let runningTotal = subtotal;

    return discounts.map((discount, index) => {
      const value =
        discount.type === "percentage"
          ? normalizeNumber(discount.value)
          : normalizeMoney(discount.value);
      const amount =
        discount.type === "percentage" ? (runningTotal * value) / 100 : value;

      runningTotal = Math.max(runningTotal - amount, 0);

      return {
        ...discount,
        label: discount.label || `Discount ${index + 1}`,
        value,
        amount,
      };
    });
  }, [discounts, subtotal]);

  const discountTotal = useMemo(
    () =>
      normalizedDiscounts.reduce(
        (sum, discount) => sum + normalizeNumber(discount.amount),
        0,
      ),
    [normalizedDiscounts],
  );

  const total = normalizedDiscounts.reduce(
    (runningTotal, discount) => Math.max(runningTotal - discount.amount, 0),
    subtotal,
  );
  const projectionTotal = useMemo(
    () =>
      projections.reduce((sum, item) => sum + normalizeMoney(item.amount), 0),
    [projections],
  );
  const expectedReceiveIDR = total * (normalizeNumber(form.exchangeRate) || 1);
  const invoiceNumberBlocked = ["checking", "duplicate"].includes(
    invoiceNumberCheck.status,
  );

  const setItemValue = (index, key, value) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const setItemProduct = (index, product) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              productId: product?._id || "",
              title: product?.title || item.title,
              description: product?.description || item.description,
              price: product?.price !== undefined ? product.price : item.price,
            }
          : item,
      ),
    );
  };

  const setDiscountValue = (index, key, value) => {
    setDiscounts((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const setProjectionValue = (index, key, value) => {
    setProjections((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const addProjectionRow = () => {
    setProjections((prev) => {
      const nextIndex = prev.length + 1;
      const lastDate =
        [...prev].reverse().find((projection) => projection.estimateDate)
          ?.estimateDate || form.dueDate;
      const nextAmount = prev.length
        ? normalizeMoney(prev[prev.length - 1].amount)
        : 0;

      return [
        ...prev,
        {
          ...emptyProjection(addMonthsToDateInput(lastDate, prev.length ? 1 : 0)),
          description: `Cicilan ${nextIndex}`,
          amount: nextAmount,
        },
      ];
    });
  };

  const normalizeProjectionRows = () => {
    const rows = projections.map((projection, index) => ({
      _id: projection._id || undefined,
      description: projection.description || `Cicilan ${index + 1}`,
      estimateDate: projection.estimateDate,
      amount: normalizeMoney(projection.amount),
    }));

    const invalidIndex = rows.findIndex(
      (projection) => !projection.estimateDate || projection.amount <= 0,
    );
    if (invalidIndex >= 0) {
      throw new Error(
        `Projection #${invalidIndex + 1} belum lengkap. Isi tanggal dan amount, atau hapus row tersebut.`,
      );
    }

    return rows;
  };

  const buildPayload = () => ({
    invoiceNumber: form.invoiceNumber,
    memberId: form.memberId,
    salesCode: form.salesCode,
    issuedDate: form.issuedDate,
    dueDate: form.dueDate,
    currency: form.currency,
    exchangeRate: normalizeNumber(form.exchangeRate) || 1,
    items: items.map((item) => ({
      productId: item.productId || null,
      title: item.title,
      description: item.description,
      quantity: normalizeNumber(item.quantity),
      price: normalizeMoney(item.price),
    })),
    discounts: discounts
      .map((discount, index) => ({
        label: discount.label || `Discount ${index + 1}`,
        type: discount.type,
        value:
          discount.type === "percentage"
            ? normalizeNumber(discount.value)
            : normalizeMoney(discount.value),
      }))
      .filter((discount) => discount.value > 0),
    projections: normalizeProjectionRows(),
    notes: form.notes,
    terms: form.terms,
    tosId: form.tosId,
    termsTitle: form.termsTitle,
  });

  const submitForm = async (statusTarget) => {
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        ...buildPayload(),
        status: statusTarget,
      };

      if (!payload.memberId) {
        throw new Error("Customer anggota wajib dipilih.");
      }
      if (invoiceNumberCheck.status === "duplicate") {
        throw new Error("Nomor invoice sudah dipakai.");
      }
      if (invoiceNumberCheck.status === "checking") {
        throw new Error("Tunggu validasi nomor invoice selesai.");
      }
      if (!payload.items.some((item) => item.title && item.quantity > 0)) {
        throw new Error("Minimal 1 item invoice wajib diisi.");
      }

      const response = isEdit
        ? await updateInvoice(originalInvoiceNumber, payload)
        : await createInvoice(payload);

      if (!response?.success) {
        throw new Error(response?.message || "Failed to save invoice");
      }

      toast.success(isEdit ? "Invoice updated" : "Invoice created");
      if (!isEdit) {
        localStorage.removeItem(INVOICE_DRAFT_KEY);
      }
      navigate(
        `/invoice/${response.data?.invoiceNumber || payload.invoiceNumber}`,
      );
    } catch (err) {
      setError(
        err?.response?.data?.message || err.message || "Failed to save invoice",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitProductShortcut = async () => {
    setCreatingProduct(true);
    try {
      const payload = {
        title: productForm.title,
        price: normalizeMoney(productForm.price),
        description: productForm.description,
      };
      const response = await createInvoiceProduct(payload);
      if (!response?.success) {
        throw new Error(response?.message || "Failed to create product");
      }

      const newProduct = response.data;
      setProducts((prev) =>
        [...prev, newProduct].sort((a, b) =>
          String(a.title || "").localeCompare(String(b.title || "")),
        ),
      );
      setItems((prev) => {
        const targetIndex = prev.findIndex(
          (item) => !item.productId && !item.title,
        );
        const index = targetIndex >= 0 ? targetIndex : prev.length;
        const next = targetIndex >= 0 ? [...prev] : [...prev, emptyItem()];
        next[index] = {
          ...next[index],
          productId: newProduct._id || "",
          title: newProduct.title || "",
          description: newProduct.description || "",
          price: newProduct.price || 0,
        };
        return next;
      });
      setProductForm(emptyProductForm());
      setShowProductModal(false);
      toast.success("Product invoice dibuat dan dipilih ke item.");
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err.message ||
          "Failed to create product",
      );
    } finally {
      setCreatingProduct(false);
    }
  };

  return (
    <div className="inv-page">
      <div className="inv-card inv-header">
        <div>
          <h1>
            {isEdit ? `Edit Invoice ${originalInvoiceNumber}` : "New Invoice"}
          </h1>
          <div className="inv-sub">
            Bentuk invoice koperasi yang mengikuti alur invoice di samitbank.
          </div>
        </div>
        <div className="inv-actions">
          <button
            type="button"
            className="inv-btn-ghost"
            onClick={() =>
              navigate(
                isEdit ? `/invoice/${originalInvoiceNumber}` : "/invoice",
              )
            }
          >
            Back
          </button>
        </div>
      </div>

      {error ? <div className="inv-error">{error}</div> : null}
      {loading ? (
        <div className="inv-card inv-sub">Loading invoice form...</div>
      ) : null}

      {!loading ? (
        <div className="inv-grid">
          <div className="inv-grid-8">
            <div className="inv-card">
              <div className="inv-section-title">Customer</div>
              <div className="inv-grid">
                <div className="inv-grid-12">
                  <label className="inv-label">Anggota</label>
                  <CustomerCombobox
                    members={members}
                    value={form.memberId}
                    onChange={(memberId) =>
                      setForm((prev) => ({
                        ...prev,
                        memberId,
                      }))
                    }
                  />
                </div>
              </div>
              {selectedMember ? (
                <div className="inv-customer-card" style={{ marginTop: 12 }}>
                  <div className="inv-customer-name">{selectedMember.name}</div>
                  <div className="inv-customer-meta">
                    {selectedMember.uuid || "-"}
                  </div>
                  <div className="inv-customer-meta">
                    {selectedMember.phone || "-"} •{" "}
                    {selectedMember.email || "-"}
                  </div>
                  <div className="inv-customer-meta">
                    {selectedMember.completeAddress || "Alamat belum diisi"}
                  </div>
                  <div className="inv-customer-meta">
                    Produk: {selectedMember.product?.title || "-"}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="inv-card">
              <div className="inv-section-title">Invoice Information</div>
              <div className="inv-grid">
                <div className="inv-grid-6">
                  <label className="inv-label">Invoice Number</label>
                  <input
                    className={`inv-input ${
                      invoiceNumberCheck.status === "duplicate"
                        ? "is-invalid"
                        : invoiceNumberCheck.status === "available"
                          ? "is-valid"
                          : ""
                    }`}
                    value={form.invoiceNumber}
                    onChange={(event) => {
                      setInvoiceNumberLocked(true);
                      setForm((prev) => ({
                        ...prev,
                        invoiceNumber: event.target.value.toUpperCase(),
                      }));
                    }}
                  />
                  {invoiceNumberCheck.message ? (
                    <div
                      className={`inv-field-hint ${invoiceNumberCheck.status}`}
                    >
                      {invoiceNumberCheck.message}
                    </div>
                  ) : null}
                </div>
                <div className="inv-grid-6">
                  <label className="inv-label">Sales Code</label>
                  <input
                    className="inv-input"
                    value={form.salesCode}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        salesCode: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="inv-grid-4">
                  <label className="inv-label">Issued Date</label>
                  <input
                    className="inv-input"
                    type="date"
                    value={form.issuedDate}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        issuedDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="inv-grid-4">
                  <label className="inv-label">Due Date</label>
                  <input
                    className="inv-input"
                    type="date"
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="inv-grid-2">
                  <label className="inv-label">Currency</label>
                  <select
                    className="inv-select"
                    value={form.currency}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        currency: event.target.value,
                      }))
                    }
                  >
                    {currencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="inv-grid-2">
                  <label className="inv-label">Exchange Rate</label>
                  <input
                    className="inv-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.exchangeRate}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        exchangeRate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="inv-card">
              <div
                className="inv-inline-actions"
                style={{ justifyContent: "space-between", marginBottom: 10 }}
              >
                <div className="inv-section-title" style={{ marginBottom: 0 }}>
                  Items
                </div>
                <button
                  type="button"
                  className="inv-btn-secondary"
                  onClick={() => setItems((prev) => [...prev, emptyItem()])}
                >
                  Add Item
                </button>
                <button
                  type="button"
                  className="inv-btn-secondary"
                  onClick={() => setShowProductModal(true)}
                >
                  Tambah Product Baru
                </button>
              </div>
              <div className="inv-page">
                {items.map((item, index) => (
                  <div key={`item-${index}`} className="inv-line-card">
                    <div className="inv-line-top">
                      <div
                        className="inv-section-title"
                        style={{ marginBottom: 0 }}
                      >
                        Item {index + 1}
                      </div>
                      {items.length > 1 ? (
                        <button
                          type="button"
                          className="inv-remove"
                          onClick={() =>
                            setItems((prev) =>
                              prev.filter((_, idx) => idx !== index),
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="inv-grid">
                      <div className="inv-grid-12">
                        <label className="inv-label">Product</label>
                        <ProductCombobox
                          products={products}
                          value={item.productId}
                          onSelect={(product) => setItemProduct(index, product)}
                          onClear={() => setItemValue(index, "productId", "")}
                        />
                        <div className="inv-money-hint">
                          Pilih dari sidebar Product Invoice. Title,
                          description, dan price tetap bisa diedit manual
                          setelah dipilih.
                        </div>
                      </div>
                      <div className="inv-grid-6">
                        <label className="inv-label">Title</label>
                        <input
                          className="inv-input"
                          value={item.title}
                          onChange={(event) =>
                            setItemValue(index, "title", event.target.value)
                          }
                        />
                      </div>
                      <div className="inv-grid-2">
                        <label className="inv-label">Quantity</label>
                        <input
                          className="inv-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(event) =>
                            setItemValue(index, "quantity", event.target.value)
                          }
                        />
                      </div>
                      <div className="inv-grid-4">
                        <label className="inv-label">Price</label>
                        <MoneyInput
                          value={item.price}
                          onChange={(value) =>
                            setItemValue(index, "price", value)
                          }
                        />
                        <div className="inv-money-hint">
                          Amount:{" "}
                          {formatMoney(
                            normalizeNumber(item.quantity) *
                              normalizeMoney(item.price),
                            form.currency,
                          )}
                        </div>
                      </div>
                      <div className="inv-grid-12">
                        <label className="inv-label">Description</label>
                        <textarea
                          className="inv-textarea"
                          value={item.description}
                          onChange={(event) =>
                            setItemValue(
                              index,
                              "description",
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="inv-card">
              <div
                className="inv-inline-actions"
                style={{ justifyContent: "space-between", marginBottom: 10 }}
              >
                <div className="inv-section-title" style={{ marginBottom: 0 }}>
                  Discounts
                </div>
                <button
                  type="button"
                  className="inv-btn-secondary"
                  onClick={() =>
                    setDiscounts((prev) => [...prev, emptyDiscount()])
                  }
                >
                  Add Discount
                </button>
              </div>
              <div className="inv-page">
                {discounts.map((discount, index) => (
                  <div key={`discount-${index}`} className="inv-line-card">
                    <div className="inv-line-top">
                      <div
                        className="inv-section-title"
                        style={{ marginBottom: 0 }}
                      >
                        Discount {index + 1}
                      </div>
                      {discounts.length > 1 ? (
                        <button
                          type="button"
                          className="inv-remove"
                          onClick={() =>
                            setDiscounts((prev) =>
                              prev.filter((_, idx) => idx !== index),
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="inv-grid">
                      <div className="inv-grid-6">
                        <label className="inv-label">Label</label>
                        <input
                          className="inv-input"
                          value={discount.label}
                          onChange={(event) =>
                            setDiscountValue(index, "label", event.target.value)
                          }
                        />
                      </div>
                      <div className="inv-grid-3">
                        <label className="inv-label">Type</label>
                        <select
                          className="inv-select"
                          value={discount.type}
                          onChange={(event) =>
                            setDiscountValue(index, "type", event.target.value)
                          }
                        >
                          <option value="fixed">Fixed</option>
                          <option value="percentage">Percentage</option>
                        </select>
                      </div>
                      <div className="inv-grid-3">
                        <label className="inv-label">
                          {discount.type === "percentage"
                            ? "Percent"
                            : "Amount"}
                        </label>
                        {discount.type === "percentage" ? (
                          <input
                            className="inv-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={discount.value}
                            onChange={(event) =>
                              setDiscountValue(
                                index,
                                "value",
                                event.target.value,
                              )
                            }
                          />
                        ) : (
                          <MoneyInput
                            value={discount.value}
                            onChange={(value) =>
                              setDiscountValue(index, "value", value)
                            }
                          />
                        )}
                        <div className="inv-money-hint">
                          Potongan:{" "}
                          {formatMoney(
                            normalizedDiscounts[index]?.amount || 0,
                            form.currency,
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="inv-card">
              <div
                className="inv-inline-actions"
                style={{ justifyContent: "space-between", marginBottom: 10 }}
              >
                <div className="inv-section-title" style={{ marginBottom: 0 }}>
                  Payment Projection
                </div>
                <button
                  type="button"
                  className="inv-btn-secondary"
                  onClick={addProjectionRow}
                >
                  Add Projection
                </button>
              </div>
              <div className="inv-table-wrap">
                <table className="inv-table inv-projection-edit-table">
                  <thead>
                    <tr>
                      <th style={{ width: "38%" }}>Description</th>
                      <th style={{ width: "22%" }}>Estimate Date</th>
                      <th className="right" style={{ width: "26%" }}>
                        Amount
                      </th>
                      <th className="center" style={{ width: "14%" }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projections.map((projection, index) => (
                      <tr key={projection._id || `projection-${index}`}>
                        <td>
                          <select
                            className="inv-select"
                            value={projection.description}
                            onChange={(event) =>
                              setProjectionValue(
                                index,
                                "description",
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Custom / pilih cicilan</option>
                            {Array.from({ length: 36 }, (_, itemIndex) => {
                              const label = `Cicilan ${itemIndex + 1}`;
                              return (
                                <option key={label} value={label}>
                                  {label}
                                </option>
                              );
                            })}
                            {projection.description &&
                            !/^Cicilan \d+$/.test(projection.description) ? (
                              <option value={projection.description}>
                                {projection.description}
                              </option>
                            ) : null}
                          </select>
                          <input
                            className="inv-input"
                            style={{ marginTop: 6 }}
                            value={projection.description}
                            onChange={(event) =>
                              setProjectionValue(
                                index,
                                "description",
                                event.target.value,
                              )
                            }
                            placeholder={`Cicilan ${index + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            className="inv-input"
                            type="date"
                            value={projection.estimateDate}
                            onChange={(event) =>
                              setProjectionValue(
                                index,
                                "estimateDate",
                                event.target.value,
                              )
                            }
                          />
                        </td>
                        <td>
                          <MoneyInput
                            value={projection.amount}
                            onChange={(value) =>
                              setProjectionValue(index, "amount", value)
                            }
                          />
                        </td>
                        <td className="center">
                          {projections.length > 1 ? (
                            <button
                              type="button"
                              className="inv-mini-danger"
                              onClick={() =>
                                setProjections((prev) =>
                                  prev.filter((_, idx) => idx !== index),
                                )
                              }
                            >
                              Delete
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2">Total Projection</td>
                      <td className="right">
                        {formatMoney(
                          projections.reduce(
                            (sum, item) => sum + normalizeMoney(item.amount),
                            0,
                          ),
                          form.currency,
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="inv-card">
              <div className="inv-section-title">Notes & Terms</div>
              <div className="inv-grid">
                <div className="inv-grid-6">
                  <label className="inv-label">Notes</label>
                  <RichTextEditor
                    value={form.notes}
                    placeholder="Tulis personal note invoice..."
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        notes: value,
                      }))
                    }
                  />
                </div>
                <div className="inv-grid-6">
                  <label className="inv-label">Term of Services Template</label>
                  <select
                    className="inv-select"
                    value={form.tosId}
                    onChange={(event) => {
                      const selected = tosTemplates.find(
                        (item) => item._id === event.target.value,
                      );
                      setForm((prev) => ({
                        ...prev,
                        tosId: selected?._id || "",
                        termsTitle: selected?.title || "",
                        terms: selected?.content || prev.terms,
                      }));
                    }}
                  >
                    <option value="">Select ToS Templates</option>
                    {tosTemplates.map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                  <label className="inv-label" style={{ marginTop: 12 }}>
                    Note/Term of Services
                  </label>
                  <RichTextEditor
                    value={form.terms}
                    placeholder="Tulis term of services..."
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        terms: value,
                        tosId: "",
                        termsTitle: "",
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="inv-grid-4">
            <div className="inv-summary-box">
              <div className="inv-section-title">Summary</div>
              <div className="inv-summary-row">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, form.currency)}</span>
              </div>
              <div className="inv-summary-row">
                <span>Total Discount</span>
                <span>{formatMoney(discountTotal, form.currency)}</span>
              </div>
              <div className="inv-summary-row total">
                <strong>Total</strong>
                <strong>{formatMoney(total, form.currency)}</strong>
              </div>
              <div className="inv-summary-row">
                <span>Total Projection</span>
                <span>
                  {formatMoney(
                    projections.reduce(
                      (sum, item) => sum + normalizeMoney(item.amount),
                      0,
                    ),
                    form.currency,
                  )}
                </span>
              </div>
              <div className="inv-summary-row">
                <span>Exchange Rate</span>
                <span>{normalizeNumber(form.exchangeRate) || 1}</span>
              </div>
              <div className="inv-summary-row">
                <span>Expected Receive (IDR)</span>
                <span>{formatMoney(expectedReceiveIDR, "IDR")}</span>
              </div>
              <div className="inv-inline-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="inv-btn-ghost"
                  disabled={submitting || invoiceNumberBlocked}
                  onClick={() => submitForm("draft")}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  className="inv-btn"
                  disabled={submitting || invoiceNumberBlocked}
                  onClick={() => submitForm("sent")}
                >
                  Save & Send
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showProductModal ? (
        <div className="inv-note-modal-backdrop inv-no-print">
          <div
            className="inv-product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-product-shortcut-title"
          >
            <div className="inv-note-modal-head">
              <h2 id="invoice-product-shortcut-title">
                Tambah Product Invoice
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowProductModal(false);
                  setProductForm(emptyProductForm());
                }}
                aria-label="Close product modal"
              >
                ×
              </button>
            </div>
            <div className="inv-product-modal-body">
              <label className="inv-label">Product Name</label>
              <input
                className="inv-input"
                value={productForm.title}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                placeholder="Nama product invoice"
              />
              <label className="inv-label">Price</label>
              <MoneyInput
                value={productForm.price}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, price: value }))
                }
              />
              <label className="inv-label">Description</label>
              <textarea
                className="inv-textarea"
                value={productForm.description}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="Deskripsi product"
              />
            </div>
            <div className="inv-payment-modal-footer">
              <button
                type="button"
                className="inv-btn-ghost"
                onClick={() => {
                  setShowProductModal(false);
                  setProductForm(emptyProductForm());
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inv-btn"
                disabled={creatingProduct}
                onClick={submitProductShortcut}
              >
                {creatingProduct ? "Saving..." : "Save Product"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
