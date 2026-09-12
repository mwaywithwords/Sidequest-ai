import type { ProgressSummary } from "./types";

/** Placeholder figures for the progress screen until attempts are recorded for real. */
export const MOCK_PROGRESS: ProgressSummary = {
  questsSolved: 14,
  objectsScanned: 21,
  dayStreak: 4,
  skills: [
    { skillId: "addition", attempted: 4, correct: 4 },
    { skillId: "subtraction", attempted: 3, correct: 2 },
    { skillId: "multiplication", attempted: 5, correct: 4 },
    { skillId: "division", attempted: 6, correct: 3 },
    { skillId: "fractions", attempted: 2, correct: 1 },
    { skillId: "measurement", attempted: 1, correct: 0 },
    { skillId: "geometry", attempted: 0, correct: 0 },
  ],
  recent: [
    {
      id: "soda-can",
      objectName: "Soda can",
      skillId: "division",
      solved: true,
      when: "Today",
    },
    {
      id: "pizza-box",
      objectName: "Pizza",
      skillId: "fractions",
      solved: false,
      when: "Yesterday",
    },
    {
      id: "egg-carton",
      objectName: "Egg carton",
      skillId: "multiplication",
      solved: true,
      when: "Yesterday",
    },
    {
      id: "window-pane",
      objectName: "Window",
      skillId: "geometry",
      solved: true,
      when: "3 days ago",
    },
  ],
};
