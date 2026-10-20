import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";

import type { MessageKey } from "@/i18n/messages";
import { useLocaleStore, useT } from "@/i18n";
import { LoadingRows } from "@/components/workspace";
const HomePage = lazy(() => import("@/pages/HomePage"));
const JobsPage = lazy(() => import("@/pages/JobsPage"));
const ExperiencePage = lazy(() => import("@/pages/ExperiencePage"));
const PracticePage = lazy(() => import("@/pages/PracticePage"));
const IntelPage = lazy(() => import("@/pages/IntelPage"));
const InterviewPage = lazy(() => import("@/pages/InterviewPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const ResumePage = lazy(() => import("@/pages/ResumePage"));
const ResumePrintPage = lazy(() => import("@/pages/ResumePrintPage"));

const navItems: { to: string; no: string; key: MessageKey }[] = [
  { to: "/", no: "01", key: "nav.home" },
  { to: "/jobs", no: "02", key: "nav.jobs" },
  { to: "/experiences", no: "03", key: "nav.experiences" },
  { to: "/resume", no: "04", key: "nav.resume" },
  { to: "/interview", no: "05", key: "nav.interview" },
  { to: "/practice", no: "06", key: "nav.practice" },
  { to: "/intel", no: "07", key: "nav.intel" },
  { to: "/profile", no: "08", key: "nav.profile" },
];

function LocaleSwitch() {
  const { locale, setLocale } = useLocaleStore();
  return (
    <div className="flex items-center gap-0.5 shrink-0 self-center border-l border-rule-strong pl-2 ml-1">
      {(["zh", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-label={`switch language to ${l}`}
          className={`px-1.5 py-1 font-mono text-[10px] tracking-wider rounded-[2px] transition-colors ${
            locale === l
              ? "text-seal font-bold"
              : "text-ink-faint hover:text-ink"
          }`}
        >
          {l === "zh" ? "中" : "EN"}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const { t } = useT();
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
                <span className="block font-display text-[17px] font-black tracking-[0.14em]">
                  求职搭子
                </span>
                <span className="block font-mono text-[9px] tracking-[0.28em] text-ink-faint mt-0.5">
                  {t("app.slogan")}
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-1 min-w-0">
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
                    <span className="font-mono text-[9px] opacity-75 tracking-wider">
                      {n.no}
                    </span>
                    <span>{t(n.key)}</span>
                  </NavLink>
                ))}
              </nav>
              <LocaleSwitch />
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-6">
            <div className="rule-double" />
          </div>
        </header>

        {/* ============ 版面 ============ */}
        <main className="relative mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <span
            className="regmark hidden md:block left-0.5 top-1"
            aria-hidden="true"
          />
          <span
            className="regmark hidden md:block right-0.5 top-1"
            aria-hidden="true"
          />
          <span
            className="regmark hidden md:block left-0.5 bottom-1"
            aria-hidden="true"
          />
          <span
            className="regmark hidden md:block right-0.5 bottom-1"
            aria-hidden="true"
          />
          <Suspense fallback={<LoadingRows />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/interview/:sid" element={<InterviewPage />} />
              <Route path="/resume" element={<ResumePage />} />
              <Route path="/resume/print/:vid" element={<ResumePrintPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:jid" element={<JobsPage />} />
              <Route path="/experiences" element={<ExperiencePage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/intel" element={<IntelPage />} />
              <Route path="/intel/:rid" element={<IntelPage />} />
            </Routes>
          </Suspense>
        </main>

        {/* ============ 版权页 ============ */}
        <footer className="mx-auto w-full max-w-6xl px-6 pb-8">
          <div className="border-t-2 border-ink pt-[5px]">
            <div className="border-t border-rule-strong" />
            <div className="flex items-center justify-between gap-4 pt-2.5 font-mono text-[10px] tracking-[0.18em] text-ink-faint">
              <span>{t("footer.left")}</span>
              <span className="hidden sm:inline">{t("footer.right")}</span>
            </div>
          </div>
        </footer>
      </div>

      {/* 全局纸纹噪点 */}
      <div className="grain" aria-hidden="true" />
    </BrowserRouter>
  );
}
