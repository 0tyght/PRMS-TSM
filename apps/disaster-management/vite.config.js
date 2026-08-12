import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS
    ? "/PRMS-TSM/disaster-management/"
    : process.env.SMART_THA_PHO_PUBLIC_SITE
      ? "/disaster-management/"
      : "/",
});
