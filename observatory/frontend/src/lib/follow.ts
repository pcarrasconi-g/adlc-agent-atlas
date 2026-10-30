// Playback state for a session: where the cursor is, whether it follows the
// newest event ("live"), and how many events arrived while the user looked at
// an older step. Pure so the rules can be tested without a browser.

export type FollowState = {
  cursor: number;
  total: number;
  follow: boolean;
  playing: boolean;
  unseen: number;
};

export type FollowAction =
  | { type: "open"; total: number }
  | { type: "events"; total: number }
  | { type: "seek"; index: number }
  | { type: "step"; delta: number }
  | { type: "togglePlay" }
  | { type: "tick" }
  | { type: "pause" }
  | { type: "present" };

export const initialFollow: FollowState = {
  cursor: 0,
  total: 0,
  follow: true,
  playing: false,
  unseen: 0,
};

const last = (total: number) => Math.max(0, total - 1);
const clamp = (index: number, total: number) =>
  Math.min(last(total), Math.max(0, Math.trunc(index) || 0));

export const atPresent = (s: FollowState) => s.cursor >= last(s.total);

export function followReducer(s: FollowState, a: FollowAction): FollowState {
  switch (a.type) {
    case "open":
      // A freshly opened session shows its latest state, not step 0.
      return { cursor: last(a.total), total: a.total, follow: true, playing: false, unseen: 0 };
    case "events": {
      if (a.total < s.total) {
        // History got shorter (session rewritten): resync instead of pointing past the end.
        return { ...s, total: a.total, cursor: s.follow ? last(a.total) : clamp(s.cursor, a.total), unseen: 0 };
      }
      if (s.follow) return { ...s, total: a.total, cursor: last(a.total), unseen: 0 };
      // The user is looking at history: never move the cursor, only count.
      return { ...s, total: a.total, unseen: s.unseen + (a.total - s.total) };
    }
    case "seek":
      return { ...s, cursor: clamp(a.index, s.total), follow: false, playing: false };
    case "step":
      return { ...s, cursor: clamp(s.cursor + a.delta, s.total), follow: false, playing: false };
    case "togglePlay":
      if (s.playing) return { ...s, playing: false };
      if (s.total === 0) return s;
      // Replaying from the end restarts the story; replay never re-attaches to live.
      return { ...s, follow: false, playing: true, cursor: atPresent(s) ? 0 : s.cursor };
    case "tick":
      if (!s.playing) return s;
      if (atPresent(s)) return { ...s, playing: false };
      return { ...s, cursor: s.cursor + 1 };
    case "pause":
      return s.playing ? { ...s, playing: false } : s;
    case "present":
      return { ...s, cursor: last(s.total), follow: true, playing: false, unseen: 0 };
  }
}
