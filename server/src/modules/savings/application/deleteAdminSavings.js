export class AdminSavingsDeletionError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AdminSavingsDeletionError";
    this.statusCode = statusCode;
  }
}

export function createAdminSavingsDeletion({
  savingsRepository,
  accountingGateway,
  proofStorage,
}) {
  return {
    async execute(id) {
      const savings = await savingsRepository.findById(id);
      if (!savings) {
        throw new AdminSavingsDeletionError(404, "Data simpanan tidak ditemukan");
      }

      if (savings.transactionId || savings.status === "Approved") {
        await accountingGateway.reverseSavingsAccountingTransaction(savings);
      }

      if (savings.proofFile) {
        try {
          await proofStorage.delete(savings.proofFile);
        } catch {
          // Preserve the existing behavior: proof cleanup must not block deletion.
        }
      }

      await savingsRepository.deleteById(id);
      return null;
    },
  };
}
