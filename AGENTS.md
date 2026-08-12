# Smart Tha Pho Engineering Rules

ข้อกำหนดนี้ใช้กับทุกไฟล์ภายในโครงการ Smart Tha Pho และทุกระบบย่อย

## OOP architecture is mandatory

งานใหม่และงานที่ปรับปรุงเดิมต้องออกแบบตามแนวคิด Object-Oriented Programming, SOLID และ Layered Architecture อย่างเคร่งครัด

ลำดับชั้นมาตรฐาน:

1. Presentation — หน้าเว็บ React, HTTP Controller และ LINE Adapter
2. Application — Use Case, Command, Query และ DTO
3. Domain — Entity, Value Object, Domain Service และกฎธุรกิจ
4. Infrastructure — Repository implementation, MariaDB, file storage และ external API

กฎบังคับ:

- Domain ห้าม import React, Express, MariaDB, LINE SDK หรือรายละเอียด Infrastructure
- Controller และ React component ห้ามมี business rule
- การเข้าถึงฐานข้อมูลต้องผ่าน Repository
- หนึ่ง Use Case ต้องมีความรับผิดชอบหลักหนึ่งเรื่อง
- ใช้ dependency injection แทนการสร้าง dependency กระจายภายในคลาส
- Entity ต้องปกป้อง state และ validation ของตัวเอง
- ห้ามสร้าง class ที่เป็นเพียงที่รวม static functions โดยไม่มี state หรือ abstraction ที่จำเป็น
- Shared code ต้องอยู่ใน `packages` เฉพาะสิ่งที่มีผู้ใช้ร่วมกันจริงอย่างน้อยสองระบบ
- แต่ละระบบย่อยต้องไม่ import implementation ภายในของอีกระบบโดยตรง
- ชื่อ class ใช้ PascalCase ชื่อ method และตัวแปรใช้ camelCase
- ต้องมี unit test สำหรับ Domain และ Application และ integration test สำหรับ Repository/API

React ใช้ function component และ hooks ได้เฉพาะชั้น Presentation ตามแนวทางของ React แต่ต้องแยก state orchestration และ business logic ออกเป็น Application/Domain object ไม่วางกฎธุรกิจใน JSX หรือ event handler

อ่านมาตรฐานฉบับเต็มที่ `docs/architecture/OOP_ARCHITECTURE_STANDARD.md`

