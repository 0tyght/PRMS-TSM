import { ReportExportService } from "../../application/reports/ReportExportService.js";
import { createTabularReportPdf, createTabularReportXlsx, createVillageReportPdf, createVillageReportXlsx } from "../../modules/reports/reportExports.js";

export class ReportExportAdapter extends ReportExportService {
  createTabularPdf(report, options) { return createTabularReportPdf(report, options); }
  createTabularXlsx(report, options) { return createTabularReportXlsx(report, options); }
  createVillagePdf(rows, options) { return createVillageReportPdf(rows, options); }
  createVillageXlsx(rows, options) { return createVillageReportXlsx(rows, options); }
}

