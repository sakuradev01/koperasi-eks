import { Savings } from "../../models/savings.model.js";
import { Member } from "../../models/member.model.js";
import { Product } from "../../models/product.model.js";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { resolveUploadedFilePath } from "../../utils/uploadsDir.js";
import {
  createSavingsSchema,
  updateSavingsSchema,
  querySavingsSchema,
} from "../../validations/savings.validation.js";
import {
  resolveSavingsCoaInput,
  syncSavingsAccountingTransaction,
  reverseSavingsAccountingTransaction,
  normalizeObjectId,
} from "../../services/savingsAccounting.service.js";

// Get all savings
const getAllSavings = asyncHandler(async (req, res) => {
  const { error, value } = querySavingsSchema.validate(req.query);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  const { page, limit, status, memberId } = value;
  const query = {};

  if (status) query.status = status;
  if (memberId) query.memberId = memberId;

  const savings = await Savings.find(query)
    .populate("memberId", "name email phone")
    .populate("productId", "title depositAmount returnProfit termDuration")
    .populate("accountId", "accountName accountCode")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);

  const total = await Savings.countDocuments(query);

  // Calculate summary totals from ALL records (not just paginated)
  const summaryResult = await Savings.aggregate([
    { $match: { status: "Approved" } },
    {
      $group: {
        _id: "$type",
        totalAmount: { $sum: "$amount" }
      }
    }
  ]);

  const totalSetoran = summaryResult.find(s => s._id === "Setoran")?.totalAmount || 0;
  const totalPenarikan = summaryResult.find(s => s._id === "Penarikan")?.totalAmount || 0;
  const saldo = totalSetoran - totalPenarikan;

  res.status(200).json(
    new ApiResponse(200, {
      savings,
      summary: {
        totalSetoran,
        totalPenarikan,
        saldo
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    })
  );
});

// Get single savings by ID
const getSavingsById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const savings = await Savings.findById(id)
    .populate("memberId", "name email phone")
    .populate("productId");

  if (!savings) {
    throw new ApiError(404, "Data simpanan tidak ditemukan");
  }

  res.status(200).json(new ApiResponse(200, savings));
});

// Create new savings
const createSavings = asyncHandler(async (req, res) => {
  // Parse body data (handle both JSON and FormData)
  let bodyData = { ...req.body };
  
  console.log("Raw request body:", req.body);
  console.log("Request file:", req.file);
  console.log("Content-Type:", req.get('Content-Type'));
  
  // Convert string numbers to actual numbers (FormData sends everything as strings)
  Object.keys(bodyData).forEach(key => {
    if (key === 'amount' || key === 'installmentPeriod') {
      if (bodyData[key] && typeof bodyData[key] === 'string') {
        const num = Number(bodyData[key]);
        if (!isNaN(num)) {
          bodyData[key] = num;
        }
      }
    }
  });

  console.log("Processed body data:", bodyData);
  console.log("installmentPeriod:", bodyData.installmentPeriod, typeof bodyData.installmentPeriod);

  const { error, value } = createSavingsSchema.validate(bodyData);
  if (error) {
    console.log("Validation error:", error.details[0].message);
    console.log("Failed validation for:", error.details[0].path);
    console.log("Validation details:", error.details);
    throw new ApiError(400, error.details[0].message);
  }

  const {
    installmentPeriod,
    memberId,
    productId,
    amount,
    savingsDate,
    paymentDate,
    type,
    description,
    status,
    paymentType,
    notes,
    accountId,
    categoryId,
    categoryType,
    isSplit,
  } = value;

  // Validate member exists
  const member = await Member.findById(memberId);
  if (!member) {
    throw new ApiError(404, "Anggota tidak ditemukan");
  }

  // Validate product exists
  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(404, "Produk tidak ditemukan");
  }

  // Allow flexible amounts for partial payments
  // Validation removed to support partial payment system
  // if (amount < product.depositAmount) {
  //   throw new ApiError(400, `Jumlah simpanan minimal ${product.depositAmount}`);
  // }

  // Allow multiple submissions per period for partial/rejected payments
  // Check for existing approved savings for same period
  const existingApprovedSavings = await Savings.findOne({
    memberId,
    productId,
    installmentPeriod,
    status: "Approved"
  });

  // Calculate partial sequence for this period
  const existingSavingsCount = await Savings.countDocuments({
    memberId,
    productId,
    installmentPeriod,
  });

  const partialSequence = existingSavingsCount + 1;

  // Determine payment type based on amount vs product deposit
  const calculatedPaymentType = amount < product.depositAmount ? "Partial" : "Full";
  
  console.log("Product deposit amount:", product.depositAmount);
  console.log("Payment amount:", amount);
  console.log("Calculated payment type:", calculatedPaymentType);

  const savings = new Savings({
    installmentPeriod,
    memberId,
    productId,
    amount,
    savingsDate: savingsDate || new Date(),
    paymentDate: paymentDate || null,
    type: type || "Setoran",
    description: description || `Pembayaran Simpanan Periode - ${installmentPeriod} ${partialSequence > 1 ? `(#${partialSequence})` : ''}`,
    status: status || "Pending",
    paymentType: calculatedPaymentType, // Always use calculated payment type
    partialSequence: partialSequence,
    notes: notes || "",
    proofFile: req.file ? req.file.filename : null, // Only store filename, not full path
    accountId: accountId || null,
    categoryId: categoryId || null,
    categoryType: categoryType || null,
    isSplit: Boolean(isSplit),
  });

  await savings.save();

  res
    .status(201)
    .json(new ApiResponse(201, savings, "Data simpanan berhasil dibuat"));
});

// Update savings
const updateSavings = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existingSaving = await Savings.findById(id);
  if (!existingSaving) {
    throw new ApiError(404, "Data simpanan tidak ditemukan");
  }

  const bodyData = { ...req.body };
  ["amount", "installmentPeriod"].forEach((key) => {
    if (bodyData[key] !== undefined && bodyData[key] !== "") {
      const parsed = Number(bodyData[key]);
      if (!Number.isNaN(parsed)) {
        bodyData[key] = parsed;
      }
    }
  });

  if (bodyData.paymentDate === "") {
    bodyData.paymentDate = null;
  }

  const { error, value } = updateSavingsSchema.validate(bodyData);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  const updateData = { ...value };

  // Empty strings for ObjectId fields → null
  ["accountId", "categoryId", "transactionId"].forEach((key) => {
    if (updateData[key] === "") updateData[key] = null;
  });
  if (updateData.categoryType === "") updateData.categoryType = null;

  // Handle file upload jika ada
  if (req.file) {
    updateData.proofFile = req.file.filename; // Only store filename, not full path (consistent with create)
  }

  // Validasi member dan product jika diupdate
  if (updateData.memberId) {
    const member = await Member.findById(updateData.memberId);
    if (!member) {
      throw new ApiError(404, "Anggota tidak ditemukan");
    }
  }

  if (updateData.productId) {
    const product = await Product.findById(updateData.productId);
    if (!product) {
      throw new ApiError(404, "Produk tidak ditemukan");
    }
  }

  const productIdForPaymentType = updateData.productId || existingSaving.productId;
  const amountForPaymentType =
    updateData.amount !== undefined ? updateData.amount : existingSaving.amount;
  if (productIdForPaymentType && amountForPaymentType !== undefined) {
    const product = await Product.findById(productIdForPaymentType);
    if (product) {
      updateData.paymentType =
        Number(amountForPaymentType) < Number(product.depositAmount)
          ? "Partial"
          : "Full";
    }
  }

  // Persist COA fields from body when present
  const hasCoaBody =
    req.body.accountId !== undefined ||
    req.body.account_id !== undefined ||
    req.body.categoryId !== undefined ||
    req.body.category_id !== undefined ||
    req.body.categoryType !== undefined ||
    req.body.category_type !== undefined ||
    req.body.isSplit !== undefined ||
    req.body.splits !== undefined;

  let resolvedCoa = null;
  if (hasCoaBody) {
    resolvedCoa = resolveSavingsCoaInput(
      {
        accountId: req.body.accountId ?? req.body.account_id ?? existingSaving.accountId,
        categoryId:
          req.body.categoryId ?? req.body.category_id ?? existingSaving.categoryId,
        categoryType:
          req.body.categoryType ??
          req.body.category_type ??
          existingSaving.categoryType,
        isSplit: req.body.isSplit ?? existingSaving.isSplit,
        splits: req.body.splits ?? req.body.split_data,
        senderName: req.body.senderName ?? req.body.sender_name,
      },
      { requireAccount: false },
    );
    if (resolvedCoa.accountId) {
      updateData.accountId = resolvedCoa.accountId;
      updateData.categoryId = resolvedCoa.isSplit ? null : resolvedCoa.categoryId;
      updateData.categoryType = resolvedCoa.isSplit
        ? null
        : resolvedCoa.categoryType;
      updateData.isSplit = Boolean(resolvedCoa.isSplit);
    }
  }

  const previousStatus = existingSaving.status;
  const nextStatus = updateData.status || previousStatus;

  // Leaving Approved → reverse journal
  if (
    previousStatus === "Approved" &&
    nextStatus !== "Approved" &&
    existingSaving.transactionId
  ) {
    await reverseSavingsAccountingTransaction(existingSaving);
    updateData.transactionId = null;
  }

  let savings = await Savings.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("memberId", "name email phone")
    .populate("productId");

  if (!savings) {
    throw new ApiError(404, "Data simpanan tidak ditemukan");
  }

  // Approved with accountId → create/update linked AccountingTransaction
  const accountIdForSync =
    normalizeObjectId(savings.accountId) ||
    (resolvedCoa && resolvedCoa.accountId) ||
    null;

  if (savings.status === "Approved" && accountIdForSync) {
    const coaForSync =
      resolvedCoa ||
      resolveSavingsCoaInput(
        {
          accountId: savings.accountId,
          categoryId: savings.categoryId,
          categoryType: savings.categoryType,
          isSplit: savings.isSplit,
        },
        { requireAccount: true },
      );

    const transaction = await syncSavingsAccountingTransaction(savings, coaForSync);
    if (
      !savings.transactionId ||
      String(savings.transactionId) !== String(transaction._id)
    ) {
      savings.transactionId = transaction._id;
      savings.accountId = coaForSync.accountId;
      savings.categoryId = coaForSync.isSplit ? null : coaForSync.categoryId;
      savings.categoryType = coaForSync.isSplit ? null : coaForSync.categoryType;
      savings.isSplit = Boolean(coaForSync.isSplit);
      await savings.save();
    }

    savings = await Savings.findById(savings._id)
      .populate("memberId", "name email phone")
      .populate("productId")
      .populate("accountId", "accountName accountCode currency balance")
      .populate("transactionId");
  }

  res
    .status(200)
    .json(new ApiResponse(200, savings, "Data simpanan berhasil diperbarui"));
});

// Delete savings
const deleteSavings = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const savings = await Savings.findById(id);
  if (!savings) {
    throw new ApiError(404, "Data simpanan tidak ditemukan");
  }

  // Reverse linked accounting transaction if any
  if (savings.transactionId || savings.status === "Approved") {
    await reverseSavingsAccountingTransaction(savings);
  }

  // Delete proof file if exists
  if (savings.proofFile) {
    try {
      const fs = await import("fs");
      const filePath = resolveUploadedFilePath(savings.proofFile, {
        defaultSubdir: "simpanan",
      });

      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Continue with deletion even if file removal fails
    }
  }

  await Savings.findByIdAndDelete(id);

  res.status(200).json(new ApiResponse(200, null, "Simpanan dan bukti berhasil dihapus"));
});

// Get savings by member
const getSavingsByMember = asyncHandler(async (req, res) => {
  const { error, value } = querySavingsSchema.validate(req.query);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  const { memberId } = req.params;
  const { page, limit } = value;

  const savings = await Savings.find({ memberId })
    .populate("memberId", "name email phone")
    .populate("productId", "title depositAmount returnProfit termDuration")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);

  const total = await Savings.countDocuments({ memberId });

  // Calculate total savings
  const approvedSavings = await Savings.find({
    memberId,
    status: "Approved",
    type: "Setoran",
  });
  const approvedWithdrawals = await Savings.find({
    memberId,
    status: "Approved",
    type: "Penarikan",
  });

  const totalSavings = approvedSavings.reduce((sum, s) => sum + s.amount, 0);
  const totalWithdrawals = approvedWithdrawals.reduce(
    (sum, s) => sum + s.amount,
    0
  );
  const balance = totalSavings - totalWithdrawals;

  res.status(200).json(
    new ApiResponse(200, {
      savings,
      summary: {
        totalSavings,
        totalWithdrawals,
        balance,
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    })
  );
});

// Get savings summary
const getSavingsSummary = asyncHandler(async (req, res) => {
  const { error, value } = querySavingsSchema.validate(req.query);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  const { memberId } = value;
  const matchQuery = { status: "Approved" };
  if (memberId) matchQuery.memberId = memberId;

  const savings = await Savings.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$type",
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalSavings =
    savings.find((s) => s._id === "Setoran")?.totalAmount || 0;
  const totalWithdrawals =
    savings.find((s) => s._id === "Penarikan")?.totalAmount || 0;
  const balance = totalSavings - totalWithdrawals;

  res.status(200).json(
    new ApiResponse(200, {
      totalSavings,
      totalWithdrawals,
      balance,
    })
  );
});

// Get last installment period for member and product
const getLastInstallmentPeriod = asyncHandler(async (req, res) => {
  const { memberId, productId } = req.params;

  if (!memberId || !productId) {
    return res.status(400).json({
      success: false,
      message: "Member ID dan Product ID wajib diisi"
    });
  }

  try {
    // Get member with upgrade info
    const member = await Member.findById(memberId)
      .populate({
        path: "currentUpgradeId",
        populate: [
          { path: "oldProductId", select: "title depositAmount" },
          { path: "newProductId", select: "title depositAmount" }
        ]
      });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member tidak ditemukan"
      });
    }

    // Get product info for deposit amount
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product tidak ditemukan"
      });
    }

    // Determine the expected amount first based on upgrade status
    let baseExpectedAmount = product.depositAmount;
    
    // Check if member has upgraded
    if (member.hasUpgraded && member.currentUpgradeId) {
      // For upgraded members, we need to check period-specific amounts
      baseExpectedAmount = product.depositAmount; // Will be adjusted per period
    }
    
    // Check for incomplete periods (only count approved payments)
    // Don't filter by productId - we want ALL approved payments for this member
    // This properly handles upgrades and product changes
    let matchQuery = {
      memberId: new mongoose.Types.ObjectId(memberId),
      status: "Approved", // Only count approved payments
      type: "Setoran" // Only count deposits, not withdrawals
    };
    
    // Note: We intentionally don't filter by productId here
    // This allows us to see ALL periods the member has paid for,
    // regardless of which product they were using at the time
    
    const incompletePeriods = await Savings.aggregate([
      {
        $match: matchQuery
      },
      {
        $group: {
          _id: "$installmentPeriod",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Filter incomplete periods based on the correct required amount for each period
    const actualIncompletePeriods = [];
    
    console.log("=== Incomplete Periods Debug ===");
    console.log("Member has upgraded:", member.hasUpgraded);
    console.log("Periods with payments:", incompletePeriods);
    
    for (const period of incompletePeriods) {
      let requiredForThisPeriod = product.depositAmount;
      
      if (member.hasUpgraded && member.currentUpgradeId) {
        if (period._id <= member.currentUpgradeId.completedPeriodsAtUpgrade) {
          requiredForThisPeriod = member.currentUpgradeId.oldMonthlyDeposit;
          console.log(`Period ${period._id}: Using old amount ${requiredForThisPeriod} (before upgrade)`);
        } else {
          requiredForThisPeriod = member.currentUpgradeId.newPaymentWithCompensation;
          console.log(`Period ${period._id}: Using new amount with compensation ${requiredForThisPeriod} (after upgrade)`);
        }
      } else {
        console.log(`Period ${period._id}: Using standard amount ${requiredForThisPeriod}`);
      }
      
      console.log(`Period ${period._id}: Total paid = ${period.totalAmount}, Required = ${requiredForThisPeriod}`);
      
      if (period.totalAmount < requiredForThisPeriod) {
        actualIncompletePeriods.push({
          ...period,
          requiredAmount: requiredForThisPeriod,
          remainingAmount: requiredForThisPeriod - period.totalAmount
        });
        console.log(`Period ${period._id} is incomplete, remaining: ${requiredForThisPeriod - period.totalAmount}`);
      }
    }
    
    console.log("Actual incomplete periods:", actualIncompletePeriods);

    // FIRST: Get the highest completed period across ALL products
    // This is the ACTUAL last completed period
    const highestPeriodResult = await Savings.aggregate([
      {
        $match: {
          memberId: new mongoose.Types.ObjectId(memberId),
          status: "Approved",
          type: "Setoran"
        }
      },
      {
        $group: {
          _id: null,
          maxPeriod: { $max: "$installmentPeriod" }
        }
      }
    ]);
    
    const actualLastCompletedPeriod = highestPeriodResult.length > 0 
      ? highestPeriodResult[0].maxPeriod 
      : 0;
    
    console.log("Actual highest approved period:", actualLastCompletedPeriod);

    let suggestedPeriod;
    let isPartialPayment = false;
    let remainingAmount = 0;
    let targetAmountForPeriod = 0;

    if (actualIncompletePeriods.length > 0) {
      // Use the first incomplete period
      const incompletePeriod = actualIncompletePeriods[0];
      suggestedPeriod = incompletePeriod._id;
      isPartialPayment = true;
      remainingAmount = incompletePeriod.remainingAmount;
      targetAmountForPeriod = incompletePeriod.requiredAmount;
      
      console.log(`Suggesting incomplete period ${suggestedPeriod} with remaining ${remainingAmount}`);
    } else {
      // Suggest the next period after the last completed one
      suggestedPeriod = actualLastCompletedPeriod + 1;
      
      console.log("=== Period Calculation Debug ===");
      console.log("Member ID:", memberId);
      console.log("Product ID:", productId);
      console.log("Has Upgraded:", member.hasUpgraded);
      console.log("Last Completed Period:", actualLastCompletedPeriod);
      console.log("Suggested Period:", suggestedPeriod);
    }

    // Build query for transactions - get ALL transactions for this member
    // Don't filter by productId to handle upgrades properly
    let transactionQuery = {
      memberId: new mongoose.Types.ObjectId(memberId)
    };

    // Get pending transactions for this member/product
    const pendingTransactions = await Savings.find({
      ...transactionQuery,
      status: "Pending",
      type: "Setoran"
    }).select("installmentPeriod amount description createdAt").sort({ installmentPeriod: 1 });

    // Get rejected transactions with reasons
    const rejectedTransactions = await Savings.find({
      ...transactionQuery,
      status: "Rejected",
      type: "Setoran"
    }).select("installmentPeriod rejectionReason createdAt").sort({ installmentPeriod: 1 });

    // Get all transactions summary for tooltip
    const allTransactions = await Savings.find({
      ...transactionQuery,
      type: "Setoran"
    })
      .select("installmentPeriod amount status createdAt rejectionReason productId")
      .sort({ installmentPeriod: 1, createdAt: 1 });

    console.log(`Found ${allTransactions.length} total transactions for member ${memberId}`);
    console.log("Transaction periods:", allTransactions.map(t => ({
      period: t.installmentPeriod,
      status: t.status,
      amount: t.amount,
      productId: t.productId
    })));

    // Group transactions by period for tooltip
    const transactionsByPeriod = {};
    allTransactions.forEach(tx => {
      if (!transactionsByPeriod[tx.installmentPeriod]) {
        transactionsByPeriod[tx.installmentPeriod] = [];
      }
      transactionsByPeriod[tx.installmentPeriod].push({
        amount: tx.amount,
        status: tx.status,
        date: tx.createdAt,
        rejectionReason: tx.rejectionReason || null
      });
    });

    // Calculate expected amount based on upgrade status
    let expectedAmount = product.depositAmount;
    let hasUpgrade = false;
    let upgradeInfo = null;

    // If there's a partial payment, expected amount is the remaining amount
    if (isPartialPayment) {
      expectedAmount = remainingAmount;
      console.log(`Partial payment detected. Expected amount = remaining amount: ${expectedAmount}`);
    } else {
      // For new periods, calculate based on upgrade status
      if (member.hasUpgraded && member.currentUpgradeId) {
        hasUpgrade = true;
        upgradeInfo = member.currentUpgradeId;
        
        console.log("Calculating expected amount for upgraded member:");
        console.log("Suggested Period:", suggestedPeriod);
        console.log("Completed Periods at Upgrade:", upgradeInfo.completedPeriodsAtUpgrade);
        
        // If the next period is within the completed periods at upgrade, use old amount
        // Otherwise, use new amount with compensation
        if (suggestedPeriod <= upgradeInfo.completedPeriodsAtUpgrade) {
          expectedAmount = upgradeInfo.oldMonthlyDeposit;
          console.log("Using old amount:", expectedAmount);
        } else {
          expectedAmount = upgradeInfo.newPaymentWithCompensation;
          console.log("Using new amount with compensation:", expectedAmount);
        }
      }
    }
    
    // Set upgrade info if member has upgraded
    if (member.hasUpgraded && member.currentUpgradeId) {
      hasUpgrade = true;
      upgradeInfo = member.currentUpgradeId;
    }

    res.status(200).json({
      success: true,
      data: {
        lastPeriod: actualLastCompletedPeriod,
        nextPeriod: suggestedPeriod,
        isPartialPayment,
        remainingAmount,
        depositAmount: product.depositAmount,
        expectedAmount,
        hasUpgrade,
        upgradeInfo: hasUpgrade ? {
          oldMonthlyDeposit: upgradeInfo.oldMonthlyDeposit,
          newMonthlyDeposit: upgradeInfo.newMonthlyDeposit,
          compensationPerMonth: upgradeInfo.compensationPerMonth,
          newPaymentWithCompensation: upgradeInfo.newPaymentWithCompensation,
          completedPeriodsAtUpgrade: upgradeInfo.completedPeriodsAtUpgrade
        } : null,
        incompletePeriods: actualIncompletePeriods.map(p => ({
          period: p._id,
          paidAmount: p.totalAmount,
          remainingAmount: p.requiredAmount - p.totalAmount
        })),
        pendingTransactions: pendingTransactions,
        rejectedTransactions: rejectedTransactions,
        transactionsByPeriod: transactionsByPeriod
      },
      message: "Periode cicilan berhasil didapatkan"
    });
  } catch (error) {
    console.error("Error in getLastInstallmentPeriod:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mendapatkan periode cicilan terakhir",
      error: error.message
    });
  }
});

// Get student dashboard savings by member UUID
const getStudentDashboardSavings = asyncHandler(async (req, res) => {
  const { memberUuid } = req.params;

  if (!memberUuid) {
    throw new ApiError(400, "Member UUID wajib diisi");
  }

  // Find member by UUID
  const member = await Member.findOne({ uuid: memberUuid }).populate(
    "productId"
  );

  if (!member) {
    throw new ApiError(404, "Kamu belum menjadi bagian dari anggota koperasi");
  }

  if (!member.productId) {
    throw new ApiError(
      404,
      "Member belum memiliki produk simpanan yang dipilih"
    );
  }

  // Get product details (tenor/term duration)
  const product = member.productId;

  // Get deposit history for this member
  const depositHistory = await Savings.find({
    memberId: member._id,
    type: "Setoran",
    status: "Approved",
  }).select("installmentPeriod amount proofFile");

  // Map deposit history by installment period
  const realizationAmountMap = {};
  const realizationProofFileMap = {};

  depositHistory.forEach((deposit) => {
    realizationAmountMap[deposit.installmentPeriod] = deposit.amount;
    realizationProofFileMap[deposit.installmentPeriod] = deposit.proofFile || 0;
  });

  // Generate projection data for all periods
  const delivered = [];
  
  // Gunakan savingsStartDate jika ada, kalau tidak pakai tanggal member dibuat
  const startDate = member.savingsStartDate 
    ? new Date(member.savingsStartDate) 
    : new Date(member.createdAt);

  for (let i = 1; i <= product.termDuration; i++) {
    // Calculate date projection dari startDate + (i-1) bulan
    const projectionDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + (i - 1),
      1
    );
    const dateProjection = projectionDate.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    delivered.push({
      installment_period: i,
      projection: product.depositAmount.toString(),
      dateProjection: dateProjection,
      realization: realizationAmountMap[i]
        ? realizationAmountMap[i].toString()
        : 0,
      payment_proof: realizationProofFileMap[i] || 0,
    });
  }

  res.status(200).json(delivered);
});

export {
  getAllSavings,
  getSavingsById,
  createSavings,
  updateSavings,
  deleteSavings,
  getSavingsByMember,
  getSavingsSummary,
  getLastInstallmentPeriod,
  getStudentDashboardSavings,
};
