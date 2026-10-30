// The recorded demo: real events from a real Claude Code + ADLC run, frozen as
// static data so the page opens without Claude Code or an API. It answers the
// same routes the API does, using the same projection code.
import { projectSession } from "../../../backend/src/lib/projection.ts";

export type Demo = {
  schema: "atlas.demo.v1";
  label: string;
  session: Record<string, any>;
  events: any[];
  projectionEvents: any[];
  edges: any[];
};

export const DEMO_PREFIX = "demo:";
export const isDemoId = (id?: string | null) =>
  typeof id === "string" && id.startsWith(DEMO_PREFIX);

export async function loadDemo(
  fetcher: typeof fetch = fetch,
): Promise<Demo | null> {
  try {
    const r = await fetcher(new URL("demo/demo.json", document.baseURI));
    if (!r.ok) return null;
    const d = await r.json();
    return d?.schema === "atlas.demo.v1" ? d : null;
  } catch {
    return null;
  }
}

const project = (demo: Demo, atSequence?: number) =>
  projectSession({
    sessionStatus: demo.session.status,
    events: demo.projectionEvents,
    edges: demo.edges,
    atSequence,
  });

/** Answers an API path for the demo session, or undefined when the path is not the demo's. */
export function demoRoute(demo: Demo, url: string): unknown | undefined {
  const u = new URL(url, "http://atlas.local");
  const m = u.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(\w+))?$/);
  if (!m || decodeURIComponent(m[1]) !== demo.session.id) return undefined;
  switch (m[2]) {
    case undefined:
      return demo.session;
    case "events": {
      const after = u.searchParams.get("afterSequence");
      const limit = Math.min(Number(u.searchParams.get("limit") || 100), 500);
      return demo.events
        .filter((e) => after === null || e.sequence > Number(after))
        .slice(0, limit);
    }
    case "projection": {
      const at = u.searchParams.get("atSequence");
      return project(demo, at === null ? undefined : Number(at));
    }
    case "graph": {
      const v = project(demo);
      return {
        nodes: v.nodes,
        links: v.links,
        displayStatus: v.displayStatus,
        recordedStatus: v.recordedStatus,
      };
    }
    default:
      return undefined;
  }
}
