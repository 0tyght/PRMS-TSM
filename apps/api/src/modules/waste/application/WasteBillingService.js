import crypto from "node:crypto";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteFeeRate } from "../domain/WasteFeeRate.js";
import { WasteServiceCharge } from "../domain/WasteServiceCharge.js";

export class WasteBillingService {
  constructor({
    repository,
    auditLog,
    noticeFactory,
    idFactory =
      () => crypto.randomUUID(),
    now =
      () => new Date(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteBillingService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WasteBillingService requires auditLog",
      );
    }

    if (!noticeFactory) {
      throw new TypeError(
        "WasteBillingService requires noticeFactory",
      );
    }

    this.repository =
      repository;
    this.auditLog =
      auditLog;
    this.noticeFactory =
      noticeFactory;
    this.idFactory =
      idFactory;
    this.now =
      now;
  }

  async listFeeRates() {
    const rows =
      await this.repository
        .listFeeRates();

    return rows.map(
      (row) =>
        new WasteFeeRate(
          row,
        ).toObject(),
    );
  }

  async createFeeRate(
    input,
    actor,
  ) {
    const feeRate =
      new WasteFeeRate({
        id:
          this.idFactory(),
        ...input,
      });

    await this.repository
      .createFeeRate(
        feeRate.toObject(),
      );

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "CREATE_WASTE_FEE_RATE",
      entityType:
        "WASTE_FEE_RATE",
      entityId:
        feeRate.id,
      nextValue:
        input,
      ipAddress:
        actor.ipAddress,
    });

    return feeRate.toObject();
  }

  async updateFeeRate(
    id,
    input,
    actor,
  ) {
    const current =
      await this.repository
        .findFeeRate(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_FEE_RATE_NOT_FOUND",
        "ไม่พบอัตราค่าบริการเก็บขยะ",
        { status: 404 },
      );
    }

    new WasteFeeRate(
      current,
    ).update(input);

    const saved =
      await this.repository
        .updateFeeRate(
          id,
          input,
        );

    if (!saved) {
      throw new DomainRuleViolation(
        "WASTE_FEE_RATE_NOT_FOUND",
        "ไม่พบอัตราค่าบริการเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "UPDATE_WASTE_FEE_RATE",
      entityType:
        "WASTE_FEE_RATE",
      entityId:
        id,
      nextValue:
        input,
      ipAddress:
        actor.ipAddress,
    });

    return {
      id,
      ...input,
    };
  }

  async listCharges(
    query = {},
  ) {
    return this.repository
      .listCharges(query);
  }

  async createCharge(
    input,
    actor,
  ) {
    const charge =
      new WasteServiceCharge({
        id:
          this.idFactory(),
        ...input,
        status:
          "PENDING",
      });

    charge
      .assertScheduleValid();

    await this.repository
      .createCharge(
        charge.toObject(),
      );

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "CREATE_WASTE_CHARGE",
      entityType:
        "WASTE_SERVICE_CHARGE",
      entityId:
        charge.id,
      nextValue:
        input,
      ipAddress:
        actor.ipAddress,
    });

    return {
      id:
        charge.id,
      ...input,
      status:
        "PENDING",
    };
  }

  async updateCharge(
    id,
    input,
    actor,
  ) {
    const current =
      await this.repository
        .findCharge(id);

    if (!current) {
      throw new DomainRuleViolation(
        "WASTE_CHARGE_NOT_FOUND",
        "ไม่พบรายการค่าบริการ",
        { status: 404 },
      );
    }

    const charge =
      new WasteServiceCharge(
        current,
      );

    charge.changeStatus(
      input.status,
      this.now(),
    );

    const saved =
      await this.repository
        .updateChargeStatus(
          id,
          {
            status:
              charge.status,
            paidAt:
              charge.paidAt,
          },
        );

    if (!saved) {
      throw new DomainRuleViolation(
        "WASTE_CHARGE_NOT_FOUND",
        "ไม่พบรายการค่าบริการ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "UPDATE_WASTE_CHARGE",
      entityType:
        "WASTE_SERVICE_CHARGE",
      entityId:
        id,
      nextValue:
        input,
      ipAddress:
        actor.ipAddress,
    });

    return {
      id,
      ...input,
      paidAt:
        charge.paidAt,
    };
  }

  async queueNotice(
    id,
    actor,
  ) {
    const notificationId =
      this.idFactory();

    await this.repository
      .transaction(
        async (db) => {
          const context =
            await this.repository
              .findChargeNoticeContext(
                db,
                id,
                {
                  lock: true,
                },
              );

          if (!context) {
            throw new DomainRuleViolation(
              "WASTE_CHARGE_NOT_FOUND",
              "ไม่พบรายการค่าบริการ",
              { status: 404 },
            );
          }

          const charge =
            new WasteServiceCharge(
              context,
            );

          charge
            .assertNoticeable()
            .assertLineLinked();

          const message =
            this.noticeFactory
              .create(charge);

          await this.repository
            .enqueueChargeNotice(
              db,
              {
                notificationId,
                charge:
                  charge.toObject(),
                message,
              },
            );

          await this.repository
            .markNoticeRequested(
              db,
              id,
            );
        },
      );

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "QUEUE_WASTE_CHARGE_NOTICE",
      entityType:
        "WASTE_SERVICE_CHARGE",
      entityId:
        id,
      nextValue: {
        notificationId,
      },
      ipAddress:
        actor.ipAddress,
    });

    return {
      notificationId,
      status:
        "PENDING",
    };
  }
}
