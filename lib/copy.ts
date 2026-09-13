/**
 * Every user-facing sentence and section heading in the product, in one place,
 * so wording can be reviewed and edited without reading JSX.
 *
 * What lives here: sentences, taglines, and section headings.
 * What stays inline: short conventional control labels — buttons, field labels,
 * nav items, and status words like "Retake", "Solved", or "Continue".
 */
function topicSentence(topic: string): string {
  const trimmed = topic.trim();
  if (trimmed.length === 0) return "This kind of object";

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export const copy = {
  brand: {
    metaTitle: "SIDEQUEST — Find the math hiding in your world",
    metaDescription:
      "Photograph something real and SIDEQUEST turns the math hiding inside it into a challenge built just for you.",
    footer: "SIDEQUEST — find the math hiding in your world.",
  },

  landing: {
    eyebrow: "Your next mission starts with a photo",
    heroLineOne: "Find the math",
    heroLineTwo: "hiding in your",
    heroAccent: "world.",
    heroBody:
      "Photograph something real. SIDEQUEST looks closely, finds the numbers hiding inside, and turns them into a challenge made only for that object.",
    howItWorksLabel: "How a mission works",
    howItWorks: [
      {
        title: "Point at something real",
        body: "A can, a window, a carton of eggs. Anything nearby with numbers or shapes hiding in it.",
      },
      {
        title: "Look closely",
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
      "No worksheets. Just whatever you can find, and the math already hiding in it.",
  },

  setup: {
    gradeLabel: "Step one · Your year",
    gradeHeading: "Which grade are you in?",
    skillsLocked: "Pick a grade to unlock your missions.",
    skillLabel: "Step two · Your mission",
    skillHeading: "What are we investigating?",
    nothingChosen: "Choose a grade and a skill to begin.",
    launch: "Let's investigate.",
  },

  scan: {
    heading: "Let's investigate.",
    /** Precedes the skill's own "look for" phrase, which stays highlighted. */
    lookForLead: (skill: string) => `For ${skill}, look for `,
    emptyPreview: "Your photo will appear here",
    previewAlt: "The object you photographed",
    cluePhotoFailed:
      "That extra photo didn't come through. Try another one — your first photo is still here.",
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
    /** The photograph was accepted; writing the challenge did not finish. */
    generationFailedHeading: "The challenge didn't quite write itself.",
    generationFailedBody:
      "Your photo is fine. Something went wrong making the Sidequest. It's still here — try sending it again.",
    processingSteps: [
      "Looking closely…",
      "Finding the object…",
      "Hunting for the math…",
      "Writing your discovery…",
      "Checking your Sidequest…",
    ],
  },

  flow: {
    setup: "Mission",
    scan: "Scan",
    quest: "Quest",
  },

  /**
   * What the student sees when the first photograph can support the skill,
   * but SIDEQUEST still needs one more observation. This is progress, not a
   * detour: the object stayed, the quest stayed, and the next step is a clue.
   */
  clue: {
    eyebrow: "SIDEQUEST CLUE",
    heading: "I think we can use this.",
    investigate: (objectName: string) =>
      `Let's investigate your ${objectName} a little more.`,
    cta: {
      second_photo: "Add Another Photo",
      student_measurement: "Enter Measurement",
      student_count: "Enter Count",
      student_input: "Answer Question",
    },
    replacePhoto: "Replace Clue Photo",
    saveClue: "Save this clue",
    measurementPlaceholder: "48 inches",
    countPlaceholder: "8",
    inputPlaceholder: "Your answer",
    photoReady: "Nice — that extra photo is ready for the next step.",
    valueReady: "Got it. We'll use this in the next step.",
    anotherObject: "Choose a different object",
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

  /**
   * What the skill-fit stage says when the object and the mission do not meet.
   *
   * Assembled a sentence at a time: what could not be found, what to look for
   * instead, and — only when the object genuinely suits one — which other
   * mission would work. The "look for" phrase comes from the skill catalogue, so
   * a student is pointed at the same thing the scan screen already described.
   *
   * Nothing here treats a poor fit as a mistake. It is not one, and the object
   * is not the problem: the pair is.
   */
  fit: {
    noChallenge: (skill: string) =>
      `This is a cool find, but I can't find a strong ${skill} challenge in it.`,
    tryInstead: (lookFor: string) => `Try finding ${lookFor}.`,
    /** The student still chooses; nothing switches their mission for them. */
    alternative: (skill: string) =>
      `It would make a good ${skill} sidequest, though.`,
    failure:
      "Something went wrong working out the math in that photo, so no Sidequest came out of it. Take another one and try again.",
  },

  /**
   * What the discovery stage says when it cannot write a fact it trusts.
   *
   * Same discipline as the other pipeline copy: one next step, no internals.
   * The student is not told that a model failed, only that this photo did
   * not become a Sidequest and that another try is the way out.
   */
  discovery: {
    failure:
      "Something went wrong finding an interesting fact in that photo, so no Sidequest came out of it. Take another one and try again.",
  },

  /**
   * What Challenge Generation says when it cannot write a problem it trusts.
   *
   * The student is never shown the candidate question or the answer. A
   * failure here is the same kind of dead end as the other pipeline stages:
   * one next step, no internals.
   */
  challenge: {
    failure:
      "Something went wrong making a challenge from that photo. Your object is still here — try sending it again.",
  },

  /**
   * What verification says when neither candidate's maths can be trusted.
   *
   * The student is not told which number was wrong. A failed check is a
   * dead end like the other pipeline stages: one next step, no internals.
   */
  verify: {
    failure:
      "Something went wrong checking the math in that photo, so no Sidequest came out of it. Take another one and try again.",
  },

  /**
   * What a student sees when a photograph does not become a Sidequest.
   *
   * These are not errors. A detour is the product saying "not this object,
   * not this photo" and pointing at what to try next. The five situations
   * below are the only ones the UI can present; internal reason codes and
   * moderation categories never reach this copy.
   */
  detour: {
    eyebrow: "SIDEQUEST DETOUR",
    heading: "This trail took a turn.",
    tryFinding: "Try finding something that:",
    tryPhoto: "A stronger photo usually has:",
    unsafe: {
      message:
        "That photo can't be used for a Sidequest. Try taking a picture of an everyday object around you.",
      suggestions: [
        "one everyday object you can hold or point at",
        "a label, a shape, or parts you can count",
        "nothing private — just something nearby",
      ],
    },
    person: {
      message:
        "Sidequests are built from objects, not people. Point the camera at something near you instead.",
      suggestions: [
        "a bottle, a book, or a box",
        "something with a label or clear edges",
        "just one main object in the frame",
      ],
    },
    unknown: {
      message:
        "I couldn't quite tell what that is. Let's try a clearer photo of one main object.",
      suggestions: [
        "one object filling most of the frame",
        "enough light to see the edges",
        "the camera held still",
      ],
    },
    poorFit: {
      message: (skill: string) =>
        `This is a cool object, but I can't find a strong ${skill} challenge hiding in it.`,
      fallbackSuggestions: [
        "can be divided into equal pieces",
        "has repeated sections",
        "shows a measurement",
      ],
    },
    retake: {
      message:
        "That photo came out a little too mysterious. A clearer shot will help me find the math.",
      suggestions: [
        "brighter lighting",
        "the camera held still so it stays in focus",
        "one main object",
        "a little closer, or a step back if it's cut off",
      ],
    },
    insufficient: {
      message:
        "I can see it, but I can't find enough math hiding in it yet.",
      suggestions: [
        "visible measurements",
        "repeated parts",
        "countable groups",
        "clear shapes",
        "labeled quantities",
      ],
    },
    wandered: {
      message:
        "This sidequest took a wander. Let's pick a new object and try again.",
      suggestions: [
        "one everyday object",
        "something with numbers, parts, or clear edges",
      ],
    },
  },

  quest: {
    objectFoundLabel: "Object found",
    discoverLabel: "Discover",
    connectionLabel: "The connection",
    challengeLabel: "Your challenge",
    correct: (answer: number, unit: string) => `That's it. ${answer} ${unit}.`,
    solutionLabel: "How it works out",
    incorrect: "Not quite. Have another go.",

    /**
     * The three-stage reveal on a real, ready Sidequest — and the friendly
     * states when a quest is not ready yet. Static sentences live here;
     * object names, measurements, and the challenge question stay data.
     */
    experience: {
      discoverEyebrow: "Discover",
      connectEyebrow: "You found the math",
      challengeEyebrow: "Your challenge",
      stageDiscover: "Discover",
      stageConnect: "Connect",
      stageChallenge: "Challenge",
      showMath: "Show Me the Math",
      startQuest: "Start Sidequest",
      submit: "Submit",
      hint: "Hint",
      hint1: "Hint 1",
      hint2: "Hint 2",
      lookClosely: (objectName: string, value: string) =>
        `Look closely — your ${objectName} shows ${value}.`,
      inspiredTrail: (objectName: string, topic: string) =>
        `Your ${objectName} sent us on another trail. ${topicSentence(topic)} gives us numbers to explore from the wider world, not from a label in your photo.`,
      thatMeasurement: (skill: string) =>
        `That real measurement gives us a starting point for ${skill}.`,
      inspiredPractice: (skill: string) =>
        `Those real-world numbers give us a starting point for ${skill}.`,
      imaginedSituation:
        "Your object gives us the real number to start from. The challenge may set up a situation around it.",
      inspiredSituation:
        "These extra numbers come from the world around your object, or from a situation the challenge imagines. They were not read off your photo.",
      processingHeading: "Still looking closely.",
      processingBody:
        "SIDEQUEST is still finding the math in your photo. This usually takes just a moment.",
      checkAgain: "Check again",
      failedHeading: "This trail didn't quite open.",
      failedBody:
        "Something got in the way of turning that photo into a Sidequest. You can try another photo, or pick a new mission.",
      tryAgain: "Try another photo",
      scanAnother: "Scan another object",
      changeMission: "Change mission",
      findAnother: "Find Another Object",
      tryAnotherSkill: "Try Another Math Skill",
      submitted:
        "Got it. Checking answers is coming next — your Sidequest is still here.",
      correctHeading: "Nice work — you found the math.",
      incorrectTrail: "Not quite — you're on the trail.",
      revealedHeading: "Let's look at how it works out.",
      revealedBody:
        "Every Sidequest teaches something. Here's the path through this one.",
      xp: (amount: number) => `+${amount} XP`,
      checking: "Checking…",
      invalidNumber:
        "That answer didn't come through as a number I can check. Try typing it again.",
      invalidFraction:
        "That fraction needs two whole numbers, and the bottom can't be zero.",
      invalidChoice:
        "Pick one of the shape names on the list. We can only check those exact words.",
      unavailable:
        "This Sidequest isn't ready to check yet. Try another photo.",
      answerLabel: "Your answer",
      answerChoiceLabel: "Choose the best match",
      answerUnitLabel: (unit: string) => `Your answer in ${unit}`,
      numberPlaceholder: "Type a number",
      fractionNumerator: "Top number",
      fractionDenominator: "Bottom number",
      unsupportedAnswer:
        "This challenge needs a kind of answer we can't collect yet. Photograph another object to get a new one.",
      photoAlt: (objectName: string) => `Your photo of ${objectName}`,
      photoMissing: "Your photo will appear here",
    },
  },

  progress: {
    eyebrow: "Your explorer log",
    heading: "Your math map is growing.",
    body: "Every Sidequest you finish fills in your math map — one skill, one object, one little win at a time.",
    emptyHeading: "Your math map is ready.",
    emptyBody: "Complete a Sidequest to start filling it in.",
    explorerStat: "Math Explorer Level",
    completedStat: "Sidequests Completed",
    discoveredStat: "Objects Discovered",
    skillsLabel: "Your skills",
    nextCta: "Ready for another mission?",
    firstCta: "Find my first mission",
    skillStatus: {
      unpracticed: (skill: string) => `${skill} is waiting to be explored.`,
      needsPractice: (skill: string) =>
        `${skill} could use another Sidequest.`,
      growing: (skill: string) => `${skill} is getting stronger.`,
      strong: (skill: string) => `${skill} is looking strong.`,
    },
  },

  notFound: {
    eyebrow: "Nothing here",
    heading: "That sidequest has wandered off.",
    body: "The object you were looking for isn't here. Pick a mission and photograph something new.",
  },
} as const;

export type Copy = typeof copy;
