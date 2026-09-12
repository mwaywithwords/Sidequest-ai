/**
 * Every user-facing sentence and section heading in the product, in one place,
 * so wording can be reviewed and edited without reading JSX.
 *
 * What lives here: sentences, taglines, and section headings.
 * What stays inline: short conventional control labels — buttons, field labels,
 * nav items, and status words like "Retake", "Solved", or "Continue".
 */
export const copy = {
  brand: {
    metaTitle: "SIDEQUEST — Find the math hiding in your world",
    metaDescription:
      "Photograph something real and SIDEQUEST turns the math hiding inside it into a challenge built just for you.",
    footer: "SIDEQUEST — turn your world into your classroom.",
  },

  landing: {
    eyebrow: "Math that starts with your camera",
    heroLineOne: "Find the math",
    heroLineTwo: "hiding in your",
    heroAccent: "world.",
    heroBody:
      "Take a photo of something around you. SIDEQUEST finds the real numbers inside it and turns them into a challenge made only for that object.",
    howItWorksLabel: "How a sidequest works",
    howItWorks: [
      {
        title: "Point at something real",
        body: "A can, a window, a carton of eggs. Anything nearby with numbers or shapes hiding in it.",
      },
      {
        title: "See what's hiding inside",
        body: "SIDEQUEST names the object, tells you something surprising about it, and finds the math it carries.",
      },
      {
        title: "Solve your own challenge",
        body: "You get a problem built from that exact object. Take it apart, and the next one adapts to you.",
      },
    ],
    skillsLabel: "Seven skills, grades 3 to 5",
    closingLineOne: "Turn your world into",
    closingLineTwo: "your classroom.",
    closingBody:
      "No worksheets. Just whatever you can find, and the math already inside it.",
  },

  setup: {
    gradeLabel: "Step one · Your grade",
    gradeHeading: "Which grade are you in?",
    skillsLocked: "Pick a grade to unlock your skills.",
    skillLabel: "Step two · Your mission",
    skillHeading: "What are you working on?",
    nothingChosen: "Choose a grade and a skill to begin.",
  },

  scan: {
    heading: "Point at something real",
    /** Precedes the skill's own "look for" phrase, which stays highlighted. */
    lookForLead: (skill: string) => `For ${skill}, look for `,
    emptyPreview: "Your photo will appear here",
    previewAlt: "The object you photographed",
    rejectedHeading: "Let's try a different photo",
    rejectedPreview: "No photo loaded",
    /** Keyed to `ImageRejection`, so every rejection has something to say. */
    rejected: {
      missing:
        "There's no photo yet. Take one with your camera, or choose a picture you already have.",
      unsupported:
        "That file didn't come through as a photo I can read. Take a new one, or choose a different picture.",
      tooLarge: (limitMb: number) =>
        `That photo is larger than ${limitMb} MB, which is too big to work with. Try taking a new one with your camera.`,
    },
    /** Shown when the photo itself was fine but sending it did not finish. */
    uploadFailedHeading: "That photo didn't make it",
    uploadFailedBody:
      "Something went wrong sending your photo, so nothing was saved. It's still here — you can send it again.",
    processingSteps: [
      "Looking closely…",
      "Finding the math hiding in your photo…",
      "Checking your Sidequest…",
      "Building your challenge…",
    ],
  },

  quest: {
    objectFoundLabel: "Object found",
    discoverLabel: "Discover",
    connectionLabel: "The connection",
    challengeLabel: "Your challenge",
    correct: (answer: number, unit: string) => `That's it. ${answer} ${unit}.`,
    solutionLabel: "How it works out",
    incorrect: "Not quite. Have another go.",
  },

  progress: {
    eyebrow: "Your explorer log",
    heading: "What you've found so far",
    body: "Every object you photograph teaches SIDEQUEST a little more about which challenges to hand you next.",
    solvedStat: "Sidequests solved",
    scannedStat: "Objects scanned",
    streakStat: "Day streak",
    skillsLabel: "Skill by skill",
    recentLabel: "Recent sidequests",
    comingNextLabel: "Coming next",
    comingNextBody:
      "These numbers are a preview. Once your attempts are being saved, SIDEQUEST will use them to nudge each new challenge easier or harder without you having to ask.",
  },

  notFound: {
    eyebrow: "Nothing here",
    heading: "That sidequest has wandered off.",
    body: "The object you were looking for isn't here. Pick a mission and photograph something new.",
  },
} as const;

export type Copy = typeof copy;
