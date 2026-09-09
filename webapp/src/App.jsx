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

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const PageComp = PAGES[page];

  return (
    <div className="bg-workspace min-h-screen text-ink">
      <Sidebar page={page} setPage={setPage} />

      {/* 主区 */}
      <main className="ml-[288px] mr-8 pb-16 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <PageComp health={health} />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
