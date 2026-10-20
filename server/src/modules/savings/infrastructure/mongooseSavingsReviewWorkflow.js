import { Savings } from "../../../models/savings.model.js";
import {
  resolveSavingsCoaInput,
  syncSavingsAccountingTransaction,
  reverseSavingsAccountingTransaction,
} from "../../../services/savingsAccounting.service.js";
import {
  createSavingsReviewWorkflow,
} from "../application/savingsReviewWorkflow.js";

export function createMongooseSavingsReviewWorkflow() {
  return createSavingsReviewWorkflow({
    savingsRepository: {
      findForApproval: (id) => Savings.findById(id).populate("memberId", "name"),
      findById: (id) => Savings.findById(id),
      save: (savings) => savings.save(),
      loadApprovalDetail: (id) =>
        Savings.findById(id)
          .populate("memberId", "name email phone")
          .populate("productId", "title depositAmount returnProfit termDuration")
          .populate("accountId", "accountName accountCode currency balance")
          .populate("transactionId"),
    },
    accountingGateway: {
      resolveCoaInput: resolveSavingsCoaInput,
      syncSavingsAccountingTransaction,
      reverseSavingsAccountingTransaction,
    },
  });
}
