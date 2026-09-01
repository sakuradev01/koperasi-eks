# Member Registration Rejection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auditable reject/resubmit workflow for Student Dashboard cooperative registrations and prevent KTP-only or otherwise incomplete identity submissions from being accepted or verified.

**Architecture:** Keep the existing `Member.isVerified` contract for legacy consumers and add an effective `registrationStatus` (`pending`, `approved`, `rejected`) plus last-rejection metadata. Store every admin rejection in a separate immutable Mongo collection, expose authenticated paginated endpoints, and render a dedicated admin history table. Make the MERN API authoritative for document validation, then align CI4 web and Expo/RN clients with the new rejected/resubmit state and locked wizard navigation.

**Tech Stack:** Node.js ES modules, Express 4, Mongoose 8, MongoDB, React 18/Vite, React Native/Expo, CodeIgniter 4/PHP 8, Node built-in test runner, ESLint/Vite build.

## Global Constraints

- Do not delete `Member` records or rejection history during reject/resubmit.
- Keep `isVerified` synchronized (`false` for pending/rejected, `true` for approved) for existing savings/auth consumers.
- Never copy base64/image contents into history documents or list responses.
- Reject reasons are trimmed, required, and limited to 5–1000 characters.
- Server-side validation is authoritative; client validation is UX only.
- Existing admin/address/identity rejection flows must continue to work unchanged.
- Do not touch unrelated dirty files in `rn-student-dashboard` (`app.json`, `_layout.tsx`, sidebar, `config/featureFlags.ts`).
- Run focused tests after each implementation unit, then full available verification before commit/push.

## Files and responsibilities

- Create `server/src/models/memberRegistrationRejection.model.js`: immutable rejection event schema and indexes.
- Create `server/src/utils/memberRegistration.js`: effective status, document summary, payload validation, and public metadata helpers.
- Modify `server/src/models/member.model.js`: registration status/last rejection fields and indexes.
- Modify `server/src/routes/admin.routes.js`: protected reject and history routes.
- Modify `server/src/controllers/admin/member.controller.js`: reject/history handlers, status-aware listing/counting, and verification guard.
- Modify `server/src/routes/public.routes.js`: strict first-submit validation, same-UUID resubmit endpoint, and rejected status response.
- Create `server/test/member-registration.test.js`: validator/status/document-summary regression tests.
- Create `client/src/pages/MemberRegistrationRejections.jsx`: paginated/searchable history table.
- Modify `client/src/pages/Members.jsx`: status badges, reject action, rejected filter, history link.
- Modify `client/src/pages/MemberDetail.jsx`: registration reject action, status/reason panel, and history preview link.
- Modify `client/src/routes/index.jsx`: protected `/master/anggota/riwayat-penolakan` route.
- Modify `student-dashboard/app/Controllers/Financial.php`: preserve full status/reason from `check-member`, route rejected/resubmit.
- Create or modify `student-dashboard/app/Views/pages/V_koperasi_rejected.php`: rejected message, reason, and resubmit CTA.
- Modify `student-dashboard/app/Views/pages/V_koperasi_register.php`: final all-step validation and resubmit action target.
- Modify `rn-student-dashboard/components/KoperasiRegistration.tsx`: lock step navigation, validate all steps at submit, and support resubmit URL/mode.

### Task 1: Add pure registration validation/status utilities

**Files:**
- Create: `server/src/utils/memberRegistration.js`
- Test: `server/test/member-registration.test.js`

**Interfaces:**
- `getEffectiveRegistrationStatus(member): "pending" | "approved" | "rejected"`
- `summarizeRegistrationDocuments(payload): { ktp, selfie, livenessLeft, livenessRight, signature, bank, accountNumber, product, ripl }`
- `validateRegistrationPayload(payload, { requireUuid = true }): { valid: boolean, errors: string[], summary: object }`

- [ ] **Step 1: Write failing tests for strict validation and legacy status.**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveRegistrationStatus,
  summarizeRegistrationDocuments,
  validateRegistrationPayload,
} from "../src/utils/memberRegistration.js";

const image = "data:image/jpeg;base64," + "a".repeat(180);
const complete = {
  uuid: "JPTG0001", name: "Siswa Uji", gender: "L", nik: "1234567890123456",
  bankName: "Bank Uji", accountNumber: "1234567890", accountHolderName: "Siswa Uji",
  productId: "507f1f77bcf86cd799439011", signatureImage: image,
  ktpImage: image, selfieImage: image, livenessLeftImage: image, livenessRightImage: image,
  riplText: "RIPL", riplVersion: "2026.1", riplAgreedAt: "2026-09-01T00:00:00.000Z",
};

test("accepts a complete registration payload", () => {
  const result = validateRegistrationPayload(complete);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects KTP-only payload and names every missing document", () => {
  const result = validateRegistrationPayload({ ...complete, selfieImage: "", livenessLeftImage: "", livenessRightImage: "" });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["selfieImage", "livenessLeftImage", "livenessRightImage"]);
});

test("keeps legacy status mapping and explicit rejected status", () => {
  assert.equal(getEffectiveRegistrationStatus({ isVerified: true }), "approved");
  assert.equal(getEffectiveRegistrationStatus({ isVerified: false }), "pending");
  assert.equal(getEffectiveRegistrationStatus({ registrationStatus: "rejected", isVerified: false }), "rejected");
});

test("summary contains booleans only, never image data", () => {
  const summary = summarizeRegistrationDocuments(complete);
  assert.equal(summary.ktp, true);
  assert.equal(Object.values(summary).includes(image), false);
});
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `node --test test/member-registration.test.js` from `/Users/samit_kaiwa4/Documents/bima/koperasi-eks/server`.

Expected: FAIL because `memberRegistration.js` does not exist.

- [ ] **Step 3: Implement the minimal pure utilities.**

Implement `hasUsableDocument` to accept only a non-empty `data:image/*` data URL or `/uploads/` path with length at least 20; check required scalar fields, 16-digit NIK, non-empty bank/account/holder/product, signature, four documents, and RIPL agreement. Return deterministic field-name errors sorted in required-field order. `getEffectiveRegistrationStatus` must prefer an explicit valid `registrationStatus`, then map `isVerified`.

- [ ] **Step 4: Run the focused test and verify GREEN.**

Run: `node --test test/member-registration.test.js`.

Expected: all 4 tests pass.

- [ ] **Step 5: Commit the utility and tests.**

```bash
git add server/src/utils/memberRegistration.js server/test/member-registration.test.js
git commit -m "feat(members): add registration validation utilities"
```

### Task 2: Add member status fields, rejection model, and admin API

**Files:**
- Create: `server/src/models/memberRegistrationRejection.model.js`
- Modify: `server/src/models/member.model.js`
- Modify: `server/src/controllers/admin/member.controller.js`
- Modify: `server/src/routes/admin.routes.js`
- Test: `server/test/member-registration.test.js` (extend pure contract tests if controller extraction is needed)

**Interfaces:**
- `PATCH /api/admin/members/:uuid/reject` body `{ rejectionReason }` → 200 with member status `rejected`.
- `GET /api/admin/member-registration-rejections?page=1&limit=20&search=` → paginated metadata.
- `GET /api/admin/members/:uuid/registration-rejections` → that member's metadata history.

- [ ] **Step 1: Add schema fields/model before controller behavior.**

Add to `Member`: `registrationStatus` enum with no default for legacy backfill, `registrationRejectionReason`, `registrationRejectedAt`, `registrationRejectedBy`, and `registrationAttempt` default 1. Add indexes for status and rejected time. Create `MemberRegistrationRejection` with `memberId`, `memberUuid`, `memberName`, `reason`, `rejectedBy`, `rejectedByName`, `rejectedAt`, `attempt`, and boolean `documentSummary`; use timestamps and indexes `{ memberUuid: 1, rejectedAt: -1 }` and `{ rejectedAt: -1 }`.

- [ ] **Step 2: Add reject handler and write a failing route contract test or isolated fake test.**

The handler must load the member, require `registrationSource === "student_dashboard"`, require effective status `pending`, validate reason length, create the history document with a document summary, set member status/reason/audit fields, set `isVerified = false`, and save. If history creation fails, do not save the member. Return HTTP 409 for already approved/rejected and 422 for invalid reason.

- [ ] **Step 3: Add history list handlers with bounded pagination.**

Normalize `page >= 1`, `limit` to 20 by default and max 100, use case-insensitive escaped search on `memberUuid`/`memberName`, sort `rejectedAt` descending, and return only metadata plus `pagination`. The single-member endpoint uses the same projection and sort.

- [ ] **Step 4: Add routes before the generic `/:uuid` route conflict.**

Register `/member-registration-rejections` before `/members/:uuid` where necessary, then register `PATCH /members/:uuid/reject` and the per-member history route with `verifyToken`. Export handlers from the existing controller module.

- [ ] **Step 5: Make list/count/verify status-aware.**

Include an effective `registrationStatus` in `getAllMembers` rows. Exclude rejected registrations from `registrationPending` count. In `verifyMember`, reject a student-dashboard member unless `validateRegistrationPayload(member, { requireUuid: true }).valid` is true; set status `approved` and clear last rejection fields on success. Existing admin-created records remain verifiable under legacy rules.

- [ ] **Step 6: Run server syntax and focused tests.**

Run:

```bash
node --check src/models/memberRegistrationRejection.model.js
node --check src/models/member.model.js
node --check src/controllers/admin/member.controller.js
node --check src/routes/admin.routes.js
node --test test/member-registration.test.js
```

Expected: syntax exits 0 and all focused tests pass.

- [ ] **Step 7: Commit backend admin API.**

```bash
git add server/src/models/memberRegistrationRejection.model.js server/src/models/member.model.js server/src/controllers/admin/member.controller.js server/src/routes/admin.routes.js server/test/member-registration.test.js
git commit -m "feat(members): add rejection history and approval guard"
```

### Task 3: Harden initial registration and add same-UUID resubmit API

**Files:**
- Modify: `server/src/routes/public.routes.js`
- Modify: `server/src/utils/memberRegistration.js`
- Test: `server/test/member-registration.test.js`

**Interfaces:**
- `POST /api/public/register-koperasi`: strict complete payload; duplicate UUID remains rejected.
- `PUT /api/public/register-koperasi/:uuid`: strict complete payload; only rejected member with same UUID can resubmit; sets pending and increments attempt.
- `GET /api/public/check-member/:uuid`: returns `rejected` plus `registrationRejectionReason`, `registrationRejectedAt`, and attempt metadata.

- [ ] **Step 1: Add failing tests for missing docs, duplicate POST, and resubmit preservation.**

Test the pure validator for KTP-only and a controller-level fake model contract if feasible. Assert the resubmit update clears only current rejection metadata, preserves prior rejection collection records, and never creates a second member/user.

- [ ] **Step 2: Apply validator before any `User` or `Member` write.**

In the initial route, call `validateRegistrationPayload(req.body)` after extracting the body and before duplicate/product/user creation. Return HTTP 422 with `{ success:false, code:"REGISTRATION_DOCS_REQUIRED", fields }` for invalid input. Keep product existence validation and duplicate UUID checks.

- [ ] **Step 3: Implement `PUT /register-koperasi/:uuid`.**

Load the existing member, require student-dashboard source and effective status `rejected`, merge the payload with the path UUID, validate it, update all registration fields, set `registrationStatus = "pending"`, `isVerified = false`, increment `registrationAttempt`, clear last-rejection fields, set `identityVerifyStatus` based on complete docs, and save. Do not create a new `User` or `Member`.

- [ ] **Step 4: Return rejected status and reason from `checkMemberStatus`.**

Use `getEffectiveRegistrationStatus`; preserve current `pending_verification` and `verified` response compatibility while adding `status: "rejected"` and safe reason/timestamp fields when rejected.

- [ ] **Step 5: Run syntax/tests and commit.**

```bash
node --check src/routes/public.routes.js
node --test test/member-registration.test.js
git add server/src/routes/public.routes.js server/src/utils/memberRegistration.js server/test/member-registration.test.js
git commit -m "fix(registration): reject incomplete submissions and support resubmit"
```

### Task 4: Build admin reject action and dedicated history table

**Files:**
- Create: `client/src/pages/MemberRegistrationRejections.jsx`
- Modify: `client/src/pages/Members.jsx`
- Modify: `client/src/pages/MemberDetail.jsx`
- Modify: `client/src/routes/index.jsx`

**Interfaces:**
- Admin UI calls `api.patch('/api/admin/members/:uuid/reject', { rejectionReason })`.
- History page calls `api.get('/api/admin/member-registration-rejections', { params: { page, limit, search } })`.
- Existing address/identity reject handlers remain unchanged.

- [ ] **Step 1: Add a pure status display helper in the history page and test manually with fixture data.**

Render `pending`, `rejected`, and `approved` labels from `member.registrationStatus` with fallback to `isVerified`. Keep table columns UUID, nama, alasan, admin, waktu, attempt, and document summary; never render image fields.

- [ ] **Step 2: Add reject state/modal to Members.**

Add a `registrationRejectTarget`, reason, loading state, and confirmation textarea. Show `Tolak Pengajuan` only for pending `student_dashboard` members. On success refresh members and show a toast. Add a `Riwayat Penolakan` button navigating to `/master/anggota/riwayat-penolakan` and a `Ditolak` verification filter.

- [ ] **Step 3: Add registration status/reason panel to MemberDetail.**

For a pending student registration, show `Tolak Pengajuan` next to the verification action. For rejected records, show the latest reason/time and a link to the history page. Keep existing identity/address reject UI scoped to their current statuses.

- [ ] **Step 4: Add route and pagination/search behavior.**

Register the protected route in `client/src/routes/index.jsx`. The page must show loading/error/empty states, reset page when search changes, cap requests at 100, and link each row to `/master/anggota/:uuid`.

- [ ] **Step 5: Run client build and focused lint on changed files.**

```bash
npm run build
npx eslint src/pages/MemberRegistrationRejections.jsx src/pages/Members.jsx src/pages/MemberDetail.jsx src/routes/index.jsx
```

Expected: build succeeds; report any pre-existing lint errors separately from new errors.

- [ ] **Step 6: Commit admin UI.**

```bash
git add client/src/pages/MemberRegistrationRejections.jsx client/src/pages/Members.jsx client/src/pages/MemberDetail.jsx client/src/routes/index.jsx
git commit -m "feat(admin): add registration rejection action and history"
```

### Task 5: Surface rejected state in CI4 Student Dashboard

**Files:**
- Modify: `student-dashboard/app/Controllers/Financial.php`
- Create: `student-dashboard/app/Views/pages/V_koperasi_rejected.php`
- Modify: `student-dashboard/app/Views/pages/V_koperasi_register.php`
- Test: existing PHP test directory, add `student-dashboard/tests/unit/FinancialRegistrationStatusTest.php` only if the project test bootstrap supports controller helpers.

**Interfaces:**
- `checkMemberStatus` returns a structured status payload internally (`status`, `message`, `reason`, `rejectedAt`, `attempt`).
- `financial/savings` renders rejected view with the same student profile/product context.
- Registration form posts to initial POST or same-UUID PUT proxy based on resubmit mode.

- [ ] **Step 1: Add a failing status parsing test or isolated PHP test for rejected payload.**

Assert that a JSON response with `status: rejected` is not treated as pending or verified and preserves a rejection reason safely.

- [ ] **Step 2: Refactor `checkMemberStatus` to return structured data.**

Keep `api_unavailable` handling, but return the decoded safe fields. Update all comparisons in `savings()` to use `$memberStatus['status']`.

- [ ] **Step 3: Render the rejected view.**

Create an escaped Bootstrap card showing “Pendaftaran ditolak”, reason, rejection date, and a `Perbaiki & Kirim Ulang` link/button. Pass student/profile/product data and the UUID; do not render unescaped API content.

- [ ] **Step 4: Add resubmit mode to the registration view/controller.**

When resubmit mode is active, post the complete form to a CI4 method that proxies `PUT /api/public/register-koperasi/:uuid`; preserve the same session UUID and display API field errors without exposing raw response bodies. Keep initial POST behavior unchanged.

- [ ] **Step 5: Add final client-side all-step guard.**

Before `#btnSubmitFinal` AJAX, call `validateStep(1)` through `validateStep(5)` and stop with the first error. The server remains authoritative.

- [ ] **Step 6: Run PHP syntax/tests and commit.**

```bash
php -l app/Controllers/Financial.php
php -l app/Views/pages/V_koperasi_rejected.php
php -l app/Views/pages/V_koperasi_register.php
php vendor/bin/phpunit --filter IdentityUploadDiagnosticsTest
git add app/Controllers/Financial.php app/Views/pages/V_koperasi_rejected.php app/Views/pages/V_koperasi_register.php tests
git commit -m "feat(student): show registration rejection reason and resubmit"
```

### Task 6: Fix RN wizard bypass and support resubmit

**Files:**
- Modify: `rn-student-dashboard/components/KoperasiRegistration.tsx`
- Modify: `rn-student-dashboard/app/(main)/V_savings-backup.tsx` only if rejected status is passed by the parent.

**Interfaces:**
- Step pills are indicators or only allow revisiting completed steps; they cannot set an arbitrary future `activeStep`.
- `submitRegistration()` validates every prerequisite before posting.
- Rejected mode posts to `/financial/koperasi/register` proxy with resubmit intent/UUID while retaining existing profile callbacks.

- [ ] **Step 1: Add a failing static regression assertion.**

Assert from a small script that no step-pill handler contains `setActiveStep(index)` and that submit code invokes full prerequisite validation. If a TS test harness is unavailable, use a Node script reading the component and failing on the bypass pattern.

- [ ] **Step 2: Lock step navigation.**

Replace the direct setter with a handler that allows only `index <= maxReachableStep` (or makes pills non-touchable) and never skips prerequisite steps. Keep the Back/Lanjut controls functional.

- [ ] **Step 3: Validate all steps in submit.**

Add a `validateAllSteps()` function that checks PIN, NIK, RIPL, document/rekening/signature, and product independent of `activeStep`; call it before building the payload. Ensure a missing selfie/liveness returns an alert and no network request.

- [ ] **Step 4: Render rejected reason/resubmit mode.**

Pass rejection reason/status from the parent and show it above the form. On successful resubmit, return to pending state through `onRegistered`.

- [ ] **Step 5: Run TypeScript/Metro-compatible checks and commit.**

```bash
npx tsc --noEmit
node -e 'const fs=require("fs"); const s=fs.readFileSync("components/KoperasiRegistration.tsx","utf8"); if (s.includes("onPress={() => setActiveStep(index)}")) process.exit(1); console.log("step navigation guard present")'
git add components/KoperasiRegistration.tsx 'app/(main)/V_savings-backup.tsx'
git commit -m "fix(rn): prevent registration wizard bypass"
```

### Task 7: Cross-repo verification, review, and push

**Files:**
- No source files; inspect all diffs and generated build output.

- [ ] **Step 1: Review diffs and check formatting.**

Run `git diff --check` in all changed repositories and inspect each commit for accidental credentials, image data, unrelated files, and route ordering errors.

- [ ] **Step 2: Run full available tests/builds.**

```bash
# koperasi-eks/server
npm run test:accounting
node --test test/uploads-dir.test.js test/member-registration.test.js
# koperasi-eks/client
npm run build
npm run lint -- --no-warn-ignored || true
# student-dashboard
php -l app/Controllers/Financial.php
php vendor/bin/phpunit --filter IdentityUploadDiagnosticsTest
# rn-student-dashboard
npx tsc --noEmit
```

Record exact failures; do not call a baseline lint failure a regression without comparing the changed-file output.

- [ ] **Step 3: Verify production read-only before push.**

`GET https://api.samitcoop.com/api/public/check-member/JPSB25088945` must still be read-only and should show `pending_verification` until an admin acts. Do not call reject/verify/resubmit on production during this task.

- [ ] **Step 4: Push each repository to its current upstream branch.**

```bash
git push origin main   # koperasi-eks
git push origin master # student-dashboard
git push origin master # rn-student-dashboard
```

Push only after the three repositories are clean except intentional user changes in RN. Do not deploy production; report commit hashes and push results separately.

