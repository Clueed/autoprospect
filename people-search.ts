import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    company: { type: "string", short: "c" },
    keyword: { type: "string", short: "k", multiple: true },
    default: { type: "boolean" },
  },
  strict: true,
});

if (!values.company) {
  console.error("Usage: bun people-search.ts -c <company> -k <keyword> [-k <keyword> ...]");
  console.error("       bun people-search.ts -c <company> --default");
  console.error("");
  console.error("       Multiple -k flags are AND (all must match).");
  console.error("       --default runs one search per role group (terms within a group are OR).");
  process.exit(1);
}

if (!values.default && !values.keyword?.length) {
  console.error("Provide at least one -k <keyword>, or use --default.");
  process.exit(1);
}

// One entry per role group. Terms within a group are OR (single clause, multiple terms).
const DEFAULT_SEARCHES: { group: string; terms: string[] }[] = [
  {
    group: "Placeholder group",
    terms: ["TODO: Add search terms"],
  },
];

const FIELDS = {
  summary: true, headline: true,
  pastJobTitles: true, pastJobSummaries: true, pastCompanyNames: true,
  currentJobTitles: true, currentJobSummaries: true, currentCompanyNames: true,
  interests: true, skills: true, industry: true, education: true,
  publications: true, certifications: true, articles: true, courses: true,
  projects: true, patents: true, volunteering: true, languages: true,
};

function formatDate(iso: string | null) {
  if (!iso) return "present";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatPeople(people: any[], header: string): string {
  const lines: string[] = [`${header}`, `Results: ${people.length}`, ""];

  for (const [i, p] of people.entries()) {
    lines.push(`[${i + 1}] ${p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ")}`);
    if (p.url) lines.push(`    ${p.url}`);
    if (p.headline) lines.push(`    ${p.headline}`);

    const cur = p.current_job;
    if (cur) {
      lines.push(`    Current: ${cur.title} @ ${cur.company_name} (${formatDate(cur.start_date)}–present)`);
      if (cur.locality) lines.push(`    Location: ${cur.locality}`);
    }

    if (p.tags?.length) lines.push(`    Tags: ${p.tags.join(", ")}`);
    if (p.summary) lines.push(`    About: ${p.summary.replace(/\n+/g, " ").trim()}`);

    const exps = (p.detailed_work_experiences ?? p.experiences ?? []).filter((e: any) => !e.is_current);
    if (exps.length) {
      lines.push("    Past experience:");
      for (const e of exps) {
        lines.push(`      - ${e.title} @ ${e.company_name} (${formatDate(e.start_date)}–${formatDate(e.end_date)})`);
        if (e.summary) lines.push(`        ${e.summary.replace(/\n+/g, " ").trim().slice(0, 120)}`);
      }
    }

    if (p.education?.length) {
      lines.push("    Education:");
      for (const e of p.education) {
        const deg = [e.degree, e.field_of_study_name].filter(Boolean).join(", ");
        lines.push(`      - ${e.school_name}${deg ? ` (${deg})` : ""}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function search(company: string, clauses: { terms: string[] }[]): Promise<any[]> {
  const res = await fetch("https://api.fiber.ai/v1/people-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: process.env.FIBER_API_KEY,
      pageSize: 10,
      currentCompanies: [{ name: company }],
      searchParams: {
        keywordsV2: { clauses, options: { fieldsToSearchOver: FIELDS } },
        getDetailedWorkExperience: true,
      },
    }),
  });
  const data = await res.json();
  return data.output?.data ?? [];
}

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

if (values.default) {
  // Run one search per role group (OR within group), deduplicate across groups.
  const seen = new Set<string>();
  for (const { group, terms } of DEFAULT_SEARCHES) {
    const people = await search(values.company!, [{ terms }]);
    const fresh = people.filter((p) => {
      const key = p.url ?? p.linkedin_url ?? p.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const header = `Search: company="${values.company}" group="${group}" (OR: ${terms.map((t) => `"${t}"`).join(", ")})`;
    console.log(formatPeople(fresh, header));
  }
} else {
  // Regular mode: each -k is a separate AND clause.
  const keywords = values.keyword!;
  const people = await search(values.company!, (keywords as string[]).map((k) => ({ terms: [k] })));

  const keywordLabel = keywords.length === 1
    ? `keyword="${keywords[0]}"`
    : `keywords (AND): ${keywords.map((k) => `"${k}"`).join(" AND ")}`;

  const jsonFile = `company-${slug(values.company!)}-keyword-${keywords.map(slug).join("+")}.json`;
  await Bun.write(jsonFile, JSON.stringify(people, null, 2));
  console.log(formatPeople(people, `Search: company="${values.company}" ${keywordLabel}`));
  console.log(`JSON saved to ${jsonFile}`);
}
