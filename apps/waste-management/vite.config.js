import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS
    ? "/PRMS-TSM/waste-management/"
    : process.env.SMART_THA_PHO_PUBLIC_SITE
      ? "/waste-management/"
      : "/",
});
