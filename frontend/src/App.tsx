import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";

import HomePage from "@/pages/HomePage";
import InterviewPage from "@/pages/InterviewPage";
import ProfilePage from "@/pages/ProfilePage";
import ResumePage from "@/pages/ResumePage";

const navItems = [
  { to: "/", label: "首页" },
  { to: "/interview", label: "模拟面试" },
  { to: "/resume", label: "简历优化" },
  { to: "/profile", label: "我的档案" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">求职搭子</span>
              <span className="text-[10px] text-neutral-500 mt-0.5">AI Job Companion</span>
            </div>
            <nav className="flex items-center gap-1 text-sm">
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md transition-colors ${
                      isActive ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-neutral-100"
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/interview" element={<InterviewPage />} />
            <Route path="/interview/:sid" element={<InterviewPage />} />
            <Route path="/resume" element={<ResumePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
