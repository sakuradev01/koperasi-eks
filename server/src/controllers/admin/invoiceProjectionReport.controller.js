import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createGetInvoiceProjectionReport,
} from "../../modules/invoice-projections/application/getInvoiceProjectionReport.js";
import {
  invoiceProjectionReportRepository,
} from "../../modules/invoice-projections/infrastructure/mongooseInvoiceProjectionReportRepository.js";

const getReport = createGetInvoiceProjectionReport({
  repository: invoiceProjectionReportRepository,
});

export const getInvoiceProjectionReport = asyncHandler(async (req, res) => {
  let report;
  try {
    report = await getReport(req.query);
  } catch (error) {
    if (error instanceof RangeError) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    throw error;
  }

  return res
    .status(200)
    .json(new ApiResponse(200, report, "Laporan proyeksi invoice berhasil dimuat."));
});
