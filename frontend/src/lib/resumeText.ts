import type { ResumeDraft } from "@/api/types";

export function draftToText(d: ResumeDraft): string {
  const lines: string[] = [];
  if (d.name) lines.push(d.name);
  const contact = [d.phone, d.email].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  if (d.target_role) lines.push(`求职意向：${d.target_role}`);
  if (d.summary) lines.push("", "【个人总结】", d.summary);
  if (d.skills?.length) lines.push("", "【专业技能】", ...d.skills.map((s) => `· ${s}`));
  if (d.education?.length) {
    lines.push("", "【教育背景】");
    for (const e of d.education) {
      const date = [e.start, e.end].filter(Boolean).join(" - ");
      const info = [e.school, e.major, e.degree].filter(Boolean).join(" | ");
      lines.push([date, info].filter(Boolean).join("  "));
      for (const h of e.highlights || []) lines.push(`· ${h}`);
    }
  }
  if (d.internships?.length) {
    lines.push("", "【实习经历】");
    for (const it of d.internships) {
      lines.push([it.org, it.role].filter(Boolean).join(" | "));
      for (const b of it.bullets || []) lines.push(`· ${b}`);
    }
  }
  if (d.projects?.length) {
    lines.push("", "【项目经历】");
    for (const p of d.projects) {
      lines.push([p.name, p.role].filter(Boolean).join(" | "));
      for (const b of p.bullets || []) lines.push(`· ${b}`);
    }
  }
  if (d.awards?.length) lines.push("", "【获奖情况】", ...d.awards.map((a) => `· ${a}`));
  if (d.target_gaps?.length) {
    lines.push("", "【待补齐（JD 要求但暂未具备）】", ...d.target_gaps.map((g) => `· ${g}`));
  }
  return lines.join("\n");
}
