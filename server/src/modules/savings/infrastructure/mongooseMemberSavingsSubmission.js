import fs from "fs/promises";
import { Member } from "../../../models/member.model.js";
import { Product } from "../../../models/product.model.js";
import { Savings } from "../../../models/savings.model.js";
import { createMongooseWithdrawalRepository } from "../../savings-withdrawal/infrastructure/mongooseWithdrawalRepository.js";
import {
  createMemberSavingsSubmission,
} from "../application/createMemberSavingsSubmission.js";

async function discardUploadedProof(file) {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to discard rejected savings proof:", error.message);
    }
  }
}

export function createMongooseMemberSavingsSubmission() {
  return createMemberSavingsSubmission({
    memberRepository: {
      findForSavings: (memberId) =>
        Member.findById(memberId).populate("currentUpgradeId"),
    },
    productRepository: {
      findById: (productId) => Product.findById(productId),
    },
    savingsRepository: {
      findPaidSetoran: (memberId, statuses) =>
        Savings.find({
          memberId,
          type: "Setoran",
          status: { $in: statuses },
        }).lean(),
      hasPendingSetoran: (memberId, installmentPeriod) =>
        Savings.exists({
          memberId,
          installmentPeriod,
          type: "Setoran",
          status: "Pending",
        }),
      countForPeriod: (memberId, productId, installmentPeriod) =>
        Savings.countDocuments({ memberId, productId, installmentPeriod }),
      create: (data) => new Savings(data).save(),
      populateProduct: (saving) => saving.populate("product"),
    },
    withdrawalRepository: createMongooseWithdrawalRepository(),
    proofStorage: {
      discard: discardUploadedProof,
    },
  });
}
