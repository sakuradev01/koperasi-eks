import { Member } from "../../../models/member.model.js";
import { Product } from "../../../models/product.model.js";
import { Savings } from "../../../models/savings.model.js";
import {
  normalizeObjectId,
  resolveSavingsCoaInput,
  reverseSavingsAccountingTransaction,
  syncSavingsAccountingTransaction,
} from "../../../services/savingsAccounting.service.js";
import {
  createAdminSavingsUpdate,
} from "../application/updateAdminSavings.js";

export function createMongooseAdminSavingsUpdate() {
  return createAdminSavingsUpdate({
    memberRepository: {
      findById: (memberId) => Member.findById(memberId),
    },
    productRepository: {
      findById: (productId) => Product.findById(productId),
    },
    savingsRepository: {
      updateById: (id, updateData) =>
        Savings.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        })
          .populate("memberId", "name email phone")
          .populate("productId"),
      save: (savings) => savings.save(),
      loadPostedDetail: (id) =>
        Savings.findById(id)
          .populate("memberId", "name email phone")
          .populate("productId")
          .populate("accountId", "accountName accountCode currency balance")
          .populate("transactionId"),
    },
    accountingGateway: {
      normalizeObjectId,
      resolveCoaInput: resolveSavingsCoaInput,
      reverseSavingsAccountingTransaction,
      syncSavingsAccountingTransaction,
    },
  });
}
