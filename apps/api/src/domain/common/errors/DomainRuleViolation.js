export class DomainRuleViolation extends Error {
  constructor(code, message, { status = 409, details = null } = {}) {
    super(message);
    this.name = "DomainRuleViolation";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

