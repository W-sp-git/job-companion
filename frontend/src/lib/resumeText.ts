import type { ResumeDraft } from "@/api/types";
import { translate } from "@/i18n";

export function draftToText(d: ResumeDraft): string {
  const lines: string[] = [];
  if (d.name) lines.push(d.name);
  const contact = [d.phone, d.email].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  if (d.target_role) lines.push(translate("resume.proof.intent", { role: d.target_role }));
  if (d.summary) lines.push("", translate("resume.text.summary"), d.summary);
  if (d.skills?.length) {
    lines.push("", translate("resume.text.skills"), ...d.skills.map((s) => `· ${s}`));
  }
  if (d.education?.length) {
    lines.push("", translate("resume.text.education"));
    for (const e of d.education) {
      const date = [e.start, e.end].filter(Boolean).join(" - ");
      const info = [e.school, e.major, e.degree].filter(Boolean).join(" | ");
      lines.push([date, info].filter(Boolean).join("  "));
      for (const h of e.highlights || []) lines.push(`· ${h}`);
    }
  }
  if (d.internships?.length) {
    lines.push("", translate("resume.text.internships"));
    for (const it of d.internships) {
      lines.push([it.org, it.role].filter(Boolean).join(" | "));
      for (const b of it.bullets || []) lines.push(`· ${b}`);
    }
  }
  if (d.projects?.length) {
    lines.push("", translate("resume.text.projects"));
    for (const p of d.projects) {
      lines.push([p.name, p.role].filter(Boolean).join(" | "));
      for (const b of p.bullets || []) lines.push(`· ${b}`);
    }
  }
  if (d.awards?.length) {
    lines.push("", translate("resume.text.awards"), ...d.awards.map((a) => `· ${a}`));
  }
  if (d.target_gaps?.length) {
    lines.push("", translate("resume.text.gaps"), ...d.target_gaps.map((g) => `· ${g}`));
  }
  return lines.join("\n");
}
