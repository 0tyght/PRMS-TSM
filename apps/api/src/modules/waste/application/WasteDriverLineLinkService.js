import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WasteDriverLineLinkService {
  constructor({
    repository,
    auditLog,
    codeSecurity,
    idFactory =
      () => crypto.randomUUID(),
    expiresInMinutes = 15,
    maxAttempts = 5,
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteDriverLineLinkService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WasteDriverLineLinkService requires auditLog",
      );
    }

    if (!codeSecurity) {
      throw new TypeError(
        "WasteDriverLineLinkService requires codeSecurity",
      );
    }

    this.repository =
      repository;

    this.auditLog =
      auditLog;

    this.codeSecurity =
      codeSecurity;

    this.idFactory =
      idFactory;

    this.expiresInMinutes =
      Number(expiresInMinutes);

    this.maxAttempts =
      Number(maxAttempts);
  }

  async createLinkCode(
    driverId,
    actor,
  ) {
    const driver =
      await this.repository
        .findDriver(driverId);

    if (!driver) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_NOT_FOUND",
        "ไม่พบข้อมูลพนักงานประจำรถขยะ",
        { status: 404 },
      );
    }

    let code = null;
    let codeHash = null;

    for (
      let attempt = 0;
      attempt < this.maxAttempts;
      attempt += 1
    ) {
      const candidate =
        this.codeSecurity
          .generateCode();

      const candidateHash =
        this.codeSecurity
          .hash(candidate);

      const duplicate =
        await this.repository
          .activeCodeExists(
            candidateHash,
          );

      if (!duplicate) {
        code = candidate;
        codeHash =
          candidateHash;

        break;
      }
    }

    if (!code) {
      throw new DomainRuleViolation(
        "WASTE_DRIVER_LINE_CODE_UNAVAILABLE",
        "ไม่สามารถสร้างรหัสเชื่อม LINE ได้ กรุณาลองอีกครั้ง",
        { status: 503 },
      );
    }

    await this.repository
      .transaction(
        async (db) => {
          await this.repository
            .replaceActiveCode(
              db,
              {
                id:
                  this.idFactory(),
                driverId,
                codeHash,
                expiresInMinutes:
                  this.expiresInMinutes,
                createdBy:
                  actor.userId,
              },
            );
        },
      );

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "CREATE_WASTE_DRIVER_LINE_CODE",
      entityType:
        "WASTE_DRIVER",
      entityId:
        driverId,
      nextValue: {
        expiresInMinutes:
          this.expiresInMinutes,
      },
      ipAddress:
        actor.ipAddress,
    });

    return {
      code,
      driverName:
        driver.fullName,
      expiresInMinutes:
        this.expiresInMinutes,
    };
  }
}
