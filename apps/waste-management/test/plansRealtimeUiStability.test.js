import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

test("silent plans polling preserves the current plan array when nothing changed", () => {
  const plans = source("pages/PlansPage.jsx");

  assert.match(
    plans,
    /const nextPlans = await api\.get\("\/api\/waste\/plans"\)/,
  );
  assert.match(
    plans,
    /JSON\.stringify\(current\) === JSON\.stringify\(nextPlans\)/,
  );
});

test("modal focus setup is not restarted by every parent render", () => {
  const ui = source("components/ui.jsx");

  assert.match(ui, /const onCloseRef = useRef\(onClose\)/);
  assert.match(ui, /onCloseRef\.current = onClose/);
  assert.match(ui, /if \(event\.key === "Escape"\) onCloseRef\.current\?\.\(\)/);

  const modalSource = ui.match(
    /export function Modal\([\s\S]*?export function formatNumber/,
  )?.[0] || "";

  assert.ok(modalSource);
  assert.match(modalSource, /\}, \[\]\);/);
  assert.doesNotMatch(modalSource, /\}, \[onClose\]\);/);
});

test("readiness confirmation and publication are separate workflow steps", () => {
  const plans = source("pages/PlansPage.jsx");
  const progress = plans.match(
    /function planProgressStep\(plan\) \{[\s\S]*?\n\}/,
  )?.[0] || "";

  assert.ok(progress);
  assert.doesNotMatch(progress, /wastePlanPolicy\.readiness/);
  assert.match(progress, /readinessConfirmedAt[\s\S]*?return 1/);
  assert.match(
    progress,
    /publicationStatus === "PUBLISHED"[\s\S]*?return 2/,
  );
  assert.match(plans, /\/api\/waste\/plans\/\$\{plan\.id\}\/readiness/);
  assert.match(plans, /ยืนยันตรวจความพร้อม/);
  assert.match(plans, />ประกาศแผน<\/button>/);
  assert.match(plans, /ยืนยันประกาศแผน \+ ส่ง LINE/);
  assert.doesNotMatch(plans, />ตรวจและประกาศ<\/button>/);
});
