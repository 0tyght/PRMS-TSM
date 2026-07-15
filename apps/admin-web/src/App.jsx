import { useMemo, useState } from "react";
import { ADMIN_MENU } from "./config/navigation.js";
import { useHashPage } from "./hooks/useHashPage.js";
import AdminLayout from "./components/layout/AdminLayout.jsx";
import PageErrorBoundary from "./components/layout/PageErrorBoundary.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import RegistrationsPage from "./pages/RegistrationsPage.jsx";
import PetsPage from "./pages/PetsPage.jsx";
import ServicesPage from "./pages/ServicesPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import CasesPage from "./pages/CasesPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

const PAGE_COMPONENTS={dashboard:DashboardPage,registrations:RegistrationsPage,pets:PetsPage,services:ServicesPage,map:MapPage,cases:CasesPage,reports:ReportsPage,settings:SettingsPage};

export default function App(){
  const[token,setToken]=useState(()=>sessionStorage.getItem("prms_access_token"));
  const{page,navigate}=useHashPage();
  const title=useMemo(()=>ADMIN_MENU.find(item=>item.id===page)?.label||"ภาพรวม",[page]);
  if(!token)return <LoginPage onLogin={setToken}/>;
  const Page=PAGE_COMPONENTS[page]||DashboardPage;
  const logout=()=>{sessionStorage.removeItem("prms_access_token");setToken(null)};
  return <AdminLayout page={page} navigate={navigate} title={title} onLogout={logout}><PageErrorBoundary key={page} onRecover={()=>navigate("dashboard")}><Page token={token} navigate={navigate}/></PageErrorBoundary></AdminLayout>;
}
