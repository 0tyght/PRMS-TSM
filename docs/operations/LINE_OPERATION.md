# การเปิดระบบ LINE — ระบบทะเบียนและบริหารจัดการสัตว์เลี้ยง

## คำสั่งเดียวสำหรับเปิดระบบ

เปิด PowerShell ที่โฟลเดอร์โครงการ แล้วรัน

```powershell
.\start-smart-tha-pho.ps1
```

คำสั่งนี้ตรวจ MySQL, เปิด API, เปิด Cloudflare Tunnel, ตรวจ endpoint สาธารณะ, อัปเดต LINE Webhook ให้ตรง URL ล่าสุด, ตรวจว่า `Use webhook` เปิดอยู่, สั่ง LINE ทดสอบ Webhook และ commit/push เฉพาะ `runtime-config.json` เพื่อให้ GitHub Pages ใช้ API URL ใหม่

## URL Webhook เปลี่ยนหรือไม่

ปัจจุบันใช้ Cloudflare Quick Tunnel (`*.trycloudflare.com`) จึงได้ URL ใหม่ทุกครั้งที่ปิดแล้วเปิด Tunnel ใหม่ แต่ไม่ต้องเข้า LINE Developers ไปแก้เอง: `start-smart-tha-pho.ps1` เรียกสคริปต์ที่อัปเดต endpoint และทดสอบกับ LINE อัตโนมัติแล้ว

ถ้าต้องการ URL คงที่สำหรับใช้งานจริง ควรตั้งค่า Cloudflare Named Tunnel และโดเมนของเทศบาล เช่น `api.smartthapho.go.th` แล้ว URL Webhook จะคงเดิมหลัง restart เหลือเพียงเปิด Tunnel ให้เชื่อมต่อกลับมาเท่านั้น

## เงื่อนไขก่อนเปิดใช้งาน

- XAMPP MySQL ต้องเปิดอยู่
- `.env` ต้องมี `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN`
- LINE Developers ต้องเปิด `Use webhook`
- เครื่องต้องเชื่อมต่อออกไปยัง Cloudflare และ LINE ผ่าน HTTPS ได้
