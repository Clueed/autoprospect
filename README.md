# autoprospect

A B2B sales prospecting agent that receives a target company and returns 3–10 named prospects.

## The Problem

Outbound sales prospecting in enterprise B2B is time-consuming. Most tools only search by name/title, but the signals that predict a good prospect (specific skills, certifications, relevant experience) are buried in job descriptions and profile details.

## How it Works

Maps a target company's internal processes against stakeholder groups to find relevant prospects for our sales motion.

This approach is specific to our context: we start with hypotheses about *which process inside a target company* matters for our product, map those to stakeholder groups, then use keyword and skill-based searches to find the right people. This is why the structure centers on stakeholder groups and process mapping.

The [Fiber API](https://fiber.ai/) enables programmatic access to LinkedIn profile data including skills, certifications, and job descriptions — not just names.

### Stakeholder Groups

- Group 1–4: Various roles across the target organization (specific titles anonymized)

### Search Strategy

1. **Always start with the default scan** (`use_default=true`) — runs searches across all role groups in English and German
2. **Phase 1:** Direct matches from default scan (high-confidence)
3. **Phase 2:** Hypothesis-driven keyword searches for empty groups

### Output

3–10 prospects with:
- Name and current title
- Why relevant (1–2 sentences)
- LinkedIn URL

Ends with notes on which groups were thin/absent and any notable IT org observations.

## Tools

- **Profile Lookup** — Live-fetch a single LinkedIn profile by URL or slug
- **People Search** — Search people at a company with `company` + optional `keywords` or `use_default=true`

## Status

> **Note:** This is the result of an internal workshop. Anonymized and generalized. Very much an MVP — this works at all.

Early results are promising. Production implementation will save several hours per person per day.