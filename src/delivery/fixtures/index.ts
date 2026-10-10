export const FIXTURES: Record<string, Record<string, unknown>> = {
  website_base: {
    layout: "one_page",
    sections: ["hero", "offer", "cta"],
    stylesheet: `body{font-family:Georgia,serif;margin:0;background:#f4f1ea;color:#1c1917}
header,main,footer{max-width:720px;margin:0 auto;padding:2rem 1.25rem}
h1{font-size:2.5rem;letter-spacing:-0.03em}
.cta{display:inline-block;margin-top:1rem;padding:.75rem 1.25rem;background:#0f766e;color:#fff;text-decoration:none}`,
  },
  marketing_base: {
    sections: ["positioning", "offer", "channels"],
  },
  automation_base: {
    principles: [
      "No host execution of model-generated code",
      "Human approval for deploy/spend/destructive",
    ],
  },
  research_base: {
    sources: [
      {
        title: "Mock industry overview",
        url: "https://example.com/mock-research",
        snippet: "Fixture source for offline research workflows.",
      },
    ],
  },
};

export function getFixture(fixtureId: string) {
  const fixture = FIXTURES[fixtureId];
  if (!fixture) {
    throw new Error(`Unknown fixture: ${fixtureId}`);
  }
  return fixture;
}
