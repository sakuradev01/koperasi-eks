import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveBase64ImageToFile } from "../src/utils/uploadsDir.js";

const tempDirectories = [];

function useTempUploadsDir() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "koperasi-identity-upload-"));
  tempDirectories.push(directory);
  process.env.UPLOADS_DIR = directory;
  return directory;
}

test.after(() => {
  delete process.env.UPLOADS_DIR;
  for (const directory of tempDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps original HEIC bytes and uses a HEIC extension", () => {
  const uploadsDir = useTempUploadsDir();
  const originalBytes = Buffer.from(
    "000000186674797068656963000000006d69663168656963",
    "hex"
  );
  const dataUrl = `data:image/heic;base64,${originalBytes.toString("base64")}`;

  const storedPath = saveBase64ImageToFile(dataUrl, "members", "student-heic");
  const absolutePath = path.join(uploadsDir, storedPath.replace(/^\/uploads\//, ""));

  assert.match(storedPath, /^\/uploads\/members\/student-heic-.*\.heic$/);
  assert.deepEqual(fs.readFileSync(absolutePath), originalBytes);
});

test("detects a JPEG when iPhone metadata reports application/octet-stream", () => {
  const uploadsDir = useTempUploadsDir();
  const originalBytes = Buffer.from("ffd8ffe000104a46494600010100", "hex");
  const dataUrl = `data:application/octet-stream;base64,${originalBytes.toString("base64")}`;

  const storedPath = saveBase64ImageToFile(dataUrl, "members", "iphone-jpeg");
  const absolutePath = path.join(uploadsDir, storedPath.replace(/^\/uploads\//, ""));

  assert.match(storedPath, /^\/uploads\/members\/iphone-jpeg-.*\.jpg$/);
  assert.deepEqual(fs.readFileSync(absolutePath), originalBytes);
});
