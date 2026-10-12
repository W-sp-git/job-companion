import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";

import HomePage from "@/pages/HomePage";
import IntelPage from "@/pages/IntelPage";
import InterviewPage from "@/pages/InterviewPage";
import ProfilePage from "@/pages/ProfilePage";
import ResumePage from "@/pages/ResumePage";

const navItems = [
  { to: "/", no: "01", label: "首页" },
  { to: "/interview", no: "02", label: "模拟面试" },
  { to: "/resume", no: "03", label: "简历优化" },
  { to: "/profile", no: "04", label: "我的档案" },
  { to: "/intel", no: "05", label: "情报处" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        {/* ============ 刊头 ============ */}
        <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur-[3px]">
          <div className="mx-auto max-w-6xl px-6 pt-3 pb-2 flex items-end justify-between gap-4">
            <Link to="/" className="flex items-center gap-3 group shrink-0">
              <span className="seal-square h-9 w-9 text-[19px] transition-transform duration-200 group-hover:-rotate-3">
                搭
              </span>
              <span className="leading-tight">
                <span className="block font-display text-[17px] font-black tracking-[0.14em]">求职搭子</span>
                <span className="block font-mono text-[9px] tracking-[0.28em] text-ink-faint mt-0.5">
                  JOB COMPANION · EST.2026
                </span>
              </span>
            </Link>
            <nav className="flex items-stretch gap-0.5 text-sm overflow-x-auto">
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  className={({ isActive }) =>
                    `flex items-baseline gap-1.5 px-3 py-1.5 border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? "border-seal text-seal font-semibold"
                        : "border-transparent text-ink-soft hover:text-ink hover:border-rule-strong"
                    }`
                  }
                >
                  <span className="font-mono text-[9px] opacity-75 tracking-wider">{n.no}</span>
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="mx-auto max-w-6xl px-6">
            <div className="rule-double" />
          </div>
        </header>

        {/* ============ 版面 ============ */}
        <main className="relative mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <span className="regmark hidden md:block left-0.5 top-1" aria-hidden="true" />
          <span className="regmark hidden md:block right-0.5 top-1" aria-hidden="true" />
          <span className="regmark hidden md:block left-0.5 bottom-1" aria-hidden="true" />
          <span className="regmark hidden md:block right-0.5 bottom-1" aria-hidden="true" />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/interview" element={<InterviewPage />} />
            <Route path="/interview/:sid" element={<InterviewPage />} />
            <Route path="/resume" element={<ResumePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/intel" element={<IntelPage />} />
            <Route path="/intel/:rid" element={<IntelPage />} />
          </Routes>
        </main>

        {/* ============ 版权页 ============ */}
        <footer className="mx-auto w-full max-w-6xl px-6 pb-8">
          <div className="border-t-2 border-ink pt-[5px]">
            <div className="border-t border-rule-strong" />
            <div className="flex items-center justify-between gap-4 pt-2.5 font-mono text-[10px] tracking-[0.18em] text-ink-faint">
              <span>求职搭子 · 大学生校招作战档案</span>
              <span className="hidden sm:inline">LOCAL-FIRST · 数据只留在你的电脑</span>
            </div>
          </div>
        </footer>
      </div>

      {/* 全局纸纹噪点 */}
      <div className="grain" aria-hidden="true" />
    </BrowserRouter>
  );
}
