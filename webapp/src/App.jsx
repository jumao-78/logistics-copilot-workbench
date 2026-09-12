import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Inbox from "./pages/Inbox.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import AgentFlow from "./pages/AgentFlow.jsx";
import Analytics from "./pages/Analytics.jsx";
import Settings from "./pages/Settings.jsx";
import { api } from "./api.js";

const PAGES = {
  dashboard: Dashboard,
  inbox: Inbox,
  knowledge: Knowledge,
  flow: AgentFlow,
  analytics: Analytics,
  settings: Settings,
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [health, setHealth] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("nav-collapsed") === "1"; } catch (_) { return false; }
  });
  const toggleNav = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("nav-collapsed", c ? "0" : "1"); } catch (_) {}
      return !c;
    });
  };

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const PageComp = PAGES[page];

  return (
    <div className="bg-workspace min-h-screen text-ink">
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} onToggle={toggleNav} />

      {/* 主区 */}
      <main className={`mr-8 pb-16 pt-6 transition-[margin] duration-300 ease-out ${collapsed ? "ml-[112px]" : "ml-[288px]"}`}>
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <PageComp health={health} />
        </motion.div>
      </main>
    </div>
  );
}
