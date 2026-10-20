export class AdminSavingsUpdateError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AdminSavingsUpdateError";
    this.statusCode = statusCode;
  }
}

export function createAdminSavingsUpdate({
  savingsRepository,
  memberRepository,
  productRepository,
  accountingGateway,
}) {
  return {
    async execute({ id, existingSaving, updateData, requestBody = {} }) {
      if (updateData.memberId) {
        const member = await memberRepository.findById(updateData.memberId);
        if (!member) {
          throw new AdminSavingsUpdateError(404, "Anggota tidak ditemukan");
        }
      }

      if (updateData.productId) {
        const product = await productRepository.findById(updateData.productId);
        if (!product) {
          throw new AdminSavingsUpdateError(404, "Produk tidak ditemukan");
        }
      }

      const productIdForPaymentType = updateData.productId || existingSaving.productId;
      const amountForPaymentType = updateData.amount !== undefined
        ? updateData.amount
        : existingSaving.amount;
      if (productIdForPaymentType && amountForPaymentType !== undefined) {
        const product = await productRepository.findById(productIdForPaymentType);
        if (product) {
          updateData.paymentType = Number(amountForPaymentType) < Number(product.depositAmount)
            ? "Partial"
            : "Full";
        }
      }

      const hasCoaBody =
        requestBody.accountId !== undefined ||
        requestBody.account_id !== undefined ||
        requestBody.categoryId !== undefined ||
        requestBody.category_id !== undefined ||
        requestBody.categoryType !== undefined ||
        requestBody.category_type !== undefined ||
        requestBody.isSplit !== undefined ||
        requestBody.splits !== undefined;

      let resolvedCoa = null;
      if (hasCoaBody) {
        resolvedCoa = accountingGateway.resolveCoaInput(
          {
            accountId:
              requestBody.accountId ?? requestBody.account_id ?? existingSaving.accountId,
            categoryId:
              requestBody.categoryId ?? requestBody.category_id ?? existingSaving.categoryId,
            categoryType:
              requestBody.categoryType
              ?? requestBody.category_type
              ?? existingSaving.categoryType,
            isSplit: requestBody.isSplit ?? existingSaving.isSplit,
            splits: requestBody.splits ?? requestBody.split_data,
            senderName: requestBody.senderName ?? requestBody.sender_name,
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
      if (
        previousStatus === "Approved"
        && nextStatus !== "Approved"
        && existingSaving.transactionId
      ) {
        await accountingGateway.reverseSavingsAccountingTransaction(existingSaving);
        updateData.transactionId = null;
      }

      let savings = await savingsRepository.updateById(id, updateData);
      if (!savings) {
        throw new AdminSavingsUpdateError(404, "Data simpanan tidak ditemukan");
      }

      const accountIdForSync =
        accountingGateway.normalizeObjectId(savings.accountId)
        || (resolvedCoa && resolvedCoa.accountId)
        || null;
      if (savings.status === "Approved" && accountIdForSync) {
        const coaForSync = resolvedCoa || accountingGateway.resolveCoaInput(
          {
            accountId: savings.accountId,
            categoryId: savings.categoryId,
            categoryType: savings.categoryType,
            isSplit: savings.isSplit,
          },
          { requireAccount: true },
        );

        const transaction = await accountingGateway.syncSavingsAccountingTransaction(
          savings,
          coaForSync,
        );
        if (
          !savings.transactionId
          || String(savings.transactionId) !== String(transaction._id)
        ) {
          savings.transactionId = transaction._id;
          savings.accountId = coaForSync.accountId;
          savings.categoryId = coaForSync.isSplit ? null : coaForSync.categoryId;
          savings.categoryType = coaForSync.isSplit ? null : coaForSync.categoryType;
          savings.isSplit = Boolean(coaForSync.isSplit);
          await savingsRepository.save(savings);
        }

        savings = await savingsRepository.loadPostedDetail(savings._id);
      }

      return savings;
    },
  };
}
