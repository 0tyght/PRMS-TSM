export class ThaiPhoneNumber {
  static normalize(value = "") {
    return String(value).replace(/\D/g, "").slice(0, 10);
  }

  static isValid(value) {
    return /^0\d{9}$/.test(ThaiPhoneNumber.normalize(value));
  }

  constructor(value) {
    const normalized = ThaiPhoneNumber.normalize(value);
    if (!ThaiPhoneNumber.isValid(normalized)) {
      throw new TypeError("กรุณาระบุหมายเลขโทรศัพท์ 10 หลัก");
    }
    this.value = normalized;
    Object.freeze(this);
  }

  toString() {
    return this.value;
  }
}

