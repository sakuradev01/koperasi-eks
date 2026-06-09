import { DanaDarurat } from "../../models/danaDarurat.model.js";
import { Loan } from "../../models/loan.model.js";
import { Member } from "../../models/member.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Submit new dana darurat application
const submitApplication = asyncHandler(async (req, res) => {
  const { memberId, personal, employment, company, emergencyContact1, emergencyContact2, loanDetails, income, expenses, debt, documents } = req.body;

  if (!memberId) {
    return res.status(400).json({ success: false, message: "Anggota wajib dipilih" });
  }

  const application = new DanaDarurat({
    memberId, personal, employment, company, emergencyContact1, emergencyContact2,
    loanDetails, income, expenses, debt, documents,
    status: "submitted",
    submissionDate: new Date(),
  });

  await application.save();
  await application.populate("memberId");

  res.status(201).json({ success: true, data: application, message: "Pengajuan dana darurat berhasil dikirim" });
});

// Save draft (auto-save between steps)
const saveDraft = asyncHandler(async (req, res) => {
  const { applicationId, ...data } = req.body;

  if (applicationId) {
    const app = await DanaDarurat.findByIdAndUpdate(applicationId, { ...data, status: "draft" }, { new: true });
    if (!app) return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
    return res.status(200).json({ success: true, data: app, message: "Draft berhasil disimpan" });
  }

  const application = new DanaDarurat({ ...data, status: "draft" });
  await application.save();
  res.status(201).json({ success: true, data: application, message: "Draft berhasil disimpan" });
});

// Get all applications (admin)
const getAllApplications = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status) query.status = status;

  const total = await DanaDarurat.countDocuments(query);
  const applications = await DanaDarurat.find(query)
    .populate("memberId", "name uuid phone")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.status(200).json({ success: true, data: { applications, total, page: parseInt(page), pages: Math.ceil(total / limit) } });
});

// Get single application detail
const getApplicationDetail = asyncHandler(async (req, res) => {
  const application = await DanaDarurat.findById(req.params.id).populate("memberId", "name uuid phone email");
  if (!application) return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
  res.status(200).json({ success: true, data: application });
});

// Update status (admin: approve/reject)
const updateStatus = asyncHandler(async (req, res) => {
  const { status, reviewNotes } = req.body;
  const validStatuses = ['reviewing', 'approved', 'rejected', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: "Status tidak valid" });
  }

  // Load the Dana Darurat application
  const danaDarurat = await DanaDarurat.findById(req.params.id);
  if (!danaDarurat) {
    return res.status(404).json({ success: false, message: "Aplikasi tidak ditemukan" });
  }

  let createdLoan = null;

  // If approving, create a Loan record
  if (status === 'approved') {
    const tenor = danaDarurat.loanDetails?.tenor || 12;
    const interestRate = danaDarurat.loanDetails?.interestRate || 10;
    const loanAmount = danaDarurat.loanDetails?.amount || 0;

    // Calculate payment schedule
    const interestAmount = (loanAmount * interestRate) / 100;
    const totalPayment = loanAmount + interestAmount;
    const monthlyInstallment = Math.round(totalPayment / tenor);

    // Find member
    const member = await Member.findById(danaDarurat.memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: "Anggota tidak ditemukan" });
    }

    // Create the Loan
    createdLoan = new Loan({
      memberId: danaDarurat.memberId,
      loanAmount: loanAmount,
      downPayment: 0,
      tenor: tenor,
      monthlyInstallment: monthlyInstallment,
      interestRate: interestRate,
      totalPayment: totalPayment,
      status: 'Active',
      applicationDate: danaDarurat.createdAt || new Date(),
      approvalDate: new Date(),
      startDate: new Date(),
      description: `Dana Darurat - ${danaDarurat.applicationNumber || 'DD-' + Date.now()}`,
    });

    await createdLoan.save();

    // Link loan back to danaDarurat
    danaDarurat.loanDetails.loanId = createdLoan._id;
    danaDarurat.loanDetails.monthlyInstallment = monthlyInstallment;
  }

  // Update status
  danaDarurat.status = status;
  if (reviewNotes) danaDarurat.reviewNotes = reviewNotes;
  danaDarurat.reviewedBy = req.user?.userId || req.user?._id;
  danaDarurat.reviewedAt = new Date();

  await danaDarurat.save();

  res.status(200).json({
    success: true,
    data: {
      danaDarurat,
      loan: createdLoan ? {
        _id: createdLoan._id,
        loanAmount: createdLoan.loanAmount,
        tenor: createdLoan.tenor,
        monthlyInstallment: createdLoan.monthlyInstallment,
        interestRate: createdLoan.interestRate,
        totalPayment: createdLoan.totalPayment,
        status: createdLoan.status,
      } : null,
    },
    message: `Status berhasil diubah menjadi ${status}`,
  });
});

// Upload document to an existing application
const uploadDocument = asyncHandler(async (req, res) => {
  const { applicationId, documentType } = req.body;
  const file = req.file;

  if (!applicationId) {
    return res.status(400).json({ success: false, message: "Application ID wajib diisi" });
  }
  if (!documentType) {
    return res.status(400).json({ success: false, message: "Tipe dokumen wajib diisi" });
  }
  if (!file) {
    return res.status(400).json({ success: false, message: "File wajib diupload" });
  }

  const filePath = `/uploads/dana-darurat/${file.filename}`;

  const app = await DanaDarurat.findById(applicationId);
  if (!app) {
    return res.status(404).json({ success: false, message: "Pengajuan tidak ditemukan" });
  }

  // Find existing document type entry or push new
  const existingDocIdx = app.documents.findIndex(d => d.type === documentType);
  const fileEntry = {
    fileName: file.filename,
    originalName: file.originalname,
    filePath: filePath,
    size: file.size,
  };

  if (existingDocIdx >= 0) {
    app.documents[existingDocIdx].files.push(fileEntry);
  } else {
    app.documents.push({ type: documentType, files: [fileEntry] });
  }

  await app.save();
  res.status(200).json({ success: true, data: app, message: "Dokumen berhasil diupload" });
});

export { submitApplication, saveDraft, getAllApplications, getApplicationDetail, updateStatus, uploadDocument };
