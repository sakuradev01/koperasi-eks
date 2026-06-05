import express from "express";
import { verifyMemberToken } from "../../middlewares/memberAuth.middleware.js";
import {
  memberSubmit,
  memberSaveDraft,
  memberMyApplications,
  memberApplicationDetail,
} from "../../controllers/member/danaDarurat.controller.js";

const router = express.Router();
router.use(verifyMemberToken);

router.post("/submit", memberSubmit);
router.post("/draft", memberSaveDraft);
router.get("/", memberMyApplications);
router.get("/:id", memberApplicationDetail);

export default router;
