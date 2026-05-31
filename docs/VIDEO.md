# Plainsight — Demo Video Storyboard

**Target length:** ~3 minutes
**Format:** Screen recording with voiceover
**Recording status:** TBD (Phase D, after final integration)

This is the beat-by-beat storyboard. The recording should follow this structure closely; the FMonth redirection beat (section 5) is the single most important moment and should receive deliberate screen time.

---

## Beat 1 — Cold Open: The Problem (0:00–0:25)

**Screen:** The raw Excel file. Rows scrolling, 935,853 of them visible in the sheet count. Column headers: FY, FMonth, Agency, Object, Subobj, Vendor, Amount. No visible pattern at a glance.

**Voiceover:**
> "This is Washington State's vendor spending data. 935,853 rows. $63.2 billion. Two fiscal years. Every agency, every category, every vendor the state paid.
>
> If you're a journalist, a councilmember, or a citizen, you cannot get one answer from this file without SQL. You can't ask it anything. You can only stare at it."

**Cut to:** A blank question field. Clean. Quiet. Warm paper background.

---

## Beat 2 — The Two-Click Value Moment (0:25–1:00)

**Screen:** The Plainsight interface, empty ask bar.

**Voiceover:**
> "Here is Plainsight."

Type into the ask bar: **"Which agencies spent the most in FY2023?"**

Watch the animation — the spec compiles (glass box shows a "compile" event tick), the engine runs, the bar chart renders, and a plain-English subtitle appears: "Total net spending by agency, FY2023, top 10."

User clicks "Explain." A two-sentence narration appears: "Department of Social and Health Services led at $X.X billion, accounting for approximately X% of total state payments. Transportation was second..."

**Voiceover:**
> "One typed question. A real answer from the real data. Plain English. No SQL. This is Golden Analytics' thesis: raw data to a shared answer in two clicks."

---

## Beat 3 — The Glass Box and "Show the SQL" (1:00–1:35)

**Screen:** The same result is still on screen. Move to the glass-box AI activity panel (bottom right or slide-out panel).

**Voiceover:**
> "But can you trust it?"

Open the Glass Box panel. Show the three logged events: `compile` (the AI received the question, emitted a QuerySpec — no numbers), `compute` (the engine ran the SQL, produced the rows — no AI), `narrate` (the AI received only the computed rows, produced prose).

Click "Show the SQL" disclosure on the result card. The SQL appears:

```sql
SELECT agency, SUM(amount) AS value
FROM facts
WHERE fy = 2023
GROUP BY agency
ORDER BY value DESC
LIMIT 10
```

**Voiceover:**
> "The AI never touched the numbers. It only compiled the question into a query specification — no values, no computation. The engine ran the SQL. These are the receipts.
>
> Every number this app shows you came from deterministic code, not a language model. The glass box logs every step. You can read it."

---

## Beat 4 — An Honest Refusal (1:35–2:00)

**Screen:** Clear the result. Type a new question into the ask bar: **"Why did transportation spending increase in 2023?"**

The app returns a refusal card (not an error — a deliberate, styled response):
"I can't answer causal questions from this data. What I can show you: the year-over-year spending change for Transportation. Want to see that?"

A chip below: **"Show Transportation YoY change"** — click it, the comparison renders.

**Voiceover:**
> "When the data can't support an answer, Plainsight says so. It won't invent a causal explanation from a payment summary. It redirects to what it can actually show you.
>
> Most tools answer fast and hope you don't notice the gaps. This one refuses, and tells you why."

---

## Beat 5 — The FMonth Redirection Beat (2:00–2:40)

**This is the most important beat. Give it full deliberate screen time.**

**Screen:** Split or side-by-side view. On one side: a monthly trend chart that would have been produced if `FMonth` had been treated naively as calendar months 1–12. On the other side: the correct chart using the derived calendar month `((FMonth-1) % 12) + 1`.

**Voiceover:**
> "Here's the single most important technical decision in this project. It almost wasn't caught.
>
> The dataset has a column called FMonth. It looks like a month number. Values 1 through... 24.
>
> Not 1 through 12. 24. It's a biennium position counter. FY2022 takes positions 1–12; FY2023 takes positions 13–24. When I asked the AI to model the data schema, it assumed FMonth was a standard month-of-year column. So did I, at first."

**Show:** A close-up of the wrong chart. October 2022 and October 2023 are both labeled "October" but one is actually using FMonth 10 (correct) and the other is using FMonth 22 (which decodes to October via the correct formula — but in a naively implemented version, FMonth 22 would have been mapped to month 22, which is invalid, or silently truncated to 12).

**Voiceover:**
> "If this had shipped, every monthly trend view would have been wrong. Not obviously wrong — plausibly wrong. A journalist citing 'October 2023 spending spiked' might be looking at data from a completely different period.
>
> An adversarial check against the real file caught it. The fix is one line: calendar month equals ((FMonth minus 1) mod 12) plus 1. Plus a build-time assertion that throws if a future data export violates this assumption."

**Show:** The correct chart. Both fiscal years render as overlapping series on a 12-month axis. The trend is legible and correct.

**Voiceover:**
> "This is the AI-redirection story. Not the AI being dramatically wrong. The AI making the same reasonable assumption a human would make from a column name — and a human checking it adversarially before it became a bug in production."

---

## Beat 6 — Close (2:40–3:00)

**Screen:** The dashboard at rest. Clean, warm, legible. The glass box visible in the corner. The provenance strip showing "935,853 monthly aggregate rows · not invoice-level · FY2022–2023."

**Voiceover:**
> "Plainsight is not the fastest answer. It's the answer you can defend.
>
> The AI compiles the question. The engine computes the number. The guard checks the prose. The glass box logs everything. And when it can't answer, it says so.
>
> Most tools answer fast and lie quietly. This one shows its work, so a non-technical person can trust the number."

**Screen:** Hold on the signature line as a title card:
> *"Most tools answer fast and lie quietly. This one shows its work."*

Fade out.

---

## Recording Notes

- Record at 1920x1080; use the warm-paper light theme (not dark mode)
- Show the actual glass-box log streaming in real time during Beat 3 — this is more convincing than a static screenshot
- For Beat 5, rehearse the FMonth explanation once before recording; it needs to land clearly for a non-technical viewer
- The honest refusal in Beat 4 should feel like a feature reveal, not an apology — pause after "it refuses, and tells you why"
- Total runtime target: 2:50–3:05; do not rush Beat 5 to hit 3:00
- Captions recommended for accessibility
