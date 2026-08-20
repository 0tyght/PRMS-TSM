export const WASTE_LINE_CARD_COLORS = Object.freeze({
  GREEN: "#087F5B",
  BLUE: "#126E9C",
  ORANGE: "#B86108",
  RED: "#B63A32",
  SLATE: "#415B53",
  INK: "#173B2F",
  MUTED: "#60786E",
  SURFACE: "#F4F8F5",
  BORDER: "#DDE9E2",
});

const CARD_TINTS = Object.freeze({
  [WASTE_LINE_CARD_COLORS.GREEN]: "#E6F5ED",
  [WASTE_LINE_CARD_COLORS.BLUE]: "#E7F1F8",
  [WASTE_LINE_CARD_COLORS.ORANGE]: "#FFF2DF",
  [WASTE_LINE_CARD_COLORS.RED]: "#FCE9E7",
  [WASTE_LINE_CARD_COLORS.SLATE]: "#EDF2F0",
  "#176B50": "#E6F5ED",
  "#8A5A22": "#FFF2DF",
  "#7A5B2F": "#FFF2DF",
  "#9A4C2D": "#FCE9E7",
  "#315E86": "#E7F1F8",
});

export function wasteLineCardTint(accent) {
  return CARD_TINTS[accent] || "#EAF4EF";
}

export function lineCardText(text, options = {}) {
  return {
    type: "text",
    text: String(text || "-").slice(0, options.maxLength || 900),
    size: options.size || "sm",
    color: options.color || WASTE_LINE_CARD_COLORS.INK,
    ...(options.weight ? { weight: options.weight } : {}),
    wrap: options.wrap !== false,
    ...(options.align ? { align: options.align } : {}),
    ...(options.flex != null ? { flex: options.flex } : {}),
    ...(options.margin ? { margin: options.margin } : {}),
    ...(options.lineSpacing ? { lineSpacing: options.lineSpacing } : {}),
  };
}

export function lineCardStatus(label, accent = WASTE_LINE_CARD_COLORS.GREEN) {
  return {
    type: "box",
    layout: "vertical",
    flex: 0,
    backgroundColor: wasteLineCardTint(accent),
    cornerRadius: "999px",
    paddingStart: "9px",
    paddingEnd: "9px",
    paddingTop: "5px",
    paddingBottom: "5px",
    contents: [lineCardText(label, {
      size: "xxs",
      color: accent,
      weight: "bold",
      wrap: false,
      maxLength: 42,
    })],
  };
}

export function lineCardRow(label, value, options = {}) {
  return {
    type: "box",
    layout: "vertical",
    ...(options.margin ? { margin: options.margin } : {}),
    contents: [
      lineCardText(label, { size: "xxs", color: WASTE_LINE_CARD_COLORS.MUTED, weight: "bold" }),
      lineCardText(value, {
        size: options.size || "sm",
        color: WASTE_LINE_CARD_COLORS.INK,
        weight: options.weight || "bold",
        margin: "xs",
        maxLength: options.maxLength || 300,
      }),
    ],
  };
}

export function lineCardButton(label, action, {
  color = WASTE_LINE_CARD_COLORS.GREEN,
  style = "primary",
} = {}) {
  return {
    type: "button",
    style,
    height: "sm",
    ...(style === "primary" ? { color } : {}),
    action,
  };
}

function dataPanel(rows) {
  const visibleRows = rows.filter(Boolean);
  if (!visibleRows.length) return [];
  return [{
    type: "box",
    layout: "vertical",
    backgroundColor: WASTE_LINE_CARD_COLORS.SURFACE,
    cornerRadius: "12px",
    paddingAll: "14px",
    spacing: "md",
    contents: visibleRows,
  }];
}

// The card intentionally leaves the header white.  Accent colours appear only
// in the small status chip and action button, so the information remains easy
// to scan and never looks like a warning just because it is a different route.
export function lineCardBubble({
  eyebrow = "บริการเก็บขยะ",
  title,
  subtitle = "",
  accent = WASTE_LINE_CARD_COLORS.GREEN,
  statusLabel = "",
  rows = [],
  footerActions = [],
}) {
  const visibleFooterActions = footerActions.filter(Boolean);
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      paddingBottom: "14px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            lineCardText(eyebrow, { size: "xxs", color: accent, weight: "bold", flex: 1, maxLength: 90 }),
            ...(statusLabel ? [lineCardStatus(statusLabel, accent)] : []),
          ],
        },
        lineCardText(title, { size: "lg", color: WASTE_LINE_CARD_COLORS.INK, weight: "bold", margin: "sm", maxLength: 120 }),
        ...(subtitle ? [lineCardText(subtitle, { size: "xs", color: WASTE_LINE_CARD_COLORS.MUTED, margin: "xs", maxLength: 180 })] : []),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingStart: "18px",
      paddingEnd: "18px",
      paddingBottom: "18px",
      contents: dataPanel(rows),
    },
    ...(visibleFooterActions.length
      ? {
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "14px",
          spacing: "sm",
          contents: visibleFooterActions,
        },
      }
      : {}),
  };
}

export function cardButtonsFromActions(actions = [], accent = WASTE_LINE_CARD_COLORS.GREEN, max = 2) {
  return actions
    .filter((action) => action && ["postback", "message", "uri"].includes(action.type))
    .filter((action) => !["ยกเลิก", "เมนูขยะ", "เมนูพนักงาน", "Smart Tha Pho"].includes(action.label))
    .slice(0, max)
    .map((action, index) => lineCardButton(action.label, action, {
      color: accent,
      style: index === 0 ? "primary" : "secondary",
    }));
}
