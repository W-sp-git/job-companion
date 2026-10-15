import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { api } from "@/api/client";
import type { IntelReportMeta } from "@/api/types";
import IntelArchiveList from "@/components/intel/IntelArchiveList";
import IntelProgress from "@/components/intel/IntelProgress";
import IntelReportCard from "@/components/intel/IntelReportCard";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { useT } from "@/i18n";
import { useIntelStore } from "@/stores/intelStore";

export default function IntelPage() {
  const { rid } = useParams();
  const store = useIntelStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useT();

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState("");
  const [archive, setArchive] = useState<IntelReportMeta[]>([]);

  const refreshArchive = useCallback(() => {
    api.get<IntelReportMeta[]>("/api/intel/reports").then(setArchive).catch(() => {});
  }, []);

  useEffect(() => {
    refreshArchive();
  }, [refreshArchive]);

  useEffect(() => {
    if (rid) {
      const num = Number(rid);
      if (Number.isFinite(num)) store.loadArchived(num).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  // 生成完成：刷新存档并跳转到深链（刷新后可恢复）
  useEffect(() => {
    if (store.phase === "done" && store.reportId && location.pathname === "/intel") {
      refreshArchive();
      navigate(`/intel/${store.reportId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.phase, store.reportId]);

  async function start() {
    if (!company.trim()) {
      setFormError(t("intel.desk.need_company"));
      return;
    }
    setStarting(true);
    setFormError("");
    try {
      await store.start(company.trim(), role.trim());
      refreshArchive();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setStarting(false);
    }
  }

  const running = store.phase === "running";
  const payload = store.payload;
  const hit = company.trim() ? archive.find((a) => a.company === company.trim()) : undefined;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 max-w-5xl mx-auto">
      <div className="min-w-0">
        {payload ? (
          <IntelReportCard
            payload={payload}
            onNew={() => {
              store.reset();
              if (location.pathname !== "/intel") navigate("/intel");
            }}
          />
        ) : (
          <Card className="p-6 space-y-6 animate-ink-up">
            <div>
              <div className="eyebrow mb-2">{t("intel.desk.eyebrow")}</div>
              <h2 className="font-display text-2xl font-black tracking-wide">{t("intel.desk.title")}</h2>
              <p className="font-kai text-xs text-ink-soft mt-2 leading-5">{t("intel.desk.desc")}</p>
            </div>

            <Field label={`${t("intel.desk.company")} *`}>
              <input
                className={`${inputCls} text-[15px]`}
                placeholder={t("intel.desk.company.placeholder")}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={running}
              />
            </Field>

            <Field label={t("intel.desk.role")}>
              <input
                className={`${inputCls} text-[15px]`}
                placeholder={t("intel.desk.role.placeholder")}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={running}
              />
            </Field>

            {!running && hit && (
              <p className="font-kai text-xs leading-5 text-ink-soft border border-dotted border-rule-strong rounded-[2px] px-3 py-2">
                {t("intel.desk.archived", {
                  company: hit.company,
                  date: hit.created_at.slice(5, 10),
                })}
                <Link className="text-seal hover:underline" to={`/intel/${hit.id}`}>
                  {t("intel.desk.review")}
                </Link>
                {t("intel.desk.archivedTail")}
              </p>
            )}

            {(formError || store.error) && (
              <p className="font-kai text-sm text-seal">✗ {formError || store.error}</p>
            )}

            {store.phase === "interrupted" && (
              <div className="border border-dashed border-rule-strong rounded-[2px] px-3 py-2.5 space-y-2">
                <p className="font-kai text-xs text-ink-soft">
                  {t("intel.desk.interrupted", { id: store.reportId ?? 0 })}
                </p>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => store.resume()}>
                  {t("intel.desk.resume")}
                </Button>
              </div>
            )}

            {running ? (
              <IntelProgress lanes={store.lanes} laneCounts={store.laneCounts} extras={store.extras} />
            ) : (
              <Button
                className="w-full py-3 text-base tracking-[0.3em]"
                onClick={start}
                disabled={starting}
              >
                {starting ? t("intel.desk.starting") : t("intel.desk.start")}
              </Button>
            )}
          </Card>
        )}
      </div>

      <IntelArchiveList items={archive} activeId={store.reportId} />
    </div>
  );
}
