import { Member } from "../../../models/member.model.js";
import { Product } from "../../../models/product.model.js";
import { Savings } from "../../../models/savings.model.js";
import {
  createAdminSavings,
} from "../application/createAdminSavings.js";

export function createMongooseAdminSavingsCreator() {
  return createAdminSavings({
    memberRepository: {
      findById: (memberId) => Member.findById(memberId),
    },
    productRepository: {
      findById: (productId) => Product.findById(productId),
    },
    savingsRepository: {
      countForPeriod: (memberId, productId, installmentPeriod) =>
        Savings.countDocuments({ memberId, productId, installmentPeriod }),
      create: (data) => new Savings(data).save(),
    },
  });
}
