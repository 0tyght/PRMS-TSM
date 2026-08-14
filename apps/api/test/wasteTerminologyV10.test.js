import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory =
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );

const repositoryRoot =
  path.resolve(
    testDirectory,
    "../../..",
  );

const sourceRoots = [
  "apps/waste-management/src",
  "apps/portal/src",
  "apps/api/src/modules/waste",
  "apps/api/src/modules/line",
];

const extensions =
  new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
  ]);

async function collectFiles(
  relativePath,
) {
  const absolutePath =
    path.join(
      repositoryRoot,
      relativePath,
    );

  let stat;

  try {
    stat =
      await fs.stat(
        absolutePath,
      );
  } catch {
    return [];
  }

  if (stat.isFile()) {
    return [
      absolutePath,
    ];
  }

  const entries =
    await fs.readdir(
      absolutePath,
      {
        withFileTypes: true,
      },
    );

  const files = [];

  for (const entry of entries) {
    if (
      entry.name ===
        "node_modules" ||
      entry.name ===
        "dist"
    ) {
      continue;
    }

    const child =
      path.join(
        absolutePath,
        entry.name,
      );

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...await collectFiles(
          path.relative(
            repositoryRoot,
            child,
          ),
        ),
      );

      continue;
    }

    if (
      extensions.has(
        path.extname(
          entry.name,
        ),
      )
    ) {
      files.push(child);
    }
  }

  return files;
}

test("waste runtime source follows V10 terminology", async () => {
  const files =
    (
      await Promise.all(
        sourceRoots.map(
          (root) =>
            collectFiles(root),
        ),
      )
    ).flat();

  const forbidden = [
    [
      "คน",
      "ขับ",
    ].join(""),

    [
      "จุดรับ",
      "บริการ",
    ].join(""),

    [
      "จุดรับ",
      "ขยะ",
    ].join(""),

    [
      "ท่าโพ",
      "ธ์",
    ].join(""),

    [
      "แผน",
      "งาน",
    ].join(""),

    [
      "กำหนด",
      "เก็บขยะ",
    ].join(""),

    [
      "ค่าบริการ",
      "ขยะ",
    ].join(""),

    [
      "เหตุระหว่าง",
      "ปฏิบัติงาน",
    ].join(""),
  ];

  const violations = [];

  const incompleteOperationPlanPattern =
    new RegExp(
      [
        "แผน",
        "ปฏิบัติงาน",
        "(?!เก็บขยะ)",
      ].join(""),
      "u",
    );

  const incompleteServiceRegistryPattern =
    new RegExp(
      [
        "ทะเบียน",
        "ผู้ใช้บริการ",
        "(?!เก็บขยะ)",
      ].join(""),
      "u",
    );

  for (const file of files) {
    const source =
      await fs.readFile(
        file,
        "utf8",
      );

    for (
      const term of
      forbidden
    ) {
      if (
        source.includes(
          term,
        )
      ) {
        violations.push(
          `${path.relative(
            repositoryRoot,
            file,
          )}: ${term}`,
        );
      }
    }

    if (
      incompleteOperationPlanPattern.test(source)
    ) {
      violations.push(
        `${path.relative(
          repositoryRoot,
          file,
        )}: incomplete operation-plan terminology`,
      );
    }

    if (
      incompleteServiceRegistryPattern.test(source)
    ) {
      violations.push(
        `${path.relative(
          repositoryRoot,
          file,
        )}: incomplete service-registry terminology`,
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
  );
});

test("FR17 citizen wording is separated from internal operation-plan wording", async () => {
  const planPage =
    await fs.readFile(
      path.join(
        repositoryRoot,
        "apps/waste-management/src/pages/PlansPage.jsx",
      ),
      "utf8",
    );

  const scheduleService =
    await fs.readFile(
      path.join(
        repositoryRoot,
        "apps/api/src/modules/waste/application/WasteCitizenScheduleService.js",
      ),
      "utf8",
    );

  const noticeFactory =
    await fs.readFile(
      path.join(
        repositoryRoot,
        "apps/api/src/modules/waste/domain/WastePlanNoticeFactory.js",
      ),
      "utf8",
    );

  assert.match(
    planPage,
    /แผนปฏิบัติงานเก็บขยะ/u,
  );

  assert.match(
    scheduleService,
    /ตารางกำหนดการเก็บขยะประจำพื้นที่/u,
  );

  assert.match(
    noticeFactory,
    /ตารางกำหนดการเก็บขยะประจำพื้นที่/u,
  );
});

test("V10 staff, service location, collection point, and incident labels are visible", async () => {
  const resources =
    await fs.readFile(
      path.join(
        repositoryRoot,
        "apps/waste-management/src/pages/ResourcesPage.jsx",
      ),
      "utf8",
    );

  const serviceUsers =
    await fs.readFile(
      path.join(
        repositoryRoot,
        "apps/waste-management/src/pages/ServiceUsersPage.jsx",
      ),
      "utf8",
    );

  const ui =
    await fs.readFile(
      path.join(
        repositoryRoot,
        "apps/waste-management/src/components/ui.jsx",
      ),
      "utf8",
    );

  assert.match(
    resources,
    /พนักงานประจำรถขยะ/u,
  );

  assert.match(
    serviceUsers,
    /สถานที่รับบริการ/u,
  );

  assert.match(
    serviceUsers,
    /ทะเบียนผู้ใช้บริการเก็บขยะ/u,
  );

  assert.match(
    resources,
    /จุดเก็บขยะ/u,
  );

  assert.match(
    ui,
    /REPORTED:\s*"รอรับทราบ"/u,
  );

  assert.match(
    ui,
    /ACKNOWLEDGED:\s*"รับทราบแล้ว"/u,
  );

  assert.match(
    ui,
    /RESOLVED:\s*"ปิดเหตุแล้ว"/u,
  );
});
