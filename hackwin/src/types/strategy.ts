export type HackathonInput = {
  name: string;
  theme: string;
  sponsors: string;
  pastWinners: string;
  constraints: string;
  url?: string;
};

export type ResearchSource = {
  url: string;
  title: string;
  kind: "page" | "prizes" | "winners" | "gallery" | "search";
  snippet?: string;
};

export type ResearchDossier = {
  resolvedName: string;
  theme: string;
  judgingCriteria: string[];
  sponsors: {
    name: string;
    prizeTrack: string;
    prizeDetails: string;
    techOrApi: string;
  }[];
  pastWinners: {
    year: string;
    project: string;
    description: string;
    track: string;
    whyItWon: string;
  }[];
  notableProjects: {
    name: string;
    description: string;
    url: string;
  }[];
  gaps: string[];
  sources: ResearchSource[];
  rawNotes?: string;
};

export type IdeaScore = {
  themeFit: number;
  sponsorFit: number;
  demoWow: number;
  feasibility: number;
  differentiation: number;
  overall: number;
};

export type StrategyIdea = {
  rank: number;
  title: string;
  oneLiner: string;
  /** Why the product exists — who + change + purpose. */
  mission: string;
  /** Specific person in a specific situation. */
  targetUser: string;
  /** The repeating product action. */
  coreLoop: string;
  /** Step-by-step mechanics. */
  howItWorks: string[];
  /** Dense visual / UX description. */
  looksLike: string;
  /** Named screens and what each shows. */
  screens: string[];
  /** Concrete MVP tech choices. */
  techStack: string[];
  tracks: string[];
  scores: IdeaScore;
  whyItWins: string;
  sponsorPlay: string;
  themePlay: string;
  demoPlan: string[];
  buildScope: string[];
  risks: string[];
};

export type StrategyBrief = {
  hackathonName: string;
  themeRead: string;
  judgeSignals: string[];
  sponsorAngles: { sponsor: string; angle: string; prizeHook: string }[];
  winnerPatterns: string[];
  crowdedIdeasToAvoid: string[];
  recommendedIdea: StrategyIdea;
  runnerUps: StrategyIdea[];
  pitchScript: string;
  weekendPlan: { hour: string; focus: string }[];
  research?: ResearchDossier;
  demo: boolean;
};
