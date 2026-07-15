import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import "dotenv/config";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "ผู้ดูแลระบบ PRMS-TSM";
if (!email || !password || password.length < 10) {
  console.error("กำหนด ADMIN_EMAIL และ ADMIN_PASSWORD ที่มีอย่างน้อย 10 ตัวอักษร");
  process.exit(1);
}
const db = await mysql.createConnection({ host:process.env.DB_HOST||"127.0.0.1", port:Number(process.env.DB_PORT||3306), user:process.env.DB_USER||"root", password:process.env.DB_PASSWORD||"", database:process.env.DB_NAME||"prms_tsm" });
const hash = await bcrypt.hash(password, 12);
await db.execute(`INSERT INTO users (id, full_name, email, password_hash, role)
  VALUES (?, ?, ?, ?, 'ADMIN') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), password_hash=VALUES(password_hash), is_active=1`, [crypto.randomUUID(), name, email, hash]);
await db.end();
console.log(`สร้างผู้ดูแล ${email} สำเร็จ`);
