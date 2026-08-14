import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import conf from "../conf/conf.js";
import seedDashboardData from "../seeds/dashboardSeeder.js";

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(conf.mongodbUri);
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

// Seed admin user
const seedAdminUser = async () => {
  try {
    // Seed hanya jika kredensial bootstrap diberikan secara eksplisit melalui env.
    // Jangan pernah membuat kembali akun default yang credential-nya tertanam di source.
    const seedUsername = String(process.env.INITIAL_ADMIN_USERNAME || "").trim();
    const seedPassword = String(process.env.INITIAL_ADMIN_PASSWORD || "");

    if (!seedUsername || !seedPassword) {
      console.log("Initial admin seed dilewati: INITIAL_ADMIN_USERNAME/PASSWORD belum dikonfigurasi.");
      return;
    }

    // Jangan menambah admin kedua jika database sudah memiliki admin aktif/nonaktif.
    const existingAdmin = await User.findOne({ role: "admin" });

    if (existingAdmin) {
      console.log("Admin user sudah ada");
      return;
    }

    // Buat admin default
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 5);
    const adminUuid = `ADMIN_${timestamp}_${random}`.toUpperCase();

    const adminUser = new User({
      uuid: adminUuid,
      username: seedUsername,
      password: seedPassword, // Password akan di-hash otomatis oleh pre-save middleware
      name: process.env.INITIAL_ADMIN_NAME || "Administrator",
      role: "admin",
      isActive: true,
    });

    await adminUser.save();
    console.log("Admin user berhasil dibuat dari konfigurasi bootstrap.");
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
};

// Run seeder
const runSeeder = async () => {
  console.log("Starting database seeder...");

  await connectDB();
  await seedAdminUser();
  await seedDashboardData();

  console.log("Seeder completed!");
  process.exit(0);
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  process.exit(1);
});

// Run the seeder
runSeeder();
