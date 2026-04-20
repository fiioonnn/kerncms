# Phase 3+4: AI Analyze Modal & Generate — Design Spec

## Overview

Full wizard modal: Branch Select → Analyze → Review → Generate. Triggered from the topbar. Scans repo via GitHub API, extracts hardcoded strings with AI, lets user review/edit, then generates JSON files and replaces template strings.

## Trigger

"AI Analyze" button in topbar, only visible when:
- AI provider is configured (has_key_1 from /api/settings/ai)
- Project has a repo connected

Style: subtle ghost button with sparkles icon + "BETA" badge in amber.

## Modal Structure

600px wide dialog with step indicator at top:
- Step 0: Branch Select
- Step 1: Analyze
- Step 2: Review  
- Step 3: Generate

Selected branch shown as badge in header after selection.

## Step 0: Branch Select

- Load branches from existing `/api/github/repos/{owner}/{repo}/branches`
- Searchable list, current project branch pre-selected
- "Create new branch" option with auto-generated name: `kern/ai-extract-{YYYY-MM-DD}`
- Create branch via POST to `/api/ai/branches`
- Info text recommending new branch

## Step 1: Analyze

### Process
1. Fetch file tree from GitHub API (recursive)
2. Filter to relevant files (.astro, .vue, .svelte, .tsx, .jsx, .html, .ts, .js)
3. Ignore: node_modules, .git, dist, .next, build, src/kern, *.test.*, *.spec.*, *.config.*
4. For each file: fetch content, send to AI with ANALYZE_SYSTEM_PROMPT
5. Collect extracted strings, deduplicate, detect globals

### UI
- Progress bar with percentage
- Live list: checkmark for done files, spinner for current
- Counter: "Found X strings"
- Summary stats when complete: strings / files / pages

### API
POST `/api/projects/{id}/ai/analyze` — starts job, returns jobId
GET `/api/projects/{id}/ai/analyze/{jobId}` — returns progress + results

Jobs stored in memory (Map) — not DB. They're ephemeral.

## Step 2: Review

- Strings grouped by page/section, globals section at top
- Each string: checkbox, editable key, text preview, file/line reference
- Globals marked with icon + "Found in X files"
- Filter dropdown (All / Globals / by page)
- Search input
- Select all / deselect all
- Collapsible sections

All client-side state — no API calls in this step.

## Step 3: Generate

### Process
1. Create JSON content files (globals first, then sections)
2. Update types.json
3. For each source file with replacements: send to AI with GENERATE_SYSTEM_PROMPT
4. Commit all changes to selected branch

### UI
- Live progress log with checkmarks/spinners
- Stats at completion: files created, strings replaced, files modified
- Commit SHA shown
- "Done" button to close

### API
POST `/api/projects/{id}/ai/generate` — starts generation job
GET `/api/projects/{id}/ai/generate/{jobId}` — returns progress

## File Structure

```
src/components/ai/AIAnalyzeButton.tsx     — topbar trigger button
src/components/ai/AIAnalyzeModal.tsx      — modal shell + step management
src/components/ai/BranchStep.tsx          — step 0
src/components/ai/AnalyzeStep.tsx         — step 1
src/components/ai/ReviewStep.tsx          — step 2
src/components/ai/GenerateStep.tsx        — step 3

src/app/api/projects/[id]/ai/analyze/route.ts        — POST start + GET status
src/app/api/projects/[id]/ai/generate/route.ts       — POST start + GET status
src/app/api/ai/branches/route.ts                      — POST create branch
```

## Job Storage

In-memory Map per process. Jobs expire after 1 hour.

```typescript
type AnalyzeJob = {
  id: string;
  status: "running" | "complete" | "error";
  progress: number;
  currentFile: string;
  totalFiles: number;
  processedFiles: number;
  foundStrings: ExtractedString[];
  error?: string;
};
```

## Scope

- Preview mode toggle (don't commit) included
- Globals detection included
- Framework-specific replacement (astro/vue/svelte/tsx) included
