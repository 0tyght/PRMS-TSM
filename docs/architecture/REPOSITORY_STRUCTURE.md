# โครงสร้างโครงการ Smart Tha Pho

โครงการนี้เป็น monorepo เพื่อให้ 4 ระบบของเทศบาลท่าโพธ์ใช้บัญชีเจ้าหน้าที่, โครงสร้างเว็บ และบริการกลางร่วมกัน โดยแต่ละระบบแยกโมดูลของตนเองชัดเจน

```text
apps/
  portal/                        หน้า Login กลางและตัวเลือกระบบ
  prms-tsm/                      ระบบบริหารจัดการทะเบียนสัตว์เลี้ยง
  waste-management/              ระบบบริหารจัดการรถเก็บขยะ
  disaster-management/           ระบบบริหารจัดการบรรเทาสาธารณภัย
  waterworks-management/         ระบบบริหารจัดการการประปา
  api/                           API และกฎธุรกิจที่ใช้งานจริง
    src/core/                    การตั้งค่า ฐานข้อมูล และ middleware
    src/contracts/               เอกสารสัญญา API (OpenAPI)
    src/modules/                 ความสามารถเฉพาะด้าน
      line/                      LINE OA, Rich Menu และการแจ้งเตือน
      reports/                   การสร้างรายงาน
      security/                  MFA และความปลอดภัย
packages/
  shared/                        ค่ากลางและแบบข้อมูลที่ใช้ร่วมกัน
  web-core/                      API client, session และ UI shell ที่ใช้ร่วมกันเท่าที่จำเป็น
database/
  bootstrap/                     SQL สำหรับสร้างฐานข้อมูลครั้งแรก
  migrations/                    SQL ที่อัปเกรดฐานข้อมูลตามลำดับ
scripts/
  admin/                         งานดูแลบัญชีผู้ใช้
  line/                          ตั้งค่า ตรวจสอบ และทดสอบ LINE OA
  maintenance/                   งานบำรุงรักษาข้อมูล
  reports/                       เครื่องมือสร้างเอกสารภายใน
  server/                        กระบวนการเปิด API และ Cloudflare Tunnel
docs/
  architecture/                  โครงสร้างและการออกแบบเชิงเทคนิค
  design/                        เอกสารออกแบบระบบ
  operations/                    คู่มือปฏิบัติการและ LINE OA
  quality/                       ผลการทดสอบ UAT
  audits/                        รายงานการตรวจสอบ
storage/uploads/                 ไฟล์หลักฐานจริง (ไม่เก็บใน Git)
outputs/                         เอกสารที่สร้างในเครื่อง (ไม่เก็บใน Git)
```

คำสั่งเปิดระบบที่ผู้ดูแลใช้คือ `./start-smart-tha-pho.ps1` จากโฟลเดอร์หลักเท่านั้น ไม่ต้องเรียกไฟล์ภายใน `scripts/server` โดยตรง
