import { parseArgs } from "node:util";

const { positionals } = parseArgs({ allowPositionals: true, strict: true });
const identifier = positionals[0];

if (!identifier) {
  console.error("Usage: bun profile-lookup.ts <linkedin-url-or-slug>");
  process.exit(1);
}

const res = await fetch("https://api.fiber.ai/v1/linkedin-live-fetch/profile/single", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: process.env.FIBER_API_KEY,
    identifier,
    getDetailedWorkExperience: true,
  }),
});

const data = await res.json();

const slug = identifier
  .replace(/https?:\/\/[a-z.]*linkedin\.com\/in\//i, "")
  .replace(/\/$/, "")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-");

const jsonFile = `profile-${slug}.json`;
await Bun.write(jsonFile, JSON.stringify(data, null, 2));

if (!data.output?.found) {
  console.log(`Profile not found for: ${identifier}`);
  console.log(`JSON saved to ${jsonFile}`);
  process.exit(0);
}

const p = data.output.profile;

function formatDate(iso: string | null) {
  if (!iso) return "present";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const lines: string[] = [];

lines.push(`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
if (p.url) lines.push(p.url);
if (p.headline) lines.push(p.headline);
if (p.location) lines.push(`Location: ${p.location}`);
lines.push("");

const cur = p.current_job ?? (p.experiences ?? []).find((e: any) => e.is_current);
if (cur) lines.push(`Current: ${cur.title} @ ${cur.company_name} (${formatDate(cur.start_date)}–present)`);

if (p.summary) {
  lines.push("");
  lines.push(`About: ${p.summary.replace(/\n+/g, " ").trim()}`);
}

const exps = (p.detailed_work_experiences ?? p.experiences ?? []).filter((e: any) => !e.is_current);
if (exps.length) {
  lines.push("");
  lines.push("Past experience:");
  for (const e of exps) {
    lines.push(`  - ${e.title} @ ${e.company_name} (${formatDate(e.start_date)}–${formatDate(e.end_date)})`);
    if (e.summary) lines.push(`    ${e.summary.replace(/\n+/g, " ").trim().slice(0, 200)}`);
  }
}

if (p.education?.length) {
  lines.push("");
  lines.push("Education:");
  for (const e of p.education) {
    const deg = [e.degree, e.field_of_study_name].filter(Boolean).join(", ");
    lines.push(`  - ${e.school_name}${deg ? ` (${deg})` : ""}`);
  }
}

if (p.skills?.length) {
  lines.push("");
  lines.push(`Skills: ${p.skills.slice(0, 20).join(", ")}`);
}

if (p.certifications?.length) {
  lines.push("");
  lines.push("Certifications:");
  for (const c of p.certifications) lines.push(`  - ${c.title}${c.company_name ? ` (${c.company_name})` : ""}`);
}

console.log(lines.join("\n"));
console.log(`\nJSON saved to ${jsonFile}`);
