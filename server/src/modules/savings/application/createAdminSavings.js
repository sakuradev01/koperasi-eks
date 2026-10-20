export class AdminSavingsCreationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AdminSavingsCreationError";
    this.statusCode = statusCode;
  }
}

export function createAdminSavings({
  memberRepository,
  productRepository,
  savingsRepository,
  clock = () => new Date(),
}) {
  return {
    async execute(input, proofFilename = null) {
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
        notes,
        accountId,
        categoryId,
        categoryType,
        isSplit,
      } = input;

      const member = await memberRepository.findById(memberId);
      if (!member) {
        throw new AdminSavingsCreationError(404, "Anggota tidak ditemukan");
      }

      const product = await productRepository.findById(productId);
      if (!product) {
        throw new AdminSavingsCreationError(404, "Produk tidak ditemukan");
      }

      const existingSavingsCount = await savingsRepository.countForPeriod(
        memberId,
        productId,
        installmentPeriod,
      );
      const partialSequence = existingSavingsCount + 1;
      const paymentType = amount < product.depositAmount ? "Partial" : "Full";
      const saving = {
        installmentPeriod,
        memberId,
        productId,
        amount,
        savingsDate: savingsDate || clock(),
        paymentDate: paymentDate || null,
        type: type || "Setoran",
        description: description
          || "Pembayaran Simpanan Periode - " + installmentPeriod
            + (partialSequence > 1 ? " (#" + partialSequence + ")" : ""),
        status: status || "Pending",
        paymentType,
        partialSequence,
        notes: notes || "",
        proofFile: proofFilename,
        accountId: accountId || null,
        categoryId: categoryId || null,
        categoryType: categoryType || null,
        isSplit: Boolean(isSplit),
      };

      return savingsRepository.create(saving);
    },
  };
}
