import mongoose from "mongoose";
import conf from "../conf/conf.js";
import { CoaMaster } from "../models/coaMaster.model.js";
import { CoaSubmenu } from "../models/coaSubmenu.model.js";

const masterData = [
  {
    masterName: "Assets",
    masterCode: "AST",
    description: "Resources owned by the business",
  },
  {
    masterName: "Liabilities",
    masterCode: "LIA",
    description: "Debts and obligations owed by the business",
  },
  {
    masterName: "Income",
    masterCode: "INC",
    description: "Revenue and earnings",
  },
  {
    masterName: "Expenses",
    masterCode: "EXP",
    description: "Costs and expenditures",
  },
  {
    masterName: "Equity",
    masterCode: "EQU",
    description: "Owner's equity and retained earnings",
  },
];

const submenuData = {
  Assets: [
    { submenuName: "Cash and Bank", submenuCode: "AST-CB", description: "Cash on hand and bank accounts" },
    { submenuName: "Money in Transit", submenuCode: "AST-MT", description: "Money being transferred" },
    { submenuName: "Expected Payments from Customers", submenuCode: "AST-EPC", description: "Money owed to you by customers" },
    { submenuName: "Inventory", submenuCode: "AST-INV", description: "Products and materials for sale" },
    { submenuName: "Property, Plant, Equipment", submenuCode: "AST-PPE", description: "Long-term physical assets" },
    { submenuName: "Depreciation and Amortization", submenuCode: "AST-DA", description: "Accumulated depreciation accounts" },
    { submenuName: "Vendor Prepayments and Vendor Credits", submenuCode: "AST-VPC", description: "Prepaid expenses and vendor credits" },
    { submenuName: "Other Short-Term Asset", submenuCode: "AST-OST", description: "Other current assets" },
    { submenuName: "Other Long-Term Asset", submenuCode: "AST-OLT", description: "Other non-current assets" },
  ],
  Liabilities: [
    { submenuName: "Credit Card", submenuCode: "LIA-CC", description: "Credit card accounts" },
    { submenuName: "Loan and Line of Credit", submenuCode: "LIA-LLC", description: "Loans and credit facilities" },
    { submenuName: "Expected Payments to Vendors", submenuCode: "LIA-EPV", description: "Money owed to vendors and suppliers" },
    { submenuName: "Sales Taxes", submenuCode: "LIA-ST", description: "Sales tax obligations" },
    { submenuName: "Due For Payroll", submenuCode: "LIA-DFP", description: "Payroll-related obligations" },
    { submenuName: "Due to You and Other Business Owners", submenuCode: "LIA-DBO", description: "Owner obligations" },
    { submenuName: "Customer Prepayments and Customer Credits", submenuCode: "LIA-CPC", description: "Prepayments from customers" },
    { submenuName: "Other Short-Term Liability", submenuCode: "LIA-OST", description: "Other current liabilities" },
    { submenuName: "Other Long-Term Liability", submenuCode: "LIA-OLT", description: "Other non-current liabilities" },
  ],
  Income: [
    { submenuName: "Income", submenuCode: "INC-INC", description: "Main income accounts" },
    { submenuName: "Discount", submenuCode: "INC-DIS", description: "Sales discounts and allowances" },
    { submenuName: "Other Income", submenuCode: "INC-OTH", description: "Other income sources" },
    { submenuName: "Uncategorized Income", submenuCode: "INC-UNC", description: "Income not yet categorized" },
    { submenuName: "Gain On Foreign Exchange", submenuCode: "INC-GFE", description: "Foreign exchange gains" },
  ],
  Expenses: [
    { submenuName: "Operating Expense", submenuCode: "EXP-OP", description: "Day-to-day business expenses" },
    { submenuName: "Cost of Goods Sold", submenuCode: "EXP-COGS", description: "Direct costs of producing goods" },
    { submenuName: "Payment Processing Fee", submenuCode: "EXP-PPF", description: "Fees for payment processing services" },
    { submenuName: "Payroll Expense", submenuCode: "EXP-PAY", description: "Employee-related expenses" },
    { submenuName: "Uncategorized Expense", submenuCode: "EXP-UNC", description: "Expenses not yet categorized" },
    { submenuName: "Loss On Foreign Exchange", submenuCode: "EXP-LFE", description: "Foreign exchange losses" },
  ],
  Equity: [
    { submenuName: "Equity", submenuCode: "EQU-BCD", description: "Owner equity / investments and drawings" },
    { submenuName: "Retained Earnings: Profit", submenuCode: "EQU-REP", description: "Accumulated profits and losses" },
  ],
};

const seedCOA = async () => {
  try {
    if (!conf.mongodbUri || !/^mongodb(\+srv)?:\/\//.test(conf.mongodbUri)) {
      throw new Error(
        "MONGO_DB_URL/MONGODB_URI belum valid. Gunakan URI yang diawali mongodb:// atau mongodb+srv://"
      );
    }

    await mongoose.connect(conf.mongodbUri);
    console.log("Connected to MongoDB for COA sync...");

    const masterMap = new Map();
    for (const master of masterData) {
      const doc = await CoaMaster.findOneAndUpdate(
        { masterName: master.masterName },
        {
          $set: {
            masterCode: master.masterCode,
            description: master.description,
            isActive: true,
          },
          $setOnInsert: { masterName: master.masterName },
        },
        { upsert: true, new: true }
      );
      masterMap.set(master.masterName, doc);
    }
    console.log(`Upserted ${masterMap.size} COA Masters`);

    let canonicalSubmenuCount = 0;
    let upsertedSubmenus = 0;

    for (const [masterName, submenus] of Object.entries(submenuData)) {
      const master = masterMap.get(masterName);
      if (!master) continue;

      for (const submenu of submenus) {
        canonicalSubmenuCount += 1;
        await CoaSubmenu.findOneAndUpdate(
          { masterId: master._id, submenuName: submenu.submenuName },
          {
            $set: {
              submenuCode: submenu.submenuCode,
              description: submenu.description,
              isActive: true,
            },
            $setOnInsert: {
              masterId: master._id,
              submenuName: submenu.submenuName,
            },
          },
          { upsert: true, new: true }
        );
        upsertedSubmenus += 1;
      }
    }

    console.log(`Upserted ${upsertedSubmenus} COA Submenus (canonical: ${canonicalSubmenuCount})`);

    const totalSubmenusInDb = await CoaSubmenu.countDocuments();
    if (totalSubmenusInDb > canonicalSubmenuCount) {
      console.log(
        `Found ${totalSubmenusInDb - canonicalSubmenuCount} additional submenu records in DB (left untouched for data safety).`
      );
    }

    console.log("COA sync completed successfully!");
    await mongoose.disconnect();
  } catch (error) {
    console.error("COA seed error:", error.message);
    process.exit(1);
  }
};

seedCOA();
