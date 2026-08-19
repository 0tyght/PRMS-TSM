import {
  setDefaultStandaloneRichMenu,
  showStandaloneRichMenuForLineUser,
} from "./lineRichMenuWizard.js";

function postback(
  label,
  data,
  displayText = label,
) {
  return {
    type: "postback",
    label,
    data,
    displayText,
    inputOption: "openRichMenu",
  };
}

export function buildSmartThaPhoMainRichMenuDefinition() {
  return {
    key: "smart-tha-pho-main-v1",
    title: "Smart Tha Pho",
    subtitle: "เลือกบริการที่ต้องการใช้งาน",
    cacheScope: "static",
    isMain: true,
    choices: [
      {
        label: "ทะเบียนสัตว์เลี้ยง",
        action: postback(
          "ทะเบียนสัตว์เลี้ยง",
          "smart=pet",
          "เปิดระบบทะเบียนสัตว์เลี้ยง",
        ),
      },
      {
        label: "รถเก็บขยะ",
        action: postback(
          "รถเก็บขยะ",
          "smart=waste",
          "เปิดระบบบริหารจัดการการเก็บขยะ",
        ),
      },
      {
        label: "บรรเทาสาธารณภัย",
        action: postback(
          "บรรเทาสาธารณภัย",
          "smart=disaster",
          "เปิดระบบบรรเทาสาธารณภัย",
        ),
      },
      {
        label: "การประปา",
        action: postback(
          "การประปา",
          "smart=waterworks",
          "เปิดระบบการประปา",
        ),
      },
    ],
  };
}

export function buildWasteCitizenRichMenuDefinition() {
  return {
    key: "smart-tha-pho-waste-citizen-v1",
    title: "บริการเก็บขยะ",
    subtitle: "ประชาชน • เทศบาลเมืองท่าโพธิ์",
    cacheScope: "static",
    isMain: true,
    choices: [
      {
        label: "ลงทะเบียนผู้ใช้บริการเก็บขยะ",
        action: postback(
          "ลงทะเบียนผู้ใช้บริการเก็บขยะ",
          "waste=register",
          "ลงทะเบียนผู้ใช้บริการเก็บขยะ",
        ),
      },
      {
        label: "ตารางกำหนดการ",
        action: postback(
          "ตารางกำหนดการ",
          "waste=citizen_schedule",
          "ตารางกำหนดการเก็บขยะประจำพื้นที่",
        ),
      },
      {
        label: "ตำแหน่งรถเก็บขยะ",
        action: postback(
          "ตำแหน่งรถเก็บขยะ",
          "waste=citizen_location",
          "ดูตำแหน่งรถเก็บขยะ",
        ),
      },
      {
        label: "ค่าบริการเก็บขยะ",
        action: postback(
          "ค่าบริการเก็บขยะ",
          "waste=citizen_charges",
          "ตรวจสอบค่าบริการเก็บขยะ",
        ),
      },
      {
        label: "Smart Tha Pho",
        action: postback(
          "Smart Tha Pho",
          "smart=menu",
          "กลับเมนูหลัก Smart Tha Pho",
        ),
      },
    ],
  };
}

export function showSmartThaPhoMainRichMenu(
  lineUserId,
) {
  return showStandaloneRichMenuForLineUser(
    lineUserId,
    buildSmartThaPhoMainRichMenuDefinition(),
  );
}

export function showWasteCitizenRichMenu(
  lineUserId,
) {
  return showStandaloneRichMenuForLineUser(
    lineUserId,
    buildWasteCitizenRichMenuDefinition(),
  );
}

export function syncSmartThaPhoDefaultRichMenu() {
  return setDefaultStandaloneRichMenu(
    buildSmartThaPhoMainRichMenuDefinition(),
  );
}