export class SavingsReviewError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "SavingsReviewError";
    this.statusCode = statusCode;
  }
}

const requireSavings = async (findSaving, id) => {
  const savings = await findSaving(id);
  if (!savings) {
    throw new SavingsReviewError(404, "Data simpanan tidak ditemukan");
  }
  return savings;
};

export function createSavingsReviewWorkflow({
  savingsRepository,
  accountingGateway,
  clock = () => new Date(),
}) {
  return {
    async approve({ id, userId, input = {} }) {
      const savings = await requireSavings(savingsRepository.findForApproval, id);

      if (savings.status === "Approved" && savings.transactionId) {
        throw new SavingsReviewError(400, "Simpanan sudah disetujui sebelumnya");
      }

      const coaSource = {
        accountId: input.accountId ?? input.account_id ?? savings.accountId,
        categoryId: input.categoryId ?? input.category_id ?? savings.categoryId,
        categoryType:
          input.categoryType ?? input.category_type ?? savings.categoryType,
        isSplit: input.isSplit ?? savings.isSplit,
        splits: input.splits ?? input.split_data,
        senderName: input.senderName ?? input.sender_name,
      };
      const coa = accountingGateway.resolveCoaInput(coaSource, {
        requireAccount: true,
      });
      const transaction = await accountingGateway.syncSavingsAccountingTransaction(
        savings,
        coa,
      );

      savings.status = "Approved";
      savings.approvedBy = userId;
      savings.approvedAt = clock();
      savings.accountId = coa.accountId;
      savings.categoryId = coa.isSplit ? null : coa.categoryId;
      savings.categoryType = coa.isSplit ? null : coa.categoryType;
      savings.isSplit = Boolean(coa.isSplit);
      savings.transactionId = transaction._id;
      if (input.notes) savings.notes = input.notes;

      await savingsRepository.save(savings);
      return savingsRepository.loadApprovalDetail(savings._id);
    },

    async reject({ id, userId, input = {} }) {
      const { rejectionReason, notes } = input;
      if (!rejectionReason) {
        throw new SavingsReviewError(400, "Alasan penolakan wajib diisi");
      }

      const savings = await requireSavings(savingsRepository.findById, id);
      if (savings.status === "Approved" || savings.transactionId) {
        await accountingGateway.reverseSavingsAccountingTransaction(savings);
        savings.transactionId = null;
      }

      savings.status = "Rejected";
      savings.rejectionReason = rejectionReason;
      savings.approvedBy = userId;
      savings.approvedAt = clock();
      if (notes) savings.notes = notes;

      await savingsRepository.save(savings);
      return savings;
    },

    async markAsPartial({ id, userId, input = {} }) {
      const savings = await requireSavings(savingsRepository.findById, id);

      savings.status = "Partial";
      savings.paymentType = "Partial";
      savings.approvedBy = userId;
      savings.approvedAt = clock();
      if (input.notes) savings.notes = input.notes;

      await savingsRepository.save(savings);
      return savings;
    },
  };
}
