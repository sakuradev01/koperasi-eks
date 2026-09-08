import { ProductUpgrade } from "../../models/productUpgrade.model.js";
import { Member } from "../../models/member.model.js";
import { Product } from "../../models/product.model.js";
import { Savings } from "../../models/savings.model.js";
import {
  calculateSavingsSchedule,
  PAID_SAVINGS_STATUSES,
} from "../../services/savingsSchedule.service.js";

class UpgradeCalculationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const buildUpgradeCalculation = ({ member, newProduct, savings }) => {
  if (!member?.productId || !member.product) {
    throw new UpgradeCalculationError(400, "Member belum memiliki produk simpanan");
  }

  if (member.hasUpgraded) {
    throw new UpgradeCalculationError(400, "Member sudah pernah melakukan upgrade produk");
  }

  if (!newProduct) {
    throw new UpgradeCalculationError(404, "Produk baru tidak ditemukan");
  }

  const oldMonthlyDeposit = Number(member.product.depositAmount) || 0;
  const newMonthlyDeposit = Number(newProduct.depositAmount) || 0;
  if (newMonthlyDeposit <= oldMonthlyDeposit) {
    throw new UpgradeCalculationError(
      400,
      "Produk baru harus memiliki setoran yang lebih tinggi dari produk saat ini",
    );
  }

  const schedule = calculateSavingsSchedule({
    termDuration: member.product.termDuration,
    baseDeposit: oldMonthlyDeposit,
    savings,
  });

  let completedPeriods = 0;
  for (const period of schedule.periods) {
    if (!period.isFullyPaid) break;
    completedPeriods += 1;
  }

  const remainingPeriods = schedule.termDuration - completedPeriods;
  if (remainingPeriods <= 0) {
    throw new UpgradeCalculationError(
      400,
      "Member sudah menyelesaikan seluruh periode simpanan",
    );
  }

  const depositDifference = newMonthlyDeposit - oldMonthlyDeposit;
  const compensationPerMonth = Math.ceil(
    (depositDifference * completedPeriods) / remainingPeriods,
  );
  const newPaymentWithCompensation = newMonthlyDeposit + compensationPerMonth;

  return {
    memberId: member._id,
    memberName: member.name,
    memberUuid: member.uuid,
    oldProductId: member.productId,
    oldProductTitle: member.product.title,
    oldMonthlyDeposit,
    newProductId: newProduct._id,
    newProductTitle: newProduct.title,
    newMonthlyDeposit,
    completedPeriodsAtUpgrade: completedPeriods,
    remainingPeriods,
    compensationPerMonth,
    newPaymentWithCompensation,
    totalPeriods: schedule.termDuration,
  };
};

const loadUpgradeInputs = async (memberId, newProductId) => {
  const member = await Member.findById(memberId).populate("product");
  if (!member) throw new UpgradeCalculationError(404, "Member tidak ditemukan");

  const newProduct = await Product.findById(newProductId);
  if (!newProduct) throw new UpgradeCalculationError(404, "Produk baru tidak ditemukan");

  const savings = await Savings.find({
    memberId: member._id,
    productId: member.productId,
    type: "Setoran",
    status: { $in: PAID_SAVINGS_STATUSES },
  }).lean();

  return { member, newProduct, savings };
};

// Calculate compensation for product upgrade
export const calculateUpgradeCompensation = async (req, res) => {
  try {
    const { memberId, newProductId } = req.body;

    // Validasi input
    if (!memberId || !newProductId) {
      return res.status(400).json({
        success: false,
        message: "Member ID dan Product ID baru harus diisi"
      });
    }

    const { member, newProduct, savings } = await loadUpgradeInputs(memberId, newProductId);
    const calculationResult = buildUpgradeCalculation({ member, newProduct, savings });

    return res.status(200).json({
      success: true,
      message: "Kalkulasi kompensasi berhasil",
      data: calculationResult
    });

  } catch (error) {
    if (error instanceof UpgradeCalculationError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Error calculating upgrade compensation:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat menghitung kompensasi",
      error: error.message
    });
  }
};

export const executeProductUpgrade = async (req, res) => {
  try {
    const { memberId, newProductId } = req.body;

    // Validasi input
    if (!memberId || !newProductId) {
      return res.status(400).json({
        success: false,
        message: "Member ID dan product baru wajib diisi",
      });
    }

    // Selalu hitung ulang dari database. calculationResult dari browser hanya
    // untuk preview dan tidak boleh menjadi sumber nilai pembukuan.
    const { member, newProduct, savings } = await loadUpgradeInputs(memberId, newProductId);
    const calculationResult = buildUpgradeCalculation({ member, newProduct, savings });

    // Buat record ProductUpgrade
    const productUpgrade = await ProductUpgrade.create({
      memberId: member._id,
      oldProductId: member.productId,
      newProductId: newProduct._id,
      upgradeDate: new Date(),
      completedPeriodsAtUpgrade: calculationResult.completedPeriodsAtUpgrade,
      oldMonthlyDeposit: calculationResult.oldMonthlyDeposit,
      newMonthlyDeposit: calculationResult.newMonthlyDeposit,
      compensationPerMonth: calculationResult.compensationPerMonth,
      newPaymentWithCompensation: calculationResult.newPaymentWithCompensation,
      status: "ACTIVE",
    });

    // Pastikan upgradeHistory array
    if (!Array.isArray(member.upgradeHistory)) {
      member.upgradeHistory = [];
    }

    try {
      // Update Member. Roll back the just-created upgrade document if the
      // member write fails, so a half-created upgrade is not left behind.
      member.hasUpgraded = true;
      member.currentUpgradeId = productUpgrade._id;
      member.upgradeHistory.push(productUpgrade._id);
      member.productId = newProduct._id;
      await member.save();
    } catch (saveError) {
      await ProductUpgrade.deleteOne({ _id: productUpgrade._id }).catch(() => {});
      throw saveError;
    }

    // Populate buat response
    const populatedUpgrade = await ProductUpgrade.findById(productUpgrade._id)
      .populate("memberId", "uuid name")
      .populate("oldProductId", "title depositAmount")
      .populate("newProductId", "title depositAmount");

    return res.status(201).json({
      success: true,
      message: "Upgrade produk berhasil dilakukan",
      data: populatedUpgrade,
    });
  } catch (error) {
    if (error instanceof UpgradeCalculationError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Error executing product upgrade:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat melakukan upgrade produk",
      error: error.message,
    });
  }
};


// Get upgrade history for a member
export const getMemberUpgradeHistory = async (req, res) => {
  try {
    const { memberId } = req.params;

    const upgrades = await ProductUpgrade
      .find({ memberId, status: "ACTIVE" })
      .populate("oldProductId", "title depositAmount")
      .populate("newProductId", "title depositAmount")
      .sort({ upgradeDate: -1 });

    return res.status(200).json({
      success: true,
      data: upgrades
    });

  } catch (error) {
    console.error("Error fetching upgrade history:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat mengambil riwayat upgrade",
      error: error.message
    });
  }
};

export const cancelProductUpgrade = async (req, res) => {
  try {
    const { upgradeId } = req.params;

    const upgrade = await ProductUpgrade.findById(upgradeId);
    if (!upgrade) {
      return res.status(404).json({
        success: false,
        message: "Upgrade tidak ditemukan",
      });
    }

    if (upgrade.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Upgrade sudah dibatalkan sebelumnya",
      });
    }

    const postUpgradeSaving = await Savings.exists({
      memberId: upgrade.memberId,
      productId: upgrade.newProductId,
      type: "Setoran",
      createdAt: { $gte: upgrade.upgradeDate },
      status: { $in: PAID_SAVINGS_STATUSES },
    });
    if (postUpgradeSaving) {
      return res.status(409).json({
        success: false,
        message: "Upgrade tidak dapat dibatalkan karena sudah ada pembayaran setelah upgrade",
      });
    }

    // Update status upgrade
    upgrade.status = "CANCELLED";
    await upgrade.save();

    // Revert member changes
    const member = await Member.findById(upgrade.memberId);
    if (member) {
      member.productId = upgrade.oldProductId;
      member.hasUpgraded = false;
      member.currentUpgradeId = null;

      if (!Array.isArray(member.upgradeHistory)) {
        member.upgradeHistory = [];
      }

      member.upgradeHistory = member.upgradeHistory.filter(
        (id) => !id.equals(upgrade._id)
      );

      await member.save();
    }

    return res.status(200).json({
      success: true,
      message: "Upgrade berhasil dibatalkan",
    });
  } catch (error) {
    console.error("Error cancelling upgrade:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat membatalkan upgrade",
      error: error.message,
    });
  }
};
