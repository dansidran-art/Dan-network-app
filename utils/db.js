export async function verifyUserKYC(db, email) {
  return db.prepare(`UPDATE users SET is_kyc_verified = 1 WHERE email = ?`).bind(email).run()
}

export async function lockUserName(db, email) {
  return db.prepare(`ALTER TABLE users ADD COLUMN locked_name TEXT`).run()
    .catch(() => {}) // ignore if already exists
    .then(() => db.prepare(`UPDATE users SET locked_name = name WHERE email = ?`).bind(email).run())
}