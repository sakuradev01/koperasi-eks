import { User } from "../models/user.model.js";

export const createAdminUser = async () => {
  try {
    const seedUsername = String(process.env.INITIAL_ADMIN_USERNAME || "").trim();
    const seedPassword = String(process.env.INITIAL_ADMIN_PASSWORD || "");

    if (!seedUsername || !seedPassword) {
      console.log("Initial admin seed dilewati: INITIAL_ADMIN_USERNAME/PASSWORD belum dikonfigurasi.");
      return;
    }

    // Jangan menambah admin kedua jika database sudah memiliki admin.
    const existingAdmin = await User.findOne({ role: "admin" });

    if (existingAdmin) {
      console.log("Admin user already exists");
      return;
    }

    // Create admin user
    const adminUser = new User({
      username: seedUsername,
      password: seedPassword,
      name: process.env.INITIAL_ADMIN_NAME || "Administrator",
      role: "admin",
      isActive: true,
    });

    await adminUser.save();
    console.log("Admin user created from bootstrap configuration");
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
};

// Run the seeder
if (import.meta.url === `file://${process.argv[1]}`) {
  createAdminUser();
}
