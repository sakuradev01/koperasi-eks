import { DanaDarurat } from "../../models/danaDarurat.model.js";
import { Member } from "../../models/member.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Member: submit new dana darurat application
const memberSubmit = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const { personal, employment, company, emergencyContact1, emergencyContact2, loanDetails, income, expenses, debt, documents } = req.body;

  // Check existing pending/submitted applications
  const existing = await DanaDarurat.findOne({ memberId, status: { $in: ['draft', 'submitted', 'reviewing'] } });
  if (existing) {
    return res.status(400).json({ success: false, message: "Anda masih memiliki pengajuan yang sedang diproses" });
  }

  const application = new DanaDarurat({
    memberId, personal, employment, company, emergencyContact1, emergencyContact2,
    loanDetails, income, expenses, debt, documents,
    status: "submitted",
    submissionDate: new Date(),
  });

  await application.save();
  res.status(201).json({ success: true, data: application, message: "Pengajuan dana darurat berhasil dikirim" });
});

// Member: save draft (auto-save between wizard steps)
const memberSaveDraft = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const { applicationId, ...data } = req.body;

  if (applicationId) {
    const app = await DanaDarurat.findOneAndUpdate(
      { _id: applicationId, memberId },
      { ...data, status: "draft" },
      { new: true }
    );
    if (!app) return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
    return res.json({ success: true, data: app, message: "Draft disimpan" });
  }

  const app = new DanaDarurat({ ...data, memberId, status: "draft" });
  await app.save();
  res.status(201).json({ success: true, data: app, message: "Draft disimpan" });
});

// Member: get my applications
const memberMyApplications = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const applications = await DanaDarurat.find({ memberId }).sort({ createdAt: -1 });
  res.json({ success: true, data: applications });
});

// Member: get single application detail
const memberApplicationDetail = asyncHandler(async (req, res) => {
  const memberId = req.member.memberId;
  const app = await DanaDarurat.findOne({ _id: req.params.id, memberId });
  if (!app) return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
  res.json({ success: true, data: app });
});

export { memberSubmit, memberSaveDraft, memberMyApplications, memberApplicationDetail };
