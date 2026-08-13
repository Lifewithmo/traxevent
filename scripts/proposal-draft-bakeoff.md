# Proposal Draft Model Bake-Off Runbook

## Overview

This runbook documents a blind comparison between **Claude Opus 5** (current default) and **Claude Sonnet 5** for proposal AI drafting. The goal is to evaluate voice-match, structure, and package sensibility across three realistic note sets.

## Setup

### Prerequisites
- SSH access to the TraxEvent development environment  
- Admin credentials for a test org  
- Three proposals ready for drafting (or create new ones as needed)  
- A scratch git branch (do not commit model changes to `main` or the proposal-builder-redesign branch)

### Test Organization & Proposals
Use an existing test org or create a new one with demo data. Create three proposals spanning different event/service complexity levels.

---

## Test Note Sets

### Note Set 1: Wedding Event — Ceremony + Reception (High Complexity)
*Context: Client is planning a wedding with both ceremony coordination and reception services.*

```
Ceremony coordination, full-day venue management. 
Bride + groom + 120 guests. Catholic ceremony at church, 2pm sharp. 
Reception at lakeside pavilion 4pm-midnight.
Looking for: full coordination (site visits, vendor calls, day-of setup, timeline mgmt), 
MC/bar services included, uplighting/sound tech, a la carte catering upgrades, 
photo booth rental, late-night snacks. Budget is flexible but want package pricing 
with itemized upsells. They want to feel "luxury but not stuffy."
Previous notes: "Clients are organized but want us to own all logistics."
```

### Note Set 2: Corporate Retreat — Multi-Day (Medium Complexity)
*Context: Client is planning a 2-day corporate team-building retreat.*

```
3-day off-site for 50-person tech team. 
Dates: Sept 15-17. Location: Mountain lodge upstate.
Need: full event planning (logistics, catering, breakout spaces, AV setup), 
team-building activities (3-4 workshops), evening entertainment (one live band night, 
one casual dinner), ground transport from city, pre-event comms to attendees.
Budget ~$25k total. Want it "professional but fun."
They've done one off-site before and know what they DON'T want: death by PowerPoint, 
generic team-building, cheap catering.
Execs are detail-oriented; delegate to us for execution.
```

### Note Set 3: Small Birthday Party — Simple Service (Low Complexity)
*Context: Client wants a birthday celebration for an adult turning 40.*

```
40th birthday dinner. 20-25 people. Saturday night at client's house.
Want us to: coordinate with caterer, set up decorations, manage music/playlist, 
coordinate with photographer (client has own photographer lined up), 
handle cleanup after.
Budget: $1500-2000. Vibe: "elegant casual, surprise element if possible."
Client: "I just want to enjoy my party, you handle the rest."
Existing notes: "Very flexible. Trusts our judgment."
```

---

## Generation Instructions

### Phase 1: Capture Baseline (Opus 5 – Current Default)

1. **In a terminal**, confirm you're on the proposal-builder-redesign branch and the default AI model is set:
   ```bash
   cd /Users/rm/vw/traxevent/.claude/worktrees/proposal-builder-redesign
   git branch  # Should show proposal-builder-redesign
   grep "AI_MODEL\|AI_EFFORT\|AI_FALLBACKS\|AI_BETAS" lib/ai/client.ts
   ```
   Expected output:
   ```
   export const AI_MODEL = 'claude-opus-5'
   export const AI_EFFORT = 'medium' as const
   export const AI_FALLBACKS: 'default' | null = 'default'
   export const AI_BETAS: string[] = ['server-side-fallback-2026-07-01']
   ```

2. **For each of the three notes** (Wedding, Corporate Retreat, Birthday):
   - Navigate to the relevant proposal in the admin UI  
   - Paste the note set into the "Operator notes" field  
   - Click "Draft from AI" (or equivalent button)  
   - Wait for generation to complete  
   - Copy the entire draft output (all blocks) into a markdown file: `bakeoff-opus-note-{1,2,3}.md`

3. **Strip model identifiers** from the files (remove any model name mentions in the content).

### Phase 2: Temporarily Switch to Sonnet 5

1. **On a scratch branch**, edit `lib/ai/client.ts`:
   ```bash
   git checkout -b bakeoff-sonnet-test
   ```

2. **Replace these four lines** in `lib/ai/client.ts`:
   ```typescript
   export const AI_MODEL = 'claude-sonnet-5'
   export const AI_EFFORT = 'high' as const
   export const AI_FALLBACKS: 'default' | null = null
   export const AI_BETAS: string[] = []
   ```

3. **Restart the dev server** (Sonnet changes take effect immediately after reload).

4. **For each of the three notes**, repeat the generation and capture process:
   - Paste the same notes into the proposal  
   - Click "Draft from AI"  
   - Copy output to: `bakeoff-sonnet-note-{1,2,3}.md`  
   - Strip model identifiers

5. **Restore the constants** and **delete the scratch branch** (do not commit):
   ```bash
   git checkout proposal-builder-redesign
   git branch -D bakeoff-sonnet-test
   ```

---

## Blind Judging

### Preparation
Rename the output files to remove model associations:
```
bakeoff-opus-note-1.md   → bakeoff-sample-1-a.md
bakeoff-sonnet-note-1.md → bakeoff-sample-1-b.md
(and so on for notes 2 and 3)
```

### Evaluation Framework

For each note set, compare the **A** and **B** drafts on these dimensions:

#### 1. Voice Match
- Does the draft sound like the org's established voice?  
- Is tone consistent across blocks (e.g., friendly, formal, casual)?  
- Does it echo the existing proposal examples and brand?  
- Score: ⭐ (worse), ✓ (neutral), ✓✓ (better)

#### 2. Structure & Clarity
- Are the line items and packages logically grouped?  
- Are prices and item descriptions clear and scannable?  
- Do section headers and hierarchy make sense?  
- Are there any confusing or redundant sections?  
- Score: ⭐ (worse), ✓ (neutral), ✓✓ (better)

#### 3. Package Sensibility
- Do the suggested packages align with typical market offerings for this event type?  
- Are add-ons positioned naturally (not forced or missing)?  
- Are quantities, pricing tiers, and bundling realistic?  
- Does the breakdown make it easy for the client to understand options?  
- Score: ⭐ (worse), ✓ (neutral), ✓✓ (better)

### Scoring Template

```
NOTE SET 1: WEDDING EVENT (High Complexity)

Sample 1-A (Blind):
  - Voice match:        [⭐ / ✓ / ✓✓]
  - Structure & clarity: [⭐ / ✓ / ✓✓]
  - Package sensibility: [⭐ / ✓ / ✓✓]
  - Notes: [any qualitative observations]

Sample 1-B (Blind):
  - Voice match:        [⭐ / ✓ / ✓✓]
  - Structure & clarity: [⭐ / ✓ / ✓✓]
  - Package sensibility: [⭐ / ✓ / ✓✓]
  - Notes: [any qualitative observations]

VERDICT FOR NOTE SET 1: A wins / B wins / Tied

---

NOTE SET 2: CORPORATE RETREAT (Medium Complexity)

Sample 2-A (Blind):
  - Voice match:        [⭐ / ✓ / ✓✓]
  - Structure & clarity: [⭐ / ✓ / ✓✓]
  - Package sensibility: [⭐ / ✓ / ✓✓]
  - Notes: [any qualitative observations]

Sample 2-B (Blind):
  - Voice match:        [⭐ / ✓ / ✓✓]
  - Structure & clarity: [⭐ / ✓ / ✓✓]
  - Package sensibility: [⭐ / ✓ / ✓✓]
  - Notes: [any qualitative observations]

VERDICT FOR NOTE SET 2: A wins / B wins / Tied

---

NOTE SET 3: BIRTHDAY PARTY (Low Complexity)

Sample 3-A (Blind):
  - Voice match:        [⭐ / ✓ / ✓✓]
  - Structure & clarity: [⭐ / ✓ / ✓✓]
  - Package sensibility: [⭐ / ✓ / ✓✓]
  - Notes: [any qualitative observations]

Sample 3-B (Blind):
  - Voice match:        [⭐ / ✓ / ✓✓]
  - Structure & clarity: [⭐ / ✓ / ✓✓]
  - Package sensibility: [⭐ / ✓ / ✓✓]
  - Notes: [any qualitative observations]

VERDICT FOR NOTE SET 3: A wins / B wins / Tied
```

---

## Overall Verdict

After blind judging all three note sets, tally results below.

**Note:** The streaming UI is model-agnostic and does not depend on which model is selected. Changes are configuration-only and have zero frontend impact.

### Summary

- Opus 5 wins: [count]  
- Sonnet 5 wins: [count]  
- Tied: [count]  
- **Overall recommendation:** [Opus / Sonnet / Inconclusive]  
- **Reasoning:** [Qualitative summary of strengths/weaknesses]

### If Sonnet 5 Wins

If Sonnet 5 outperforms Opus 5 overall, commit the following changes to `lib/ai/client.ts`:

```typescript
// Change these four lines:
export const AI_MODEL = 'claude-sonnet-5'
export const AI_EFFORT = 'high' as const
export const AI_FALLBACKS: 'default' | null = null
export const AI_BETAS: string[] = []

// And update the comment above to document the decision:
// Model configuration. Switched to claude-sonnet-5 (2026-08-XX, bake-off result):
// Sonnet 5 at high effort provides comparable voice match, structure, and package
// sensibility at lower latency. Fallbacks disabled (Sonnet 5 does not support them).
// Thinking stays OMITTED (adaptive by default on Sonnet 5).
```

Then create a commit:
```bash
git add lib/ai/client.ts
git commit -m "feat(ai): switch to claude-sonnet-5 for proposal drafting

Results from 2026-08-XX model bake-off showed Sonnet 5 at high effort
provides comparable quality at reduced latency. See scripts/proposal-draft-bakeoff.md."
```

### If Opus 5 Wins (or Tied)

No changes needed. Leave `lib/ai/client.ts` unchanged. Document the decision in this file with the date.

---

## Cleanup

After completing the bake-off and recording the verdict:

1. Delete all temporary `bakeoff-*.md` files from the working tree.
2. Keep this runbook for future reference.
3. Archive the blind judging scores in a comment at the bottom of this file if you wish (optional).

---

## Notes for Future Runs

- **Re-run cadence:** Repeat annually or after major model updates from Anthropic.  
- **Sample rotation:** Use different event types/complexity levels in future bake-offs to ensure breadth.  
- **Streaming latency:** Measure perceived latency end-to-end during generation; not captured in the notes but relevant to UX.  
- **Cost impact:** Document token usage for both models if cost becomes a factor.
