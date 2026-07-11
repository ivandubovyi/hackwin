import type {
  HackathonInput,
  ResearchDossier,
  StrategyBrief,
  StrategyIdea,
} from "@/types/strategy";
import type { ConceptFingerprint } from "@/lib/novelty";
import { scoreConceptNovelty } from "@/lib/novelty";
import {
  pickConceptDomain,
  pickCreativeLens,
  sanitizeProductTitle,
} from "@/lib/variety";

/** Research-only fallback dossier when live scrape is empty (no idea bank). */
export function getDemoResearch(input: HackathonInput): ResearchDossier {
  const name = input.name.trim() || "Demo Hackathon";
  return {
    resolvedName: name,
    theme:
      input.theme.trim() ||
      "Build something judges can feel in under 90 seconds — clear problem, working demo, tight scope.",
    judgingCriteria: [
      "Impact / problem clarity",
      "Technical execution",
      "Design & demo quality",
      "Innovation",
    ],
    sponsors: input.sponsors.trim()
      ? input.sponsors.split(/\n|,/).filter(Boolean).map((line) => {
          const namePart = line.split(/[—–\-:|]/)[0]?.trim() || line.trim();
          return {
            name: namePart,
            prizeTrack: line.trim(),
            prizeDetails: line.trim(),
            techOrApi: "",
          };
        })
      : [],
    pastWinners: input.pastWinners.trim()
      ? input.pastWinners.split(/\n/).filter(Boolean).map((line) => ({
          year: (line.match(/20\d{2}/) || [""])[0],
          project: line.trim(),
          description: line.trim(),
          track: "",
          whyItWon: "",
        }))
      : [],
    notableProjects: [],
    gaps: [
      "No OpenAI key — unique AI idea generation requires OPENAI_API_KEY. Research may still run.",
    ],
    sources: input.url?.trim()
      ? [{ url: input.url.trim(), title: name, kind: "page" as const }]
      : [],
  };
}

/**
 * Fallback when OPENAI_API_KEY is missing.
 * Rotates through distinct concept domains by seed — never title-only renames.
 */
export function getDemoBrief(
  input: HackathonInput,
  research?: ResearchDossier,
  opts?: {
    excludeIdeas?: string[];
    excludeConcepts?: ConceptFingerprint[];
    seed?: number;
  },
): StrategyBrief {
  const dossier = research || getDemoResearch(input);
  const seed = opts?.seed ?? Date.now();
  const excludeTitles = (opts?.excludeIdeas ?? []).map((t) => t.toLowerCase());
  const prior = opts?.excludeConcepts ?? [];
  const bannedText = [
    ...excludeTitles,
    ...prior.flatMap((c) => [c.title, c.oneLiner, c.coreLoop, c.targetUser]),
  ];
  const lens = pickCreativeLens(seed, bannedText);
  const hack =
    dossier.resolvedName || input.name.trim() || "this hackathon";
  const sponsor = dossier.sponsors[0]?.name;

  let idea: StrategyIdea | null = null;
  let guard = 0;
  let trySeed = seed;

  while (guard < 24) {
    const domain = pickConceptDomain(trySeed, bannedText);
    const title = sanitizeProductTitle(inventTitle(trySeed), hack);
    if (excludeTitles.includes(title.toLowerCase())) {
      trySeed += 17;
      guard++;
      continue;
    }
    const candidate = buildConceptFromDomain({
      domain,
      title,
      seed: trySeed,
      lens,
      theme: dossier.theme,
      sponsor,
    });
    const novelty = scoreConceptNovelty(candidate, prior);
    if (novelty.ok || prior.length === 0) {
      idea = candidate;
      break;
    }
    bannedText.push(candidate.oneLiner, candidate.coreLoop, domain);
    trySeed += 41;
    guard++;
  }

  if (!idea) {
    const domain = pickConceptDomain(seed + 999, bannedText);
    idea = buildConceptFromDomain({
      domain,
      title: sanitizeProductTitle(inventTitle(seed + 999), hack),
      seed: seed + 999,
      lens,
      theme: dossier.theme,
      sponsor,
    });
  }

  return {
    hackathonName: hack,
    themeRead:
      dossier.theme ||
      "Strong products nail a crisp problem, a working demo, and tight scope.",
    judgeSignals: [
      "Working end-to-end flow in under 90 seconds",
      "Clear before/after for a real user",
      "Narrow scope executed well",
      "Memorable name + one sentence anyone can repeat",
      "Sponsor touch optional — never the whole idea",
    ],
    sponsorAngles: dossier.sponsors.slice(0, 3).map((s) => ({
      sponsor: s.name,
      angle: `Keep ${s.name} optional — the product should work without it.`,
      prizeHook: s.prizeDetails || s.prizeTrack || "Light prize-track hook only",
    })),
    winnerPatterns: dossier.pastWinners.length
      ? [
          "Strong past builds shipped a focused vertical slice with a live demo",
          "They named a specific user and painful moment",
        ]
      : [
          "Winning patterns show a transformation, not a dashboard",
          "Theme fit and demo clarity beat sponsor name-dropping",
        ],
    crowdedIdeasToAvoid: [
      "Generic AI chatbot wrapper",
      "Habit / productivity tracker clones",
      "Marketplace with no supply story",
      ...prior.slice(0, 3).map((c) => `Prior concept: ${c.title} — ${c.oneLiner}`),
    ],
    recommendedIdea: idea,
    runnerUps: [],
    pitchScript: `In ninety seconds, ${idea.title} makes a real problem feel obvious — then removes it. That's the whole bet.`,
    weekendPlan: [
      { hour: "Hour 0–2", focus: "Lock the demo script; cut everything else" },
      { hour: "Hour 2–8", focus: "Ship the vertical slice" },
      { hour: "Hour 8–16", focus: "Harden happy path + reset" },
      { hour: "Hour 16–24", focus: "Polish only what the demo shows" },
      { hour: "Hour 24–36", focus: "Practice the product story; ship" },
    ],
    research: dossier,
    demo: true,
  };
}

function buildConceptFromDomain(opts: {
  domain: string;
  title: string;
  seed: number;
  lens: string;
  theme: string;
  sponsor?: string;
}): StrategyIdea {
  const { domain, title, seed, lens, theme, sponsor } = opts;
  const d = domain.toLowerCase();

  let body: Omit<StrategyIdea, "rank" | "title" | "tracks" | "scores" | "sponsorPlay" | "themePlay">;

  if (d.includes("speech") || d.includes("rehearsal")) {
    body = speechCoach();
  } else if (d.includes("forgery") || d.includes("authenticity")) {
    body = forgerySpotter();
  } else if (d.includes("triage map") || d.includes("field ops")) {
    body = fieldOpsMap();
  } else if (d.includes("inbox")) {
    body = inboxTriage();
  } else if (d.includes("budget") || d.includes("money")) {
    body = budgetClick();
  } else if (d.includes("matching") || d.includes("peer")) {
    body = peerMatch();
  } else if (d.includes("offline")) {
    body = offlineSync();
  } else if (d.includes("privacy") || d.includes("kill-switch")) {
    body = privacyKillSwitch();
  } else if (d.includes("rubric") || d.includes("grader")) {
    body = rubricGrader();
  } else if (d.includes("consequence") || d.includes("simulator")) {
    body = consequenceSim();
  } else if (d.includes("spatial") || d.includes("map")) {
    body = spatialFinder();
  } else if (d.includes("clip") || d.includes("creator")) {
    body = clipCutter();
  } else if (d.includes("consent")) {
    body = consentVault();
  } else if (d.includes("queue") || d.includes("fairness")) {
    body = queueBoard();
  } else if (d.includes("repair")) {
    body = repairOverlay();
  } else {
    body = inboxTriage();
  }

  return {
    rank: 1,
    title,
    tracks: ["Core product"],
    scores: {
      themeFit: 78 + (seed % 12),
      sponsorFit: sponsor ? 58 + (seed % 8) : 52,
      demoWow: 80 + (seed % 10),
      feasibility: 82 + (seed % 8),
      differentiation: 84 + (seed % 9),
      overall: 80 + (seed % 11),
    },
    sponsorPlay: sponsor
      ? `Optional light touch: ${sponsor} only if it sharpens the demo — not required.`
      : "No hard sponsor dependency.",
    themePlay: theme
      ? `Align the problem with this taste signal: ${theme.slice(0, 160)}`
      : `Creative lens for this run: ${lens}`,
    ...body,
    risks: [
      ...body.risks,
      "Add OPENAI_API_KEY for fully AI-invented unique concepts each run",
    ],
  };
}

function speechCoach() {
  return {
    oneLiner:
      "A live rehearsal coach that watches a webcam feed and flags filler words, pace crashes, and dead eyes before the real talk.",
    mission:
      "Most people only discover they ramble after the meeting ends. This exists to catch weak delivery in the moment so a speaker can fix one habit before it costs them the room.",
    targetUser:
      "A first-time founder rehearsing a 90-second pitch alone in a dorm the night before a demo.",
    coreLoop:
      "Start timed rehearsal → speak to camera → live chips on filler/pace/gaze → stop → scored replay with three fix clips → run again targeting the worst clip.",
    howItWorks: [
      "Browser captures mic + webcam; speech-to-text streams via Web Speech or Whisper.",
      "Rules count fillers, words-per-minute windows, and face-looking-at-camera confidence.",
      "Threshold trips flash an on-screen chip without stopping the talk.",
      "On stop, stitch a 3-clip highlight reel and a clarity/energy/presence scorecard.",
      "Reset reloads the same prompt so before/after is fair.",
    ],
    looksLike:
      "Dark full-bleed camera stage with a thin top timer bar. Left edge stacks acid-lime chips. After stop: split view — replay scrubber on the left, scorecard + three fix cards on the right.",
    screens: [
      "Setup — 60/90s length, mic meter, Start rehearsal",
      "Live stage — camera, timer, live chips",
      "Debrief — scorecard, three flagged clips, Run again",
    ],
    techStack: [
      "Next.js + Web Speech / Whisper for STT",
      "MediaPipe Face Landmarker for gaze proxy",
      "IndexedDB for local rehearsal history",
    ],
    whyItWins:
      "Before/after is visceral: same person, same script, second take with chips gone — a product you feel in under a minute.",
    demoPlan: [
      "0–15s: first take with ums + looking down; chips light up",
      "15–45s: debrief clips and three fixes",
      "45–75s: second take; chips stay quiet",
      "75–90s: scorecard delta + one-line mission",
    ],
    buildScope: [
      "Timed rehearsal with mic+cam",
      "Filler + WPM live chips",
      "Gaze proxy chip",
      "Debrief with three clips + reset",
    ],
    risks: ["Vision false positives on glasses", "STT latency on chips"],
  };
}

function forgerySpotter() {
  return {
    oneLiner:
      "Upload a PDF or photo ID and get a side-by-side authenticity report that highlights pixel, font, and metadata tells.",
    mission:
      "Fake docs slip through when people glance. This exists to make forgery tells visible in seconds for anyone who has to trust a file once.",
    targetUser:
      "A volunteer housing coordinator verifying a lease PDF sent over email before handing over keys.",
    coreLoop:
      "Drop file → extract text/layout/EXIF → run tell detectors → show heatmapped original vs annotated clone → export a one-page trust receipt.",
    howItWorks: [
      "Accept PDF/PNG/JPEG; rasterize first page and pull text + fonts when possible.",
      "Check EXIF/software stamps, font mix anomalies, and copy-move blocks in the image.",
      "Score each tell and paint bounding boxes on a duplicate canvas.",
      "Produce a pass/warn/fail banner with the top three evidence chips.",
      "Export a printable trust receipt with hashes of the uploaded bytes.",
    ],
    looksLike:
      "Split workspace: original page left, annotated clone right with red boxes. Top banner is green/amber/red. Bottom drawer lists evidence chips you can click to zoom.",
    screens: [
      "Dropzone — drag lease/ID, sample fixtures for demo",
      "Compare — side-by-side heatmaps + evidence list",
      "Receipt — exportable trust summary with file hash",
    ],
    techStack: [
      "Next.js upload API + pdf.js rasterize",
      "Sharp / canvas for copy-move heuristics",
      "Local file hash (SHA-256) in browser",
    ],
    whyItWins:
      "The demo is a single forged vs real pair — boxes appear and the room understands the product without a dashboard tour.",
    demoPlan: [
      "0–20s: drop a forged lease; boxes bloom",
      "20–50s: click each evidence chip",
      "50–75s: drop a clean file; green pass",
      "75–90s: show trust receipt",
    ],
    buildScope: [
      "Upload + first-page render",
      "Three tell detectors with boxes",
      "Pass/warn/fail banner",
      "Trust receipt export",
    ],
    risks: ["False positives on scans", "Large PDF memory"],
  };
}

function fieldOpsMap() {
  return {
    oneLiner:
      "A live triage map where an incident lead drops pins, assigns severity, and routes the nearest free responder in one gesture.",
    mission:
      "Radio chaos loses minutes. This exists so a lead can see open incidents, who is free, and the next best dispatch without a spreadsheet.",
    targetUser:
      "A campus safety lead coordinating three bikes and two medics during a festival rush.",
    coreLoop:
      "Pin incident → set severity → see free responders → assign → pin turns claimed → clear when done → board updates.",
    howItWorks: [
      "Map shows open pins colored by severity; sidebar lists free responders with ETA stubs.",
      "Tap a pin then a responder to assign; both update via local state or websocket.",
      "Claimed pins pulse until marked clear.",
      "Demo seed data resets to the same three-incident chaos for a fair before/after.",
    ],
    looksLike:
      "Full-bleed dark map, neon severity dots, right drawer of responder cards with Assign buttons. Top strip: open / claimed / cleared counts.",
    screens: [
      "Map board — pins + counts",
      "Assign sheet — responder list with ETA",
      "Clear log — recent resolutions",
    ],
    techStack: [
      "Next.js + MapLibre or Leaflet",
      "In-memory / Supabase realtime for assignments",
      "Seed JSON for festival demo scenario",
    ],
    whyItWins:
      "Chaos → order is visible on the map in one gesture; no form farm.",
    demoPlan: [
      "0–20s: three red pins, nobody assigned",
      "20–55s: assign two responders live",
      "55–75s: clear one; counts update",
      "75–90s: reset and land the mission line",
    ],
    buildScope: [
      "Map with seed pins",
      "Severity + assign gesture",
      "Responder free/busy state",
      "Reset demo scenario",
    ],
    risks: ["Map tile keys", "Fake ETAs confusing judges"],
  };
}

function inboxTriage() {
  return {
    oneLiner:
      "An inbox that proposes one irreversible action per email — archive, refund, or escalate — with a big Undo window.",
    mission:
      "Support queues die in hesitation. This exists to force one clear next action per message so backlog actually moves.",
    targetUser:
      "A solo Shopify seller clearing 40 customer emails between packing orders.",
    coreLoop:
      "Open next email → see one recommended action + reason → confirm → Undo toast → next email.",
    howItWorks: [
      "Pull or simulate an IMAP/Gmail label of unread threads.",
      "Classify into refund / shipping / escalate with keyword + LLM stub.",
      "UI shows exactly one primary CTA; secondary actions are hidden behind More.",
      "Confirm executes a mocked side effect and starts a 10s Undo.",
      "Skip only after logging a reason chip.",
    ],
    looksLike:
      "Single-column focus mode: email body, then a giant primary button (e.g. Issue $24 refund). Tiny More link. Undo toast sticky at bottom.",
    screens: [
      "Queue — unread count + next-up card",
      "Focus — email + one CTA",
      "Undo toast — reverse last action",
    ],
    techStack: [
      "Next.js + mocked email fixtures",
      "Simple rules classifier (+ optional OpenAI)",
      "Local action log in IndexedDB",
    ],
    whyItWins:
      "Watch the queue count drop with one-button decisions — the product is the constraint.",
    demoPlan: [
      "0–15s: show 12 unread",
      "15–50s: clear three with one CTA each",
      "50–70s: Undo one refund",
      "70–90s: queue delta",
    ],
    buildScope: [
      "Fixture inbox of 12 threads",
      "One-CTA focus UI",
      "Undo window",
      "Action log",
    ],
    risks: ["Wrong auto-class", "Real email OAuth scope creep"],
  };
}

function budgetClick() {
  return {
    oneLiner:
      "A club treasurer tool that allocates leftover budget across line items in one click and prints a receipt of who got what.",
    mission:
      "End-of-term money sits unused because spreadsheets stall. This exists to make a fair split decision in one gesture with an auditable receipt.",
    targetUser:
      "A student club treasurer with $420 left and four leads arguing in a group chat.",
    coreLoop:
      "Enter leftover + constraints → pick fairness rule → one-click allocate → edit one slider → lock + export receipt.",
    howItWorks: [
      "Inputs: remaining dollars, line items with min/max, optional priority weights.",
      "Allocator runs greedy or proportional split under constraints.",
      "UI shows before/after bars; locking writes a receipt with timestamp.",
      "Export CSV/PDF of the locked allocation.",
    ],
    looksLike:
      "Spreadsheet-feel left list of line items, right big Allocate button and stacked bars. Receipt panel slides in on lock.",
    screens: [
      "Inputs — leftover + line items",
      "Allocate — bars + rule picker",
      "Receipt — locked split export",
    ],
    techStack: [
      "Next.js client allocator",
      "jsPDF or CSV export",
      "LocalStorage for draft budgets",
    ],
    whyItWins:
      "One click turns chaos into a printed split — the demo is the decision itself.",
    demoPlan: [
      "0–20s: show messy chat-like constraints",
      "20–55s: allocate and tweak one slider",
      "55–75s: lock receipt",
      "75–90s: export",
    ],
    buildScope: [
      "Constraint inputs",
      "Two allocation rules",
      "Lock + receipt",
      "CSV export",
    ],
    risks: ["Edge-case infeasible constraints"],
  };
}

function peerMatch() {
  return {
    oneLiner:
      "A matching board that pairs one tutor with one stuck student based on topic tags and shows the match as a single dramatic card flip.",
    mission:
      "Help channels drown in ‘anyone free?’. This exists to make one high-quality match obvious instead of a pile of unread pings.",
    targetUser:
      "A TA running office hours for 30 students with three tutors on shift.",
    coreLoop:
      "Students post topic cards → tutors set skills → Match Now → one pair flips on stage → session starts or requeues.",
    howItWorks: [
      "Topic tags + wait time score each student; tutors have skill tags + capacity 1.",
      "Match Now runs a simple max-weight pairing for one slot.",
      "UI animates the chosen pair; others dim.",
      "End session frees the tutor and pops the next best pair.",
    ],
    looksLike:
      "Two columns (Waiting / Tutors). Center stage card flips to reveal the match with topic chips. Ambient dim on everyone else.",
    screens: [
      "Board — waiting + tutors",
      "Match reveal — flip card",
      "Session — timer + End",
    ],
    techStack: [
      "Next.js + local state / Supabase",
      "Deterministic matcher for demo seed",
      "CSS flip animation",
    ],
    whyItWins:
      "The product IS the dramatic match — one flip, room gets it.",
    demoPlan: [
      "0–20s: crowded waiting column",
      "20–50s: Match Now flip",
      "50–75s: end + next match",
      "75–90s: mission line",
    ],
    buildScope: [
      "Seed students/tutors",
      "Matcher",
      "Flip reveal",
      "End/requeue",
    ],
    risks: ["Unfair match perception"],
  };
}

function offlineSync() {
  return {
    oneLiner:
      "A field intake form that works with zero bars and later syncs one critical packet with a visible conflict resolver.",
    mission:
      "Field workers lose data when signal dies. This exists to guarantee the form still captures truth offline and reconciles cleanly later.",
    targetUser:
      "A nonprofit canvasser filling intake forms in a basement with no reception.",
    coreLoop:
      "Fill form offline → save locally → climb to signal → Sync → resolve one conflict → green check.",
    howItWorks: [
      "Service worker + IndexedDB store drafts with client UUIDs.",
      "Sync posts pending packets; server echoes version vectors.",
      "On conflict, UI shows field-level A/B picker — never silent overwrite.",
      "Demo airplane-mode toggle fakes offline.",
    ],
    looksLike:
      "Mobile-first form with Offline badge. Sync sheet lists packets; conflict card is red with Keep mine / Keep theirs per field.",
    screens: [
      "Form — offline badge",
      "Outbox — pending packets",
      "Conflict — field A/B",
    ],
    techStack: [
      "Next.js PWA + workbox-lite",
      "IndexedDB outbox",
      "Mock sync API",
    ],
    whyItWins:
      "Airplane mode → fill → sync → conflict resolve is an undeniable demo arc.",
    demoPlan: [
      "0–20s: go offline, fill form",
      "20–50s: still saved",
      "50–75s: online sync + conflict",
      "75–90s: green check",
    ],
    buildScope: [
      "Offline form save",
      "Outbox sync",
      "One conflict UI",
      "Airplane toggle",
    ],
    risks: ["PWA install quirks"],
  };
}

function privacyKillSwitch() {
  return {
    oneLiner:
      "A share sheet interceptor that blocks a paste containing secrets and forces a redacted version before it leaves the device.",
    mission:
      "People leak API keys and addresses in ‘quick shares’. This exists to stop the bad paste at the last second.",
    targetUser:
      "A junior eng about to paste a .env snippet into Slack.",
    coreLoop:
      "Paste into share box → scan → block with highlighted secrets → one-tap redact → allow send.",
    howItWorks: [
      "Regex + entropy detectors for keys, emails, street-like lines.",
      "Blocked state shows highlighted spans and Redact & continue.",
      "Allow once is behind a hold gesture.",
      "Local-only — nothing uploads in MVP.",
    ],
    looksLike:
      "Minimal share composer. Red shield banner on block. Secrets underlined in red. Primary button becomes Redact & continue.",
    screens: [
      "Composer — paste area",
      "Block — highlighted secrets",
      "Allowed — green send",
    ],
    techStack: [
      "Next.js client detectors",
      "Clipboard events",
      "No backend required for MVP",
    ],
    whyItWins:
      "Paste a fake key, get blocked — the product proves itself in five seconds.",
    demoPlan: [
      "0–15s: paste clean text; ok",
      "15–45s: paste key; block",
      "45–70s: redact & continue",
      "70–90s: mission",
    ],
    buildScope: [
      "Detectors for key/email",
      "Block UI",
      "Redact action",
      "Hold-to-allow",
    ],
    risks: ["False positives on UUIDs"],
  };
}

function rubricGrader() {
  return {
    oneLiner:
      "Drop a project README or demo video link and get a live rubric score with evidence quotes tied to each criterion.",
    mission:
      "Grading is slow and fuzzy. This exists to make criteria visible and tied to evidence so feedback is actionable in one pass.",
    targetUser:
      "A TA grading 20 hackathon-style writeups against a published rubric.",
    coreLoop:
      "Paste rubric → upload artifact → score each row with quote → adjust → export feedback PDF.",
    howItWorks: [
      "Rubric rows are criteria + max points.",
      "LLM or keyword pass proposes score + quote per row.",
      "TA edits scores; locked export includes quotes.",
      "Demo uses a fixed rubric + two sample writeups.",
    ],
    looksLike:
      "Table of criteria with score steppers; right pane shows the quote highlighted in the source text.",
    screens: [
      "Rubric setup",
      "Grade — scores + quotes",
      "Export feedback",
    ],
    techStack: [
      "Next.js",
      "Optional OpenAI for quote propose",
      "jsPDF export",
    ],
    whyItWins:
      "Watch a vague writeup get a scored rubric with receipts — not a vibe check.",
    demoPlan: [
      "0–20s: show rubric",
      "20–55s: auto-score with quotes",
      "55–75s: tweak one row",
      "75–90s: export",
    ],
    buildScope: [
      "Rubric editor",
      "Artifact paste",
      "Score+quote rows",
      "PDF export",
    ],
    risks: ["LLM quote hallucination"],
  };
}

function consequenceSim() {
  return {
    oneLiner:
      "A choose-A/B simulator that forks a timeline and shows the messy outcomes of each policy choice side by side.",
    mission:
      "People debate policies in abstractions. This exists to make consequences visible so a team picks with eyes open.",
    targetUser:
      "A student government officer deciding whether to cut late-night shuttle funding.",
    coreLoop:
      "Pick scenario → choose A or B → watch timeline cards spawn → compare metrics → reverse and try the other fork.",
    howItWorks: [
      "Scenario JSON defines forks, events, and metric deltas.",
      "Choosing a fork appends timed event cards and updates meters.",
      "Compare mode pins both forks.",
      "Reset restores the decision point.",
    ],
    looksLike:
      "Two vertical timelines after a choice; meters for safety/cost/satisfaction. Big A/B buttons at the decision gate.",
    screens: [
      "Scenario gate — A/B",
      "Timeline — event cards",
      "Compare — both forks",
    ],
    techStack: [
      "Next.js + scenario JSON",
      "Framer Motion for card spawn",
      "No backend for MVP",
    ],
    whyItWins:
      "A/B forks on screen beat a slide about tradeoffs.",
    demoPlan: [
      "0–20s: state the dilemma",
      "20–50s: pick A; events cascade",
      "50–75s: compare B",
      "75–90s: mission",
    ],
    buildScope: [
      "One scenario with two forks",
      "Metric meters",
      "Compare mode",
      "Reset",
    ],
    risks: ["Feels toy if metrics are opaque"],
  };
}

function spatialFinder() {
  return {
    oneLiner:
      "Pin a broken thing on a building map and route the nearest fixer with a photo brief attached to the pin.",
    mission:
      "Facilities tickets lose the ‘where’. This exists so location + photo + owner are one object.",
    targetUser:
      "A residence RA reporting a lobby leak at 1am.",
    coreLoop:
      "Drop pin → snap photo → set severity → notify assigned fixer → pin tracks status until resolved.",
    howItWorks: [
      "Floorplan or campus map with pin drop.",
      "Photo attaches to pin record.",
      "Simple assignment by zone ownership.",
      "Status chips: open → claimed → fixed.",
    ],
    looksLike:
      "Map with photo thumbnails on pins; bottom sheet for new report; status chips in lime/amber/red.",
    screens: [
      "Map — pins",
      "Report sheet — photo + severity",
      "Fixer view — my pins",
    ],
    techStack: [
      "Next.js + Leaflet image overlay",
      "Local/Supabase pin store",
      "Camera capture input",
    ],
    whyItWins:
      "Pin + photo is the ticket — no lost ‘which lobby’ thread.",
    demoPlan: [
      "0–20s: drop pin + photo",
      "20–50s: assign fixer",
      "50–75s: mark fixed",
      "75–90s: before/after map",
    ],
    buildScope: [
      "Map + pin drop",
      "Photo attach",
      "Status flow",
      "Seed building overlay",
    ],
    risks: ["Map calibration"],
  };
}

function clipCutter() {
  return {
    oneLiner:
      "Drop a long talking-head video and get the single best 8-second clip ranked by energy and clarity.",
    mission:
      "Creators drown in footage. This exists to surface one usable moment fast instead of scrubbing for an hour.",
    targetUser:
      "A TikTok-bound student editor with a 12-minute interview dump.",
    coreLoop:
      "Upload → analyze windows → rank clips → preview top 3 → export the winner.",
    howItWorks: [
      "Chunk audio into 8s windows; score loudness variance + transcript clarity.",
      "Rank top windows; show waveform with markers.",
      "Export trims client-side with ffmpeg.wasm or server trim.",
    ],
    looksLike:
      "Waveform with three glowing windows; right rail previews; big Export 8s button.",
    screens: [
      "Upload",
      "Ranked clips",
      "Export",
    ],
    techStack: [
      "Next.js upload",
      "Whisper stub or WebAudio features",
      "ffmpeg.wasm trim",
    ],
    whyItWins:
      "Long dump → one killer clip is an instant wow.",
    demoPlan: [
      "0–20s: drop long video",
      "20–55s: show top 3 windows",
      "55–75s: export winner",
      "75–90s: play clip",
    ],
    buildScope: [
      "Upload + waveform",
      "Window scoring",
      "Top-3 preview",
      "Export trim",
    ],
    risks: ["Large file perf"],
  };
}

function consentVault() {
  return {
    oneLiner:
      "Share a personal doc via a link that auto-expires and shows the recipient a consent card they must accept first.",
    mission:
      "People email sensitive PDFs forever. This exists to make sharing time-boxed and acknowledged.",
    targetUser:
      "A freelancer sending a passport scan to a client for the day.",
    coreLoop:
      "Upload → set expiry + purpose → send link → recipient accepts consent → view → link dies.",
    howItWorks: [
      "Store blob with expiry timestamp and purpose string.",
      "Recipient page requires Accept before reveal.",
      "Access log records accept + views.",
      "Cron or lazy check burns the link.",
    ],
    looksLike:
      "Sender: purpose + expiry stepper. Recipient: big consent card, then doc viewer with countdown.",
    screens: [
      "Create share",
      "Consent gate",
      "Viewer + countdown",
    ],
    techStack: [
      "Next.js + object store / local demo store",
      "Signed URLs with expiry",
      "Access log table",
    ],
    whyItWins:
      "Consent card + dying link is a clear trust demo.",
    demoPlan: [
      "0–20s: create 2-min link",
      "20–50s: consent gate",
      "50–75s: view + countdown",
      "75–90s: expired state",
    ],
    buildScope: [
      "Upload + expiry",
      "Consent gate",
      "Viewer",
      "Expire state",
    ],
    risks: ["Real secrets in demos"],
  };
}

function queueBoard() {
  return {
    oneLiner:
      "A public walk-up queue board that issues tickets, shows wait estimates, and prevents line-cutting with a visible order.",
    mission:
      "Walk-up services feel unfair. This exists to make order and wait time public so conflict drops.",
    targetUser:
      "A campus print-shop attendant juggling a door line during finals.",
    coreLoop:
      "Take ticket → see place + ETA → get called → complete → next.",
    howItWorks: [
      "Ticket numbers issued sequentially; display board mirrors phone view.",
      "ETA = avg service time × position.",
      "Attendant calls Next; skips mark no-show.",
    ],
    looksLike:
      "Big board ‘Now serving’, list of waiting numbers, kiosk Take ticket button, attendant tablet with Next.",
    screens: [
      "Public board",
      "Kiosk ticket",
      "Attendant Next",
    ],
    techStack: [
      "Next.js + realtime (Supabase/Pusher)",
      "Simple ETA math",
      "Tablet + TV layouts",
    ],
    whyItWins:
      "Fairness becomes visible — the board is the product.",
    demoPlan: [
      "0–20s: issue three tickets",
      "20–50s: call Next twice",
      "50–75s: no-show skip",
      "75–90s: ETA update",
    ],
    buildScope: [
      "Ticket issue",
      "Board display",
      "Next / no-show",
      "ETA",
    ],
    risks: ["Clock sync across screens"],
  };
}

function repairOverlay() {
  return {
    oneLiner:
      "Point your phone camera at a bike brake and get step overlays that advance only when the part is in frame.",
    mission:
      "Repair guides are walls of text. This exists to put the next step on the thing you’re looking at.",
    targetUser:
      "A student fixing a flat in a dorm hallway with one hand on the phone.",
    coreLoop:
      "Pick repair → point camera → see step overlay → confirm done → next step → finish checklist.",
    howItWorks: [
      "Demo uses image-class or manual ‘I’m here’ advances with AR-ish CSS overlays.",
      "Each step has a target hint box and a short instruction.",
      "Checklist persists locally.",
    ],
    looksLike:
      "Camera full-bleed, translucent step card, corner checklist, big Next step button.",
    screens: [
      "Pick repair",
      "Camera steps",
      "Done checklist",
    ],
    techStack: [
      "Next.js getUserMedia",
      "Step JSON content",
      "Optional TF.js toy detector",
    ],
    whyItWins:
      "Camera + overlay beats a PDF guide on stage.",
    demoPlan: [
      "0–20s: pick brake pad",
      "20–55s: two overlay steps",
      "55–75s: checklist complete",
      "75–90s: mission",
    ],
    buildScope: [
      "Camera view",
      "3-step overlay pack",
      "Manual advance",
      "Checklist",
    ],
    risks: ["True AR hard in a weekend"],
  };
}

/** Brandable product name only — never embeds the hackathon or a numeric suffix. */
function inventTitle(seed: number): string {
  const a = [
    "North", "Volt", "Prism", "Hollow", "Kinetic", "Amber", "Cedar", "Flux",
    "Marble", "Orbit", "Pulse", "Quill", "Ridge", "Solace", "Tide", "Umbra",
    "Vesper", "Willow", "Zephyr", "Axon", "Bramble", "Cipher", "Drift", "Ember",
  ];
  const b = [
    "Gate", "Loom", "Forge", "Latch", "Span", "Wick", "Nest", "Arc",
    "Bloom", "Chord", "Dock", "Edge", "Field", "Glass", "Harbor", "Ink",
    "Knot", "Ledger", "Mirror", "Node", "Path", "Quilt", "Raft", "Shift",
  ];
  const i = Math.abs(seed) % a.length;
  const j = Math.abs((seed * 7) >> 3) % b.length;
  return `${a[i]}${b[j]}`;
}
