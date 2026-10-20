import fs from "node:fs";
import { Savings } from "../../../models/savings.model.js";
import { reverseSavingsAccountingTransaction } from "../../../services/savingsAccounting.service.js";
import { resolveUploadedFilePath } from "../../../utils/uploadsDir.js";
import {
  createAdminSavingsDeletion,
} from "../application/deleteAdminSavings.js";

export function createMongooseAdminSavingsDeletion() {
  return createAdminSavingsDeletion({
    savingsRepository: {
      findById: (id) => Savings.findById(id),
      deleteById: (id) => Savings.findByIdAndDelete(id),
    },
    accountingGateway: {
      reverseSavingsAccountingTransaction,
    },
    proofStorage: {
      delete: async (proofFile) => {
        const filePath = resolveUploadedFilePath(proofFile, {
          defaultSubdir: "simpanan",
        });
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      },
    },
  });
}
