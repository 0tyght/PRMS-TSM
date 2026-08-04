const APP_KIND = "admin";
const ROOT_CLASS = `prms-pro-ui--${APP_KIND}`;
const CARD_SELECTOR = APP_KIND === "admin"
  ? [
      ".panel", ".stat", ".module-panel", ".report-panel", ".core-panel",
      ".production-kpi", ".production-map-card", ".production-area-panel",
      ".production-village-card", ".production-request-card",
      ".settings-grid > article", ".service-summary > article",
      ".report-stats > article", ".village-cards > article"
    ].join(",")
  : [
      ".pet-card", ".track-card", ".owner-card", ".my-grid > article",
      ".account-loading", ".line-connect", ".link-owner-form"
    ].join(",");

const SCROLL_SELECTOR = APP_KIND === "admin"
  ? ".table-wrap,.core-table-wrap,.report-table-wrap"
  : ".citizen-modal > section";

const INTERACTIVE_SELECTOR = [
  "button", "a", "input", "select", "textarea", "label",
  "[role='button']", ".leaflet-container", ".leaflet-control"
].join(",");

let decorateQueued = false;

function queueDecorate(root = document) {
  if (decorateQueued) return;
  decorateQueued = true;
  requestAnimationFrame(() => {
    decorateQueued = false;
    decorate(root);
  });
}

function decorate(root = document) {
  root.querySelectorAll?.(CARD_SELECTOR).forEach((element) => {
    element.dataset.prmsCard = "";
  });

  root.querySelectorAll?.(SCROLL_SELECTOR).forEach((element) => {
    element.dataset.prmsScroll = "";
  });

  root.querySelectorAll?.("button,[role='button'],a").forEach((element) => {
    if (!element.dataset.prmsRipple) {
      element.dataset.prmsRipple = "";
    }

    const label = element.getAttribute("aria-label") || element.getAttribute("title");
    const text = (element.textContent || "").trim();
    if (label && text.length <= 2 && !element.dataset.prmsTooltip) {
      element.dataset.prmsTooltip = label;
    }
  });

  root.querySelectorAll?.("table").forEach((table) => {
    table.classList.add("prms-table-responsive");

    const headings = [...table.querySelectorAll("thead th")].map((cell) =>
      (cell.textContent || "").trim()
    );

    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (!cell.dataset.prmsLabel && headings[index]) {
          cell.dataset.prmsLabel = headings[index];
        }
      });
    });
  });
}

function installPointerGlow() {
  document.addEventListener("pointermove", (event) => {
    const card = event.target.closest?.("[data-prms-card]");
    if (!card) return;

    const rect = card.getBoundingClientRect();
    card.style.setProperty("--prms-pointer-x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--prms-pointer-y", `${event.clientY - rect.top}px`);
  }, { passive: true });

  document.addEventListener("pointerleave", (event) => {
    const card = event.target.closest?.("[data-prms-card]");
    if (!card) return;
    card.style.removeProperty("--prms-pointer-x");
    card.style.removeProperty("--prms-pointer-y");
  }, true);
}

function installRipple() {
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    const target = event.target.closest?.("[data-prms-ripple]");
    if (!target || target.matches(":disabled,[aria-disabled='true']")) return;

    const rect = target.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "prms-ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    target.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
}

function installDragScroll() {
  let state = null;

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch") return;

    const surface = event.target.closest?.("[data-prms-scroll]");
    if (!surface || surface.scrollWidth <= surface.clientWidth) return;
    if (event.target.closest(INTERACTIVE_SELECTOR)) return;

    state = {
      surface,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: surface.scrollLeft,
      moved: false
    };

    surface.setPointerCapture?.(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!state || event.pointerId !== state.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

    state.moved = true;
    state.surface.classList.add("is-dragging");
    state.surface.scrollLeft = state.startLeft - dx;
    event.preventDefault();
  }, { passive: false });

  const finish = (event) => {
    if (!state || event.pointerId !== state.pointerId) return;
    state.surface.classList.remove("is-dragging");
    state.surface.releasePointerCapture?.(event.pointerId);
    state = null;
  };

  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);
}

function installKeyboardPolish() {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest?.("[role='button']");
    if (!target || target.matches("button,a,input,select,textarea")) return;
    event.preventDefault();
    target.click();
  });
}

function install() {
  document.documentElement.dataset.prmsUi = "professional";
  document.documentElement.dataset.prmsApp = APP_KIND;
  document.body.classList.add(ROOT_CLASS);

  decorate(document);
  installPointerGlow();
  installRipple();
  installDragScroll();
  installKeyboardPolish();

  const observer = new MutationObserver((records) => {
    const root = records.find((record) => record.addedNodes.length)?.target || document;
    queueDecorate(root instanceof Element ? root : document);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", () => queueDecorate(document), { passive: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}
