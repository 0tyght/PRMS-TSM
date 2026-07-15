import mysql from "mysql2/promise";
import "dotenv/config";

const db = await mysql.createConnection({
  host:process.env.DB_HOST||"127.0.0.1", port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER||"root", password:process.env.DB_PASSWORD||"", database:process.env.DB_NAME||"prms_tsm",
});
const [[admin]] = await db.query("SELECT id FROM users WHERE role='ADMIN' AND is_active=1 ORDER BY created_at LIMIT 1");
if (!admin) throw new Error("กรุณาสร้างบัญชีผู้ดูแลก่อนเพิ่มข้อมูลสาธิต");

const uuid = (prefix, no) => `${prefix}0000000-0000-4000-8000-${String(no).padStart(12,"0")}`;
const ownerNames = ["สมชาย ใจดี","มาลี พูนสุข","วิชัย แก้วดี","สุนิสา มีสุข","ประเสริฐ ทองแท้","นงลักษณ์ บุญมา","อนันต์ คำดี","จันทร์เพ็ญ ร่มเย็น","ธนวัฒน์ ศรีสุข","พิมพ์ใจ แสงทอง","สมคิด นาคงาม","กัลยา อยู่ดี","ณัฐวุฒิ แก้วใส","อรทัย ทองสุข","ประภาส คงมั่น","สุภาวดี ใจงาม","วิโรจน์ พันธุ์ดี","รัตนา มีศรี","ชัยวัฒน์ สุขใจ","พรทิพย์ แก้วคำ","มนัส ทองอยู่","วิภา รุ่งเรือง","อาคม บุญช่วย","สุดา แสงแก้ว","เกรียงไกร ใจตรง","อารีย์ พูนผล","สุชาติ รักดี","วาสนา งามพร้อม","บุญส่ง คำแหง","ปวีณา จันทร์ดี"];
const petNames = ["เจ้าดำ","มะลิ","ถุงทอง","โกโก้","นำโชค","ข้าวปั้น","น้ำตาล","มีตังค์","ไข่ตุ๋น","ส้มจี๊ด","ข้าวเหนียว","ชาไทย","ลูกชิ้น","ปลาทู","ฟักทอง","แสนดี","บุญรอด","เปียกปูน","โอเลี้ยง","โมจิ","แพนด้า","ขนุน","ถั่วแดง","กะทิ","คุกกี้","พุดดิ้ง","ทองเอก","ดอลลี่","แจ่มใส","ตั้งใจ"];
const dogBreeds = ["ไทยหลังอาน","พันธุ์ทาง","บางแก้ว","ชิสุ","ลาบราดอร์"];
const catBreeds = ["ไทย","วิเชียรมาศ","เปอร์เซีย","พันธุ์ทาง"];
const colors = ["ดำ","ขาว–น้ำตาล","ลายเสือ","ส้ม","ขาว","น้ำตาล","เทา"];
const statuses = Array.from({length:30},(_,i)=>i<24?"APPROVED":i<27?"SUBMITTED":i<29?"UNDER_REVIEW":"REJECTED");

await db.beginTransaction();
try {
  await db.query("DELETE FROM audit_logs WHERE entity_id LIKE '40000000-%' OR entity_id LIKE '30000000-%' OR entity_id LIKE '70000000-%'");
  await db.query("DELETE FROM vaccination_records WHERE id LIKE '50000000-%'");
  await db.query("DELETE FROM sterilization_records WHERE id LIKE '60000000-%'");
  await db.query("DELETE FROM registrations WHERE id LIKE '40000000-%'");
  await db.query("DELETE FROM pets WHERE id LIKE '30000000-%'");
  await db.query("DELETE FROM owners WHERE id LIKE '20000000-%'");
  await db.query("DELETE FROM households WHERE id LIKE '10000000-%'");
  await db.query("DELETE FROM cases WHERE id LIKE '70000000-%'");

  for (let i=0;i<30;i++) {
    const no=i+1, village=(i%11)+1, species=i%3===1?"CAT":"DOG", approved=statuses[i]==="APPROVED";
    const houseId=uuid("1",no), ownerId=uuid("2",no), petId=uuid("3",no), regId=uuid("4",no);
    const submittedDay=String(2+(i%13)).padStart(2,"0");
    await db.execute("INSERT INTO households (id,house_no,village_id,address_detail,latitude,longitude) VALUES (?,?,?,?,?,?)",[houseId,`${18+(i*7)%190}${i%5===0?'/1':''}`,village,"เทศบาลท่าโพธ์",16.80+(i%11)*0.0012,100.25+(i%7)*0.0014]);
    await db.execute("INSERT INTO owners (id,household_id,full_name,national_id,phone,line_user_id,consent_at) VALUES (?,?,?,NULL,?,?,NOW())",[ownerId,houseId,ownerNames[i],`08${String(10000000+i*7919).slice(-8)}`,i<22?`U_DEMO_${String(no).padStart(3,'0')}`:null]);
    await db.execute("INSERT INTO pets (id,owner_id,registration_no,name,species,sex,breed,color,birth_date,status) VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE')",[petId,ownerId,approved?`PET-2569-${String(no).padStart(4,"0")}`:null,petNames[i],species,i%4===0?"UNKNOWN":i%2===0?"MALE":"FEMALE",species==="DOG"?dogBreeds[i%dogBreeds.length]:catBreeds[i%catBreeds.length],colors[i%colors.length],`202${1+(i%5)}-${String(1+(i%12)).padStart(2,'0')}-${String(1+(i%25)).padStart(2,'0')}`]);
    await db.execute("INSERT INTO registrations (id,reference_no,owner_id,pet_id,status,review_note,reviewed_by,submitted_at,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?)",[regId,`TSM-2569-${100100+no}`,ownerId,petId,statuses[i],approved?"ตรวจสอบข้อมูลและหลักฐานครบถ้วน":statuses[i]==="REJECTED"?"ที่อยู่นอกเขตให้บริการ":null,approved||statuses[i]==="REJECTED"?admin.id:null,`2026-07-${submittedDay} ${String(8+(i%8)).padStart(2,'0')}:30:00`,approved||statuses[i]==="REJECTED"?`2026-07-${String(Math.min(15,4+(i%12))).padStart(2,'0')} 10:15:00`:null]);
    if (approved && i<19) await db.execute("INSERT INTO vaccination_records (id,pet_id,vaccine_name,lot_no,vaccinated_at,next_due_at,provider_name,recorded_by) VALUES (?,?, 'วัคซีนป้องกันโรคพิษสุนัขบ้า', ?, ?, ?, 'เทศบาลท่าโพธ์', ?)",[uuid("5",no),petId,`RB-69-${String(200+i).padStart(4,'0')}`,`2026-${String(2+(i%5)).padStart(2,'0')}-${String(5+(i%20)).padStart(2,'0')}`,`2027-${String(2+(i%5)).padStart(2,'0')}-${String(5+(i%20)).padStart(2,'0')}`,admin.id]);
    if (approved && i%2===0) await db.execute("INSERT INTO sterilization_records (id,pet_id,sterilized_at,provider_name,note,recorded_by) VALUES (?,?,?,'เทศบาลท่าโพธ์','บริการตามโครงการควบคุมประชากรสัตว์',?)",[uuid("6",no),petId,`2026-${String(1+(i%6)).padStart(2,'0')}-${String(3+(i%20)).padStart(2,'0')}`,admin.id]);
  }

  const cases = [
    ["STRAY","พบสุนัขจรจัดรวมกลุ่มบริเวณตลาดช่วงเย็น","RECEIVED",3],
    ["BITE","สุนัขกัดผู้ขับขี่รถจักรยานยนต์บริเวณทางเข้าหมู่บ้าน","IN_PROGRESS",5],
    ["SICK","พบแมวมีอาการป่วยและไม่สามารถเดินได้","ASSIGNED",2],
    ["NUISANCE","สุนัขเห่าส่งเสียงดังในช่วงกลางคืน","RESOLVED",8],
    ["STRAY","ลูกสุนัขถูกทิ้งใกล้วัด จำนวน 4 ตัว","IN_PROGRESS",1],
    ["OTHER","ขอให้ตรวจสอบสัตว์เลี้ยงที่ไม่มีผู้ดูแล","CLOSED",10],
    ["BITE","ประชาชนขอคำแนะนำหลังสัมผัสสัตว์ต้องสงสัย","RECEIVED",6],
    ["SICK","พบสุนัขมีบาดแผลบริเวณริมถนน","ASSIGNED",11],
  ];
  for (let i=0;i<cases.length;i++) { const [category,description,status,village]=cases[i]; await db.execute("INSERT INTO cases (id,reference_no,reporter_name,reporter_phone,village_id,category,description,latitude,longitude,status,assigned_to,resolved_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",[uuid("7",i+1),`CASE-2569-${String(501+i).padStart(4,'0')}`,ownerNames[20+i],`09${String(20000000+i*7311).slice(-8)}`,village,category,description,16.80+i*.001,100.25+i*.001,status,status==="RECEIVED"?null:admin.id,["RESOLVED","CLOSED"].includes(status)?"2026-07-14 15:20:00":null,`2026-07-${String(8+i).padStart(2,'0')} 09:20:00`]); }
  await db.commit();
  console.log("สร้างข้อมูลสาธิต: สัตว์ 30 ตัว, อนุมัติแล้ว 24 ตัว, แจ้งเหตุ 8 รายการ");
} catch (error) {
  await db.rollback(); throw error;
} finally { await db.end(); }
