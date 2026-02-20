// src/lib/iranWarPowersConfig.ts
// Editable configuration for Iran War Powers Resolution tracker page
// Update the text below to change what appears on the page

export const IRAN_WAR_POWERS_CONFIG = {
  title: "Where do YOUR lawmakers stand on going to war with Iran?",
  subtitle: "Search by name or address to see where your representatives stand on preventing unauthorized war with Iran.",

  house: {
    preferred: {
      column: "H.Con.Res.38 — Iran War Powers Resolution (Preferred)",
      billName: "Massie-Khanna Iran War Powers Resolution",
      positive: "Rep. {name} has cosponsored the Massie-Khanna Iran War Powers Resolution!",
    },
    alternative: {
      column: "H.Con.Res.40 — Iran War Powers Resolution",
      billName: "Smith-Meeks Iran War Powers Resolution",
      positive: "Rep. {name} has cosponsored the Smith-Meeks Iran War Powers Resolution, which is positive but includes exceptions to allow U.S. military action in defense of Israel.",
    },
    negative: "Rep. {name} has not cosponsored either Iran War Powers Resolution.",
  },

  senate: {
    column: "S.J.Res.59 — Iran War Powers Resolution",
    billName: "Iran War Powers Resolution",
    positive: "Sen. {name} has supported the Iran War Powers Resolution!",
    negative: "Sen. {name} has opposed the Iran War Powers Resolution.",
  },
};
