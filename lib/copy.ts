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

  /**
   * What the safety gate says when it turns a photo away.
   *
   * Vague on purpose. The gate's own reasons — and the moderation categories
   * behind them — are server-side detail, and a child needs a next step rather
   * than a verdict on what they photographed. Three sentences cover it: the
   * photo was unreadable, the photo was of a person, or the photo cannot be
   * used. Nothing here names a category.
   */
  safety: {
    /** Never seen: the flow moves on. Present because a verdict always carries a sentence. */
    allowed: "That photo works. Let's find the math in it.",
    unusable:
      "That photo came out too blurry or too dark to read. Try another one, a little closer, holding still.",
    person:
      "Sidequests are built from objects, not people. Point the camera at something near you instead — a bottle, a book, a bike wheel.",
    unsuitable:
      "That photo can't be used for a Sidequest. Try taking a picture of an everyday object around you.",
  },

  /**
   * What the vision stage says when it cannot get a reading it trusts.
   *
   * Same discipline as the safety copy: one next step, no internals. The
   * difference between these three is what the student should do differently —
   * find another object, take a better photo of this one, or simply try again.
   */
  analysis: {
    unknownObject:
      "I couldn't work out what that object is. Try something with a clearer shape or a label on it — a can, a book, a box of something.",
    insufficientInformation:
      "I can see it, but there's nothing on it to build math from. Get a little closer, or find something with numbers, parts, or clear edges.",
    failure:
      "Something went wrong reading that photo, so no Sidequest came out of it. Take another one and try again.",
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
