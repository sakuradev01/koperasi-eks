import { User } from "../../models/user.model.js";
import { Product } from "../../models/product.model.js";
import { Savings } from "../../models/savings.model.js";
import { LoanProduct } from "../../models/loanProduct.model.js";
import { Loan } from "../../models/loan.model.js";
import { LoanPayment } from "../../models/loanPayment.model.js";
import { Member } from "../../models/member.model.js";
import { SavingsWithdrawal } from "../../models/savingsWithdrawal.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    // Get total members count
    const totalMembers = await Member.countDocuments();
    const withdrawalSummary = await SavingsWithdrawal.aggregate([
      { $match: { status: { $in: ["submitted", "reviewing", "approved", "waiting_payment"] } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$netAmount" } } },
    ]);
    const openSavingsWithdrawals = withdrawalSummary[0]?.count || 0;
    const openSavingsWithdrawalAmount = withdrawalSummary[0]?.amount || 0;

    // Get total savings amount (only approved deposits)
    const totalSavingsResult = await Savings.aggregate([
      {
        $match: {
          type: "Setoran",
          status: "Approved",
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);
    const totalSavings = totalSavingsResult[0]?.totalAmount || 0;

    // Get total products count
    const totalProducts = await Product.countDocuments();

    // Get active loan products count (produk pinjaman yang aktif)
    const activeSavingsCount = await LoanProduct.countDocuments({
      isActive: true,
    });

    // ===== LOAN STATISTICS =====
    
    // Get total loan products
    const totalLoanProducts = await LoanProduct.countDocuments({ isActive: true });

    // Get total active loans
    const totalActiveLoans = await Loan.countDocuments({ 
      status: { $in: ["Active", "Approved"] }
    });

    // Get total loan disbursed (total pinjaman yang disalurkan)
    const totalLoanDisbursedResult = await Loan.aggregate([
      {
        $match: {
          status: { $in: ["Active", "Approved", "Completed"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$loanAmount" },
        },
      },
    ]);
    const totalLoanDisbursed = totalLoanDisbursedResult[0]?.total || 0;

    // Get total loan collected (total cicilan terbayar)
    const totalLoanCollectedResult = await LoanPayment.aggregate([
      {
        $match: {
          status: "Approved",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);
    const totalLoanCollected = totalLoanCollectedResult[0]?.total || 0;

    // Get overdue loans count
    const today = new Date();
    const overdueLoans = await Loan.countDocuments({
      status: "Active",
      nextDueDate: { $lt: today }
    });

    // Get recent loan activities
    const recentLoanActivities = await LoanPayment.find()
      .populate("memberId", "name uuid")
      .populate({
        path: "loanId",
        populate: {
          path: "loanProductId",
          select: "title"
        }
      })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get monthly loan statistics
    const monthlyLoanStats = await LoanPayment.aggregate([
      {
        $match: {
          status: "Approved",
          paymentDate: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 5))
          }
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" },
          },
          collected: { $sum: "$amount" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
      {
        $project: {
          month: {
            $let: {
              vars: {
                months: [
                  "",
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "Mei",
                  "Jun",
                  "Jul",
                  "Agu",
                  "Sep",
                  "Okt",
                  "Nov",
                  "Des",
                ],
              },
              in: {
                $arrayElemAt: ["$$months", "$_id.month"],
              },
            },
          },
          collected: 1,
        },
      },
    ]);

    // Format recent loan activities
    const formattedLoanActivities = recentLoanActivities.map((activity) => ({
      id: activity._id,
      type: "payment",
      member: activity.memberId?.name || "Unknown",
      memberUuid: activity.memberId?.uuid || "",
      amount: activity.amount,
      status: activity.status,
      product: activity.loanId?.loanProductId?.title || "Unknown",
      period: activity.period,
      date: activity.paymentDate
        ? new Date(activity.paymentDate).toLocaleDateString("id-ID")
        : new Date(activity.createdAt).toLocaleDateString("id-ID"),
    }));

    // ===== END LOAN STATISTICS =====

    // Get recent transactions (last 10 savings)
    const recentTransactions = await Savings.find()
      .populate("memberId", "name uuid")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("amount savingsDate type memberId description");

    // Get monthly statistics for chart
    const monthlyStats = await Savings.aggregate([
      {
        $match: {
          status: "Approved",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$savingsDate" },
            month: { $month: "$savingsDate" },
          },
          deposits: {
            $sum: {
              $cond: [{ $eq: ["$type", "Setoran"] }, "$amount", 0],
            },
          },
          withdrawals: {
            $sum: {
              $cond: [{ $eq: ["$type", "Penarikan"] }, "$amount", 0],
            },
          },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
      {
        $limit: 6,
      },
      {
        $project: {
          month: {
            $let: {
              vars: {
                months: [
                  "",
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "Mei",
                  "Jun",
                  "Jul",
                  "Agu",
                  "Sep",
                  "Okt",
                  "Nov",
                  "Des",
                ],
              },
              in: {
                $arrayElemAt: ["$$months", "$_id.month"],
              },
            },
          },
          deposits: 1,
          withdrawals: 1,
        },
      },
    ]);

    // Format transactions for frontend
    const formattedTransactions = recentTransactions.map((transaction) => ({
      id: transaction._id,
      member: transaction.memberId?.name || "Unknown",
      memberUuid: transaction.memberId?.uuid || "",
      amount: transaction.amount,
      date: transaction.savingsDate
        ? new Date(transaction.savingsDate).toLocaleDateString("id-ID")
        : new Date(transaction.createdAt).toLocaleDateString("id-ID"),
      type: transaction.type || "Setoran",
      description: transaction.description || "",
    }));

    res.status(200).json({
      success: true,
      data: {
        totalMembers,
        openSavingsWithdrawals,
        openSavingsWithdrawalAmount,
        totalSavings,
        totalProducts,
        activeSavingsCount,
        recentTransactions: formattedTransactions,
        monthlyStats,
        // Loan statistics
        totalLoanProducts,
        totalActiveLoans,
        totalLoanDisbursed,
        totalLoanCollected,
        totalOutstanding: totalLoanDisbursed - totalLoanCollected,
        overdueLoans,
        recentLoanActivities: formattedLoanActivities,
        monthlyLoanStats,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data dashboard",
      error: error.message,
    });
  }
});

export { getDashboardStats };
