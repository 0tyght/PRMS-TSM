# มาตรฐานสถาปัตยกรรม OOP — Smart Tha Pho

## ขอบเขต

มาตรฐานนี้ใช้กับระบบทั้งหมดภายใต้ Smart Tha Pho:

- ระบบบริหารจัดการทะเบียนสัตว์เลี้ยง
- ระบบบริหารจัดการรถเก็บขยะ
- ระบบบริหารจัดการบรรเทาสาธารณภัย
- ระบบบริหารจัดการการประปา
- หน้าเข้าสู่ระบบกลาง API กลาง LINE Official Account และ packages ที่ใช้ร่วมกัน

## โครงสร้างมาตรฐานของแต่ละระบบ

```text
src/
├─ presentation/
│  ├─ pages/
│  ├─ components/
│  ├─ controllers/
│  └─ adapters/
├─ application/
│  ├─ use-cases/
│  ├─ dto/
│  ├─ commands/
│  └─ queries/
├─ domain/
│  ├─ entities/
│  ├─ value-objects/
│  ├─ services/
│  ├─ repositories/
│  └─ errors/
├─ infrastructure/
│  ├─ database/
│  ├─ repositories/
│  ├─ http/
│  ├─ line/
│  └─ storage/
└─ composition-root/
   └─ container.js
```

## หน้าที่ของแต่ละชั้น

### Presentation

- รับข้อมูลจากเว็บ HTTP หรือ LINE
- แปลงข้อมูลเป็น DTO หรือ Command
- เรียก Application Use Case
- แสดงผลลัพธ์และข้อผิดพลาด
- ห้ามตัดสินกฎธุรกิจหรือเรียกฐานข้อมูลโดยตรง

React component ยังคงเป็น function component ได้ เนื่องจากเป็นรูปแบบมาตรฐานของ React แต่ต้องทำหน้าที่เป็น View เท่านั้น

### Application

- ควบคุมลำดับการทำงานของ Use Case
- ตรวจสิทธิ์ระดับงาน
- ใช้ Domain object และ Repository interface
- กำหนด transaction boundary
- ไม่ผูกกับ Express, React หรือ MariaDB

ตัวอย่างชื่อคลาส:

- `RegisterPetUseCase`
- `ReviewPetRegistrationUseCase`
- `RecordVaccinationUseCase`
- `AssignWasteRouteUseCase`

### Domain

- เก็บกฎธุรกิจหลักของเทศบาล
- Entity ปกป้องสถานะของตัวเองผ่าน method
- Value Object ตรวจสอบค่าตั้งแต่สร้าง
- Domain Service ใช้เฉพาะกฎที่ไม่ควรเป็นหน้าที่ของ Entity ใด Entity หนึ่ง

ตัวอย่าง:

```js
class Pet {
  #status;

  constructor({ id, name, species, status }) {
    this.id = id;
    this.name = name;
    this.species = species;
    this.#status = status;
  }

  reportMissing(effectiveAt) {
    if (this.#status !== "ACTIVE") {
      throw new InvalidPetStatusTransitionError();
    }

    this.#status = "MISSING";
    this.statusChangedAt = effectiveAt;
  }

  get status() {
    return this.#status;
  }
}
```

### Infrastructure

- เชื่อมต่อ MariaDB
- จัดเก็บไฟล์และรูปภาพ
- ติดต่อ LINE Messaging API และบริการภายนอก
- implement Repository interface ที่ Domain/Application กำหนด
- แปลงข้อมูลระหว่างฐานข้อมูลกับ Domain Entity

## Dependency direction

```text
Presentation ──> Application ──> Domain
      │                ▲
      └─> Infrastructure ──────┘
```

Dependency ต้องชี้เข้าหา Domain เสมอ Domain ห้ามอ้างอิง Framework หรือ Infrastructure

## Repository และ Dependency Injection

Application รับ Repository ผ่าน constructor:

```js
class RegisterPetUseCase {
  constructor({ petRepository, ownerRepository, unitOfWork }) {
    this.petRepository = petRepository;
    this.ownerRepository = ownerRepository;
    this.unitOfWork = unitOfWork;
  }

  async execute(command) {
    // orchestration only
  }
}
```

การสร้าง object จริงต้องรวมไว้ใน Composition Root ไม่สร้าง MariaDB repository หรือ LINE client กระจายอยู่ใน Use Case

## หลัก SOLID ที่ต้องตรวจทุกครั้ง

- SRP — หนึ่งคลาสมีเหตุผลหลักในการเปลี่ยนหนึ่งเรื่อง
- OCP — เพิ่มพฤติกรรมผ่าน abstraction โดยไม่แก้แกนหลักซ้ำ
- LSP — implementation ทดแทน interface ได้โดยไม่เปลี่ยนผลลัพธ์ที่คาดหมาย
- ISP — แยก interface ตามงาน ไม่สร้าง repository ขนาดใหญ่ที่ทำทุกอย่าง
- DIP — Application และ Domain พึ่ง abstraction ไม่พึ่ง MariaDB, Express หรือ LINE โดยตรง

## การใช้ packages ร่วมกัน

นำโค้ดไปไว้ใน `packages` เมื่อมีอย่างน้อยสองระบบใช้งานร่วมกันจริง เช่น:

- การยืนยันตัวตนและสิทธิ์
- HTTP client และ error contract
- Design tokens และ layout กลาง
- Notification interface

Entity และกฎธุรกิจเฉพาะระบบต้องอยู่ภายในระบบนั้น ไม่ย้ายไป shared เพียงเพื่อลดจำนวนไฟล์

## การทดสอบขั้นต่ำ

- Domain: unit test ทุก state transition และ validation สำคัญ
- Application: unit test ทุก Use Case โดยใช้ repository test double
- Infrastructure: integration test กับ MariaDB และ external adapter
- Presentation/API: request validation, authorization และ response contract
- Frontend: interaction สำคัญและ error/loading/empty state

## แนวทางปรับโค้ดเดิม

1. ห้ามปรับทั้งระบบในครั้งเดียว
2. เริ่มจากโมดูลที่กำลังแก้หรือพัฒนาในรอบนั้น
3. เขียน characterization test ป้องกันพฤติกรรมเดิม
4. แยก Domain rule และ Use Case ออกจาก Controller/React component
5. สร้าง Repository interface และ Infrastructure implementation
6. เชื่อม dependency ที่ Composition Root
7. รันทดสอบ Build และตรวจพฤติกรรมจริงก่อนรวมงาน

## Definition of Done

งานถือว่าเสร็จเมื่อ:

- อยู่ถูกชั้นและ dependency ไม่ย้อนทิศ
- ไม่มี business rule ใน React component, route handler หรือ SQL repository
- ไม่มีการเรียกฐานข้อมูลจาก Presentation
- มี validation และ error ที่ระบุความหมายชัดเจน
- มี test ตามระดับความเสี่ยง
- Build ผ่านและทดสอบ Use Case ที่ได้รับผลกระทบแล้ว
- ชื่อไฟล์ คลาส method และข้อความผู้ใช้สอดคล้องกับศัพท์ทางการของระบบ

