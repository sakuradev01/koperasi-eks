import api from "./index.jsx";

export const getInvoiceProjectionReport = async (params) => {
  const response = await api.get("/api/admin/reports/invoice-projections", { params });
  return response.data?.data || response.data;
};
