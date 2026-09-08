import { DonationCampaign } from "../../models/donationCampaign.model.js";
import { Donation } from "../../models/donation.model.js";
import { Member } from "../../models/member.model.js";
import { Product } from "../../models/product.model.js";
import { Savings } from "../../models/savings.model.js";
import { CheckoutIntent } from "../../models/checkoutIntent.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { buildStudentDonationCode, maskStudentName } from "../../utils/donation.js";
import { calculateSavingsSchedule, PAID_SAVINGS_STATUSES } from "../../services/savingsSchedule.service.js";

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getPreferredCampaign() {
  return (
    (await DonationCampaign.findOne({ isActive: true }).sort({ collectUntil: -1 }).lean()) ||
    (await DonationCampaign.findOne().sort({ createdAt: -1 }).lean())
  );
}

async function getMemberSnapshot(studentUuid) {
  const member = await Member.findOne({ uuid: studentUuid })
    .populate("productId")
    .populate("currentUpgradeId")
    .lean();
  return member || null;
}

function buildDonationFeedItem(donation, currentStudentUuid = "") {
  const ownDonation = donation.studentUuid === currentStudentUuid;
  return {
    id: donation._id,
    donationCode: donation.donationCode,
    studentCode: donation.studentCode,
    studentName: ownDonation ? donation.studentName : maskStudentName(donation.studentName),
    amount: donation.amount,
    paymentMethod: donation.paymentMethod,
    status: donation.status,
    source: donation.source,
    createdAt: donation.createdAt,
    campaignTitle: donation.campaignTitle,
    beneficiaryName: donation.beneficiaryName,
    invoiceNumber: ownDonation ? donation.invoiceNumber : "",
  };
}

export const getDonationOverview = asyncHandler(async (req, res) => {
  const studentUuid = String(req.params.studentUuid || req.query.studentUuid || "").trim();
  if (!studentUuid) {
    throw new ApiError(400, "UUID student wajib diisi");
  }

  const studentCode = buildStudentDonationCode(studentUuid);
  const currentCampaign = await getPreferredCampaign();

  const campaignQuery = currentCampaign?._id ? { campaignId: currentCampaign._id } : {};

  const [myDonations, publicFeed, totals, campaignRecap] = await Promise.all([
    Donation.find({ studentUuid })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    Donation.find({ ...campaignQuery, status: "Approved" })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    Donation.aggregate([
      {
        $group: {
          _id: null,
          totalApprovedAmount: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, "$amount", 0] } },
          totalApprovedCount: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] } },
        },
      },
    ]),
    Donation.aggregate([
      {
        $group: {
          _id: "$campaignId",
          totalApprovedAmount: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, "$amount", 0] } },
          totalApprovedCount: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const campaigns = await DonationCampaign.find().sort({ isActive: -1, collectUntil: -1 }).limit(10).lean();
  const recapByCampaign = new Map(campaignRecap.map((item) => [String(item._id || "null"), item]));

  const myTotalApproved = myDonations
    .filter((item) => item.status === "Approved")
    .reduce((sum, item) => sum + item.amount, 0);

  res.status(200).json(
    new ApiResponse(200, {
      studentCode,
      currentCampaign,
      totals: {
        totalApprovedAmount: totals[0]?.totalApprovedAmount || 0,
        totalApprovedCount: totals[0]?.totalApprovedCount || 0,
        myTotalApproved,
        myTotalCount: myDonations.length,
      },
      myDonations: myDonations.map((item) => buildDonationFeedItem(item, studentUuid)),
      publicFeed: publicFeed.map((item) => buildDonationFeedItem(item, studentUuid)),
      campaigns: campaigns.map((campaign) => {
        const recap = recapByCampaign.get(String(campaign._id)) || {};
        return {
          ...campaign,
          totalApprovedAmount: recap.totalApprovedAmount || 0,
          totalApprovedCount: recap.totalApprovedCount || 0,
        };
      }),
    })
  );
});

export const createDonation = asyncHandler(async (req, res) => {
  const {
    studentUuid,
    studentName,
    amount,
    description = "",
    notes = "",
    paymentDate,
    source = "donation_page",
    installmentPeriod,
  } = req.body;

  const normalizedStudentUuid = String(studentUuid || "").trim();
  const normalizedStudentName = String(studentName || "").trim();
  const normalizedAmount = Number(amount);

  if (!normalizedStudentUuid || !normalizedStudentName) {
    throw new ApiError(400, "UUID dan nama student wajib diisi");
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new ApiError(400, "Jumlah donasi tidak valid");
  }

  const campaign = await DonationCampaign.findOne({ isActive: true }).sort({ collectUntil: -1 });
  if (!campaign) {
    throw new ApiError(400, "Belum ada campaign donasi aktif");
  }

  const member = await getMemberSnapshot(normalizedStudentUuid);

  const donation = await Donation.create({
    studentUuid: normalizedStudentUuid,
    studentName: normalizedStudentName,
    studentCode: buildStudentDonationCode(normalizedStudentUuid),
    memberId: member?._id || null,
    campaignId: campaign._id,
    campaignTitle: campaign.title,
    beneficiaryName: campaign.beneficiaryName,
    amount: normalizedAmount,
    paymentMethod: "Manual",
    source: source === "savings_payment" ? "savings_payment" : "donation_page",
    status: "Pending",
    description: String(description || "").trim(),
    notes: String(notes || "").trim(),
    proofFile: req.file ? req.file.filename : "",
    paymentDate: normalizeDate(paymentDate),
    installmentPeriod: installmentPeriod ? Number(installmentPeriod) : null,
  });

  res.status(201).json(
    new ApiResponse(201, donation, "Donasi berhasil diajukan dan menunggu verifikasi admin")
  );
});

export const createCheckoutIntent = asyncHandler(async (req, res) => {
  const {
    invoiceNumber,
    studentUuid,
    studentName = "",
    installmentPeriod,
    projectionAmount = 0,
    alreadyPaidAmount = 0,
    savingsAmount = 0,
    donationAmount = 0,
    chargedAmount,
    adminFee = 0,
    paymentContext = "savings",
    source = "savings_payment",
  } = req.body;

  if (!invoiceNumber || !studentUuid || !chargedAmount) {
    throw new ApiError(400, "Invoice, UUID student, dan total charge wajib diisi");
  }

  const normalizedSavings = Number(savingsAmount) || 0;
  const normalizedDonation = Number(donationAmount) || 0;
  const normalizedCharge = Number(chargedAmount) || 0;
  const normalizedAdminFee = Number(adminFee) || 0;

  if (normalizedCharge <= 0) {
    throw new ApiError(400, "Total charge tidak valid");
  }

  if (normalizedSavings < 0 || normalizedDonation < 0 || normalizedAdminFee < 0) {
    throw new ApiError(400, "Nominal checkout tidak valid");
  }

  const expectedTotal = normalizedSavings + normalizedDonation + normalizedAdminFee;
  if (expectedTotal !== normalizedCharge) {
    throw new ApiError(400, "Breakdown checkout tidak sesuai total pembayaran");
  }

  let campaign = null;
  if (normalizedDonation > 0) {
    campaign = await DonationCampaign.findOne({ isActive: true }).sort({ collectUntil: -1 });
    if (!campaign) {
      throw new ApiError(400, "Belum ada campaign donasi aktif");
    }
  }

  const member = await getMemberSnapshot(String(studentUuid).trim());
  let normalizedProjection = Number(projectionAmount) || 0;
  let normalizedPaidBefore = Number(alreadyPaidAmount) || 0;

  // For savings/mixed checkout, target and remaining must be resolved from the
  // member's current product and accepted transactions. Client-provided target
  // and already-paid values are preview-only and cannot define a charge.
  if (normalizedSavings > 0) {
    if (!member?.productId) {
      throw new ApiError(404, "Member belum memiliki produk simpanan");
    }

    const paidSavings = await Savings.find({
      memberId: member._id,
      type: "Setoran",
      status: { $in: PAID_SAVINGS_STATUSES },
    }).lean();
    const product = member.productId?._id
      ? member.productId
      : await Product.findById(member.productId).lean();
    const schedule = calculateSavingsSchedule({
      termDuration: product?.termDuration,
      baseDeposit: product?.depositAmount,
      upgrade: member.currentUpgradeId,
      savings: paidSavings,
    });
    const period = schedule.periods.find(
      (item) => item.period === Number(installmentPeriod),
    );

    if (!period) {
      throw new ApiError(400, "Periode simpanan tidak valid");
    }
    if (period.isFullyPaid || period.remaining <= 0) {
      throw new ApiError(409, `Periode ${period.period} sudah lunas`);
    }
    if (normalizedSavings > period.remaining) {
      throw new ApiError(
        400,
        `Nominal simpanan melebihi sisa periode. Maksimal Rp${period.remaining.toLocaleString("id-ID")}`,
      );
    }

    normalizedProjection = period.effectiveTarget;
    normalizedPaidBefore = period.paid;
  }

  const normalizedInvoiceNumber = String(invoiceNumber).trim();
  const existingIntent = await CheckoutIntent.findOne({ invoiceNumber: normalizedInvoiceNumber });
  if (existingIntent?.status === "Paid") {
    throw new ApiError(409, "Checkout intent ini sudah diproses");
  }
  if (existingIntent?.status === "Processing") {
    throw new ApiError(409, "Checkout intent ini sedang diproses");
  }

  const intent = await CheckoutIntent.findOneAndUpdate(
    { invoiceNumber: normalizedInvoiceNumber },
    {
      invoiceNumber: normalizedInvoiceNumber,
      studentUuid: String(studentUuid).trim(),
      studentName: String(studentName || "").trim(),
      memberId: member?._id || null,
      campaignId: campaign?._id || null,
      installmentPeriod: installmentPeriod ? Number(installmentPeriod) : null,
      projectionAmount: normalizedProjection,
      alreadyPaidAmount: normalizedPaidBefore,
      savingsAmount: normalizedSavings,
      donationAmount: normalizedDonation,
      chargedAmount: normalizedCharge,
      adminFee: normalizedAdminFee,
      paymentContext,
      source,
      paymentMethod: "DOKU_CHECKOUT",
      status: "Pending",
      processedAt: null,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  );

  res.status(201).json(new ApiResponse(201, intent, "Checkout intent berhasil disimpan"));
});
