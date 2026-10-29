import { Expense } from "../../../models/expense.model.js";
import { ExpenseLine } from "../../../models/expenseLine.model.js";
import { ExpensePaymentProof } from "../../../models/expensePaymentProof.model.js";
import { Member } from "../../../models/member.model.js";
import { Product } from "../../../models/product.model.js";
import { Savings } from "../../../models/savings.model.js";
import { SavingsWithdrawal } from "../../../models/savingsWithdrawal.model.js";
import { SavingsWithdrawalSetting } from "../../../models/savingsWithdrawalSetting.model.js";
import { CheckoutIntent } from "../../../models/checkoutIntent.model.js";
import { CoaAccount } from "../../../models/coaAccount.model.js";

export function createMongooseWithdrawalRepository({ session = null } = {}) {
  const withSession = (query) => (session ? query.session(session) : query);
  const sessionOptions = session ? { session } : {};

  return {
    getStudentRequestSetting: async () => {
      const settings = await SavingsWithdrawalSetting.findOne({ key: "student_savings_withdrawal" }).lean();
      return settings || { key: "student_savings_withdrawal", studentRequestEnabled: false };
    },
    updateStudentRequestSetting: async ({ enabled, userId }) =>
      SavingsWithdrawalSetting.findOneAndUpdate(
        { key: "student_savings_withdrawal" },
        { $set: { studentRequestEnabled: Boolean(enabled), updatedBy: userId || null } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean(),
    findForWithdrawal: async (memberId) => Member.findById(memberId)
      .populate("productId")
      .populate("currentUpgradeId")
      .lean(),
    findForWithdrawalByUuid: async (uuid) => Member.findOne({ uuid })
      .populate("productId")
      .populate("currentUpgradeId")
      .lean(),
    findForWithdrawalById: async (memberId) => Member.findById(memberId)
      .select("_id uuid name membershipStatus bankName accountNumber accountHolderName productId currentUpgradeId isCompleted")
      .populate("productId", "_id title termDuration depositAmount")
      .populate("currentUpgradeId")
      .lean(),
    findSavingsForMember: async (memberId) => Savings.find({ memberId }).lean(),
    hasUnsettledSavingsPayment: async ({ memberId, memberUuid }) => {
      const [pendingSavings, pendingCheckout] = await Promise.all([
        Savings.exists({ memberId, status: "Pending" }),
        CheckoutIntent.exists({
          studentUuid: memberUuid,
          savingsAmount: { $gt: 0 },
          status: { $in: ["Pending", "Processing"] },
        }),
      ]);
      return Boolean(pendingSavings || pendingCheckout);
    },
    findOpenByMember: async (memberId) => SavingsWithdrawal.findOne({ openMemberId: memberId }).lean(),
    findAnyByMember: async (memberId) => SavingsWithdrawal.findOne({ memberId }).sort({ createdAt: -1 }).lean(),
    findByExpenseId: async (expenseId) => SavingsWithdrawal.findOne({ expenseId }),
    findById: async (id) => withSession(SavingsWithdrawal.findById(id)),
    findLatestByMember: async (memberId) => SavingsWithdrawal.findOne({ memberId })
      .sort({ createdAt: -1 })
      .populate("expenseId", "_id status amount paymentProof transferDate paidAt")
      .lean(),
    findLatestByMembers: async (memberIds) => {
      if (!memberIds.length) return [];
      return SavingsWithdrawal.aggregate([
        { $match: { memberId: { $in: memberIds } } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $group: { _id: "$memberId", request: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$request" } },
      ]);
    },
    create: async (data) => new SavingsWithdrawal(data).save(),
    attachExpense: async (requestId, expenseId) => SavingsWithdrawal.findOneAndUpdate(
      { _id: requestId, expenseId: null },
      { $set: { expenseId } },
      { new: true },
    ),
    deleteById: async (id) => SavingsWithdrawal.deleteOne({ _id: id }),
    list: async ({ status, memberId, page = 1, limit = 50 } = {}) => {
      const filter = {};
      if (status && status !== "all") filter.status = status;
      if (memberId) filter.memberId = memberId;
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
      const safePage = Math.max(1, Number(page) || 1);
      const [items, total] = await Promise.all([
        SavingsWithdrawal.find(filter)
          .sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .populate("memberId", "uuid name membershipStatus")
          .populate("expenseId", "_id status amount paymentProof transferDate paidAt")
          .lean(),
        SavingsWithdrawal.countDocuments(filter),
      ]);
      return { items, total, page: safePage, limit: safeLimit };
    },
    save: async (request) => request.save(sessionOptions),
    updateBankFee: async ({ request, feeAmount, userId, now }) => {
      const expense = request.expenseId ? await Expense.findById(request.expenseId) : null;
      if (!expense || expense.status !== "uncategorized") {
        const error = new Error("Simpan biaya transfer sebelum kategori Expense dibuat agar total kategori tetap seimbang.");
        error.statusCode = 409;
        throw error;
      }
      const previousExpenseAmount = expense.amount;
      const previousExpenseDescription = String(expense.description || "");
      const retainedDescription = previousExpenseDescription
        .split("\n")
        .filter((line) => !line.startsWith("Biaya transfer antarbank:") && !line.startsWith("Estimasi transfer:"));
      request.bankFeeAmount = feeAmount;
      request.netAmount = Math.max(0, request.grossAmount - request.penaltyAmount - feeAmount);
      expense.description = [
        ...retainedDescription,
        `Biaya transfer antarbank: Rp ${feeAmount}`,
        `Estimasi transfer: Rp ${request.netAmount}`,
      ].filter(Boolean).join("\n");
      request.bankFeeConfirmedAt = now;
      request.transitions.push({
        fromStatus: request.status,
        toStatus: request.status,
        actorType: "finance",
        actorId: userId || null,
        actorName: "Finance",
        reason: `Biaya transfer antarbank dikonfirmasi: ${feeAmount}`,
        createdAt: now,
      });
      expense.amount = request.netAmount;
      try {
        await expense.save();
        await request.save();
      } catch (error) {
        await Expense.updateOne({ _id: expense._id }, {
          $set: { amount: previousExpenseAmount, description: previousExpenseDescription },
        });
        throw error;
      }
      return request;
    },
    updateMemberPaid: async ({ memberId, userId, now }) => {
      const result = await Member.updateOne(
        { _id: memberId },
        {
          $set: {
            membershipStatus: "inactive",
            isCompleted: true,
            completedAt: now,
            completedBy: userId || null,
          },
        },
        sessionOptions,
      );
      if (result.matchedCount === 0 || result.n === 0) {
        throw new Error("Data anggota tidak ditemukan saat menutup tabungan.");
      }
      return result;
    },
    getMemberClosureState: async (memberId) => {
      const member = await withSession(Member.findById(memberId))
        .select("membershipStatus isCompleted completedAt completedBy")
        .lean();
      if (!member) return null;
      return {
        membershipStatus: member.membershipStatus ?? null,
        membershipStatusWasSet: Object.prototype.hasOwnProperty.call(member, "membershipStatus"),
        isCompleted: member.isCompleted === true,
        completedAt: member.completedAt || null,
        completedBy: member.completedBy || null,
      };
    },
    findProductById: async (productId) => Product.findById(productId).lean(),
    findExpenseById: async (expenseId) => Expense.findById(expenseId),
    createExpense: async (data) => new Expense(data).save(),
    createLines: async (expenseId, lines) => ExpenseLine.insertMany(
      lines.map((line) => ({ ...line, expenseId })),
    ),
    createPaymentProof: async (expenseId, fileName, uploadedBy) => ExpensePaymentProof.create({
      expenseId,
      fileName,
      uploadedBy,
      uploadedAt: new Date(),
    }),
    assertAccountsExist: async (accountId, categoryIds) => {
      const ids = [...new Set([accountId, ...categoryIds].filter(Boolean))];
      const existing = await CoaAccount.countDocuments({ _id: { $in: ids }, isActive: { $ne: false } });
      if (existing !== ids.length) {
        const error = new Error("Bank account atau category sudah tidak tersedia.");
        error.statusCode = 422;
        throw error;
      }
      return true;
    },
    deleteLines: async (expenseId) => {
      if (expenseId) return ExpenseLine.deleteMany({ expenseId });
      return null;
    },
    deletePaymentProofs: async (expenseId) => {
      if (expenseId) return ExpensePaymentProof.deleteMany({ expenseId });
      return null;
    },
    deleteExpenseById: async (expenseId) => Expense.deleteOne({ _id: expenseId }),
    updateExpenseAmount: async ({ expenseId, amount, description }) => Expense.findOneAndUpdate(
      { _id: expenseId, status: "uncategorized" },
      { $set: { amount, description } },
      { new: true },
    ),
  };
}
