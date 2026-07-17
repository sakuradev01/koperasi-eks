import axios from "axios";
import api from "./index.jsx";
import { API_URL } from "./config";

const publicApi = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const getInvoiceMeta = async (params = {}) => {
  const response = await api.get("/api/admin/invoices/meta", { params });
  return response.data;
};

export const validateInvoiceNumber = async (params = {}) => {
  const response = await api.get("/api/admin/invoices/validate-number", {
    params,
  });
  return response.data;
};

export const getInvoices = async (params = {}) => {
  const response = await api.get("/api/admin/invoices", { params });
  return response.data;
};

export const exportInvoices = async (params = {}) => {
  const response = await api.get("/api/admin/invoices/export", {
    params,
    responseType: "blob",
  });
  return response;
};

export const getInvoice = async (invoiceNumber) => {
  const response = await api.get(
    `/api/admin/invoices/${encodeURIComponent(invoiceNumber)}`,
  );
  return response.data;
};

export const getPublicInvoice = async (invoiceNumber) => {
  const response = await publicApi.get(
    `/api/public/invoices/${encodeURIComponent(invoiceNumber)}`,
  );
  return response.data;
};

export const createInvoice = async (payload) => {
  const response = await api.post("/api/admin/invoices", payload);
  return response.data;
};

export const updateInvoice = async (invoiceNumber, payload) => {
  const response = await api.put(
    `/api/admin/invoices/${encodeURIComponent(invoiceNumber)}`,
    payload,
  );
  return response.data;
};

export const approveInvoiceDraft = async (invoiceNumber) => {
  const response = await api.patch(
    `/api/admin/invoices/${encodeURIComponent(invoiceNumber)}/approve`,
  );
  return response.data;
};

export const deleteInvoice = async (invoiceNumber) => {
  const response = await api.delete(
    `/api/admin/invoices/${encodeURIComponent(invoiceNumber)}`,
  );
  return response.data;
};

export const addInvoicePayment = async (invoiceNumber, payload) => {
  const response = await api.post(
    `/api/admin/invoices/${encodeURIComponent(invoiceNumber)}/payments`,
    payload,
    {
      headers:
        payload instanceof FormData
          ? { "Content-Type": "multipart/form-data" }
          : {},
    },
  );
  return response.data;
};

export const updateInvoicePayment = async (invoiceNumber, paymentId, payload) => {
  const response = await api.put(
    `/api/admin/invoices/${encodeURIComponent(invoiceNumber)}/payments/${encodeURIComponent(paymentId)}`,
    payload,
    {
      headers:
        payload instanceof FormData
          ? { "Content-Type": "multipart/form-data" }
          : {},
    },
  );
  return response.data;
};

export const deleteInvoicePayment = async (invoiceNumber, paymentId) => {
  const response = await api.delete(
    `/api/admin/invoices/${encodeURIComponent(invoiceNumber)}/payments/${encodeURIComponent(paymentId)}`,
  );
  return response.data;
};
