import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new Schema(
  {
    uuid: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: [3, "Username minimal 3 karakter"],
      maxlength: [50, "Username maksimal 50 karakter"],
    },
    password: {
      type: String,
      required: true,
      minlength: [6, "Password minimal 6 karakter"],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["admin", "staff", "operator"],
      default: "admin",
    },
    permissions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password sebelum disimpan
userSchema.pre("save", async function (next) {
  // Generate UUID jika baru
  if (this.isNew && !this.uuid) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 5);
    this.uuid = `USER_${timestamp}_${random}`.toUpperCase();
  }

  // Hash password
  if (this.isModified("password")) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }

  next();
});

// Method untuk compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method untuk filter data user (jangan return password)
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

export const User = mongoose.model("User", userSchema);
