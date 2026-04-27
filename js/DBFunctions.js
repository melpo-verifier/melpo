const { Submissions } = require("../dbObjects.js");
const crypto = require("crypto");

const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");

function encryptData(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptData(payloadString) {
  try {
    const [ivBase64, authTagBase64, encryptedBase64] = String(payloadString).split(":");
    if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
      return null;
    }
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    const encrypted = Buffer.from(encryptedBase64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

async function getLatestSubmissionByUser(userId, applicationId) {
  const submission = await Submissions.findOne({
    where: { user_id: userId, app_id: String(applicationId) },
    order: [["createdAt", "DESC"]],
  })

  if (submission) {
    const decryptedData = decryptData(submission.data);
    return decryptedData;
  } else {
    return null;
  }
}

async function getSubmission(messageId) {
  const submission = await Submissions.findOne({
    where: { message_id: messageId },
  });

  if (submission) {
    const decryptedData = decryptData(submission.data);
    return decryptedData;
  } else {
    return null;
  }
}

module.exports = {
  encryptData,
  decryptData,
  getLatestSubmissionByUser,
  getSubmission
};