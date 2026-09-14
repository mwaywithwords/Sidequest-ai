/**
 * Deterministic challenge-generation reliability harness.
 *
 * Run with: npx tsx lib/ai/generation-reliability.check.ts
 *
 * These do not call a model. They stub the two generation requests and
 * prove the shared retry budget, retained path/Discovery, and
 * representative object/skill pairs.
 */

import type { WireChallenge } from "@/lib/ai/challenge-grounding";
import type { WireDiscovery } from "@/lib/ai/discovery-grounding";
import {
  MAX_CHALLENGE_CANDIDATES,
  runQuestGenerationWithRetry,
  type ChallengeRequestResult,
  type CombinedRequestResult,
} from "@/lib/ai/quest-generation-retry";
import { finalizeQuestSections } from "@/lib/ai/quest-generation-finalize";
import { finalizeSkillFit } from "@/lib/ai/skill-fit-finalize";
import { extractCombinedPayload } from "@/lib/ai/quest-generation-parse";
import { createQuestLogger } from "@/lib/quest-trace";
import type { ObjectAnalysis } from "@/lib/ai/schemas";
import type { SkillFitWire } from "@/lib/ai/skill-fit-finalize";
import type { Grade, SkillId } from "@/lib/types";

let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }

  failed += 1;
  console.error(`FAIL  ${name}`);
}

const bottle: ObjectAnalysis = {
  objectName: "protein shake bottle",
  category: "packaged beverage",
  brand: "Premier Protein",
  confidence: 0.92,
  visibleText: ["Premier Protein", "11 FL OZ"],
  visibleMeasurements: [
    { value: 11, unit: "fl oz", label: "printed bottle volume" },
  ],
  countableProperties: [],
  shapeProperties: ["rectangular carton with a screw cap"],
  observableProperties: ["purple plastic cap"],
};

const wallet: ObjectAnalysis = {
  objectName: "wallet",
  category: "everyday object",
  confidence: 0.9,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["rectangular form", "card slots / wallet structure"],
  observableProperties: ["card slots", "billfold"],
  typicalUses: ["carrying money", "storing cards"],
};

const sneaker: ObjectAnalysis = {
  objectName: "sneaker",
  category: "footwear",
  confidence: 0.84,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: ["8 visible eyelets"],
  shapeProperties: ["curved sole"],
  observableProperties: ["worn fabric"],
};

const cup: ObjectAnalysis = {
  objectName: "cup",
  category: "kitchenware",
  confidence: 0.88,
  visibleText: [],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["cylinder"],
  observableProperties: ["open rim"],
};

const basketball: ObjectAnalysis = {
  objectName: "basketball",
  category: "sporting goods",
  confidence: 0.91,
  visibleText: ["Spalding"],
  visibleMeasurements: [],
  countableProperties: [],
  shapeProperties: ["sphere", "spherical"],
  observableProperties: ["orange pebbled surface"],
};

function operand(
  label: string,
  value: number,
  origin: "observed" | "given_in_problem" | "contextual",
  unit: string | null = null,
) {
  return { label, value, unit, origin };
}

function investigation(
  skill: SkillId,
  overrides: Partial<SkillFitWire> = {},
): SkillFitWire {
  return {
    challengeMode: "object_math",
    fitScore: 0.8,
    usableProperties: ["printed bottle volume: 11 fl oz"],
    reason: "The printed volume anchors the selected skill.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: null,
    inspirationContext: null,
    ...overrides,
  };
}

function discovery(overrides: Partial<WireDiscovery> = {}): WireDiscovery {
  return {
    title: "Made to carry a drink",
    text: "Drink bottles are designed to hold liquids securely while being easy to carry. Their shape and labels also help people quickly see how much they contain.",
    category: "design",
    factSupport: "well_known",
    ...overrides,
  };
}

function numberAnswer(value: number, unit: string | null = null) {
  return {
    type: "number" as const,
    value,
    numerator: null,
    denominator: null,
    unit,
  };
}

function arithmeticChallenge(
  skillCode: SkillId,
  question: string,
  connection: string,
  values: ReturnType<typeof operand>[],
  operation: "add" | "subtract" | "multiply",
  answer: number,
  unit: string | null = null,
): WireChallenge {
  return {
    canGenerate: true,
    question,
    skillCode,
    solution: `The calculation is ${answer}${unit ? ` ${unit}` : ""}.`,
    hint1: "Use the numbers in the question.",
    hint2: "Do the operation the skill names.",
    difficulty: 2,
    objectConnection: connection,
    verificationStrategy: "Evaluate the structured computation.",
    valuesUsed: values,
    shapesUsed: [],
    correctAnswer: numberAnswer(answer, unit),
    computation: {
      type: "arithmetic",
      operation,
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: values,
    },
  };
}

function bottleSubtract(overrides: Partial<WireChallenge> = {}): WireChallenge {
  return {
    ...arithmeticChallenge(
      "subtraction",
      "The bottle in your photo contains 11 fluid ounces. If 4 fluid ounces are poured out, how many fluid ounces remain?",
      "Your bottle shows 11 fl oz, so that real measurement becomes the starting amount in the subtraction problem.",
      [
        operand("printed bottle volume", 11, "observed", "fl oz"),
        operand("amount poured out", 4, "given_in_problem", "fl oz"),
      ],
      "subtract",
      7,
      "fl oz",
    ),
    solution: "Start with 11 fluid ounces. Take away 4. 11 − 4 = 7 fl oz.",
    ...overrides,
  };
}

function bottleMultiply(): WireChallenge {
  return arithmeticChallenge(
    "multiplication",
    "The bottle in your photo contains 11 fluid ounces. If you had 4 bottles with the same amount, how many fluid ounces would that be altogether?",
    "Your bottle shows 11 fl oz, so that real measurement is the group we scale up.",
    [
      operand("printed bottle volume", 11, "observed", "fl oz"),
      operand("number of bottles", 4, "given_in_problem"),
    ],
    "multiply",
    44,
    "fl oz",
  );
}

function bottleGeometry(): WireChallenge {
  return {
    canGenerate: true,
    question: "What 3D shape is the protein bottle in your photo most like?",
    skillCode: "geometry",
    solution: "The carton is a rectangular prism.",
    hint1: "Look at the faces and edges.",
    hint2: "A box-like carton is a rectangular prism.",
    difficulty: 2,
    objectConnection:
      "Your bottle is a rectangular carton, so that form is the shape we name.",
    verificationStrategy: "Match the observed form to the catalog label.",
    valuesUsed: [],
    shapesUsed: [
      {
        label: "carton body",
        form: "rectangular prism",
        aspect: "solid",
        origin: "observed",
      },
    ],
    correctAnswer: {
      type: "choice",
      value: null,
      numerator: null,
      denominator: null,
      unit: null,
      label: "rectangular prism",
      set: "solid",
    },
    computation: {
      type: "shape_identify",
      operation: "solid",
      shape: "rectangular prism",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
  };
}

function walletGeometry(): WireChallenge {
  return {
    canGenerate: true,
    question: "Which 2D shape is the front of your wallet most like?",
    skillCode: "geometry",
    solution: "The front of the wallet is a rectangle.",
    hint1: "Look at the outline.",
    hint2: "Count the sides and corners you can see.",
    difficulty: 2,
    objectConnection:
      "Your wallet has a rectangular form, so that face is a rectangle.",
    verificationStrategy: "Match the observed form to the catalog label.",
    valuesUsed: [],
    shapesUsed: [
      {
        label: "wallet face",
        form: "rectangle",
        aspect: "plane",
        origin: "observed",
      },
    ],
    correctAnswer: {
      type: "choice",
      value: null,
      numerator: null,
      denominator: null,
      unit: null,
      label: "rectangle",
      set: "plane",
    },
    computation: {
      type: "shape_identify",
      operation: "plane",
      shape: "rectangle",
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [],
    },
  };
}

function walletMoney(
  skill: "addition" | "subtraction" | "multiplication",
): WireChallenge {
  if (skill === "addition") {
    return arithmeticChallenge(
      "addition",
      "Suppose your wallet has $20 and you add $50. How much money would you have?",
      "Your wallet sent us to money, then imagined amounts to add, not a total printed on the wallet.",
      [
        operand("starting dollars", 20, "given_in_problem", "dollars"),
        operand("added dollars", 50, "given_in_problem", "dollars"),
      ],
      "add",
      70,
      "dollars",
    );
  }

  if (skill === "subtraction") {
    return arithmeticChallenge(
      "subtraction",
      "Imagine your wallet has 20 dollars and you spend 7 dollars. How many dollars remain?",
      "Your wallet sent us to money and spending, not a total printed on the wallet.",
      [
        operand("starting dollars", 20, "given_in_problem", "dollars"),
        operand("amount spent", 7, "given_in_problem", "dollars"),
      ],
      "subtract",
      13,
      "dollars",
    );
  }

  return arithmeticChallenge(
    "multiplication",
    "Imagine your wallet has 6 five-dollar bills. How much money is that?",
    "Your wallet sent us to money, then imagined bills to multiply.",
    [
      operand("number of bills", 6, "given_in_problem"),
      operand("dollars on each bill", 5, "given_in_problem", "dollars"),
    ],
    "multiply",
    30,
    "dollars",
  );
}

function walletMultiStep(): WireChallenge {
  return {
    canGenerate: true,
    question:
      "Let's say your wallet has $50. You add $20. How much more would you need to reach $125?",
    skillCode: "subtraction",
    solution: "50 + 20 = 70, then 125 − 70 = 55 dollars.",
    hint1: "First add the money already imagined in the wallet.",
    hint2: "Then subtract that total from 125.",
    difficulty: 2,
    objectConnection:
      "Your wallet sent us to money, then imagined amounts to add and a savings target.",
    verificationStrategy: "Add 50 and 20, then subtract that total from 125.",
    valuesUsed: [
      operand("starting dollars", 50, "given_in_problem", "dollars"),
      operand("added dollars", 20, "given_in_problem", "dollars"),
      operand("target dollars", 125, "given_in_problem", "dollars"),
    ],
    shapesUsed: [],
    correctAnswer: numberAnswer(55, "dollars"),
    computation: {
      type: "multi_step_arithmetic",
      operation: "subtract",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("starting dollars", 50, "given_in_problem", "dollars"),
        operand("added dollars", 20, "given_in_problem", "dollars"),
        operand("target dollars", 125, "given_in_problem", "dollars"),
      ],
      steps: [
        {
          operation: "add",
          operands: [
            {
              ...operand("starting dollars", 50, "given_in_problem", "dollars"),
              kind: "value",
              step: null,
            },
            {
              ...operand("added dollars", 20, "given_in_problem", "dollars"),
              kind: "value",
              step: null,
            },
          ],
        },
        {
          operation: "subtract",
          operands: [
            {
              ...operand("target dollars", 125, "given_in_problem", "dollars"),
              kind: "value",
              step: null,
            },
            {
              label: "prior total",
              value: 0,
              unit: "dollars",
              origin: "given_in_problem",
              kind: "step_result",
              step: 0,
            },
          ],
        },
      ],
    },
  };
}

function sneakerMultiply(): WireChallenge {
  return arithmeticChallenge(
    "multiplication",
    "The sneaker in your photo has 8 visible eyelets. If 4 sneakers had the same number of eyelets, how many eyelets would that be altogether?",
    "Your sneaker shows 8 eyelets, so that real count is the group we scale up.",
    [
      operand("8 visible eyelets", 8, "observed"),
      operand("number of sneakers", 4, "given_in_problem"),
    ],
    "multiply",
    32,
  );
}

function cupDivision(): WireChallenge {
  return {
    canGenerate: true,
    question:
      "Suppose your cup holds 250 mL for this Sidequest. If you have 1,000 mL of water, how many cups could you fill?",
    skillCode: "division",
    solution: "1,000 ÷ 250 = 4 cups.",
    hint1: "Each cup holds the same imagined amount.",
    hint2: "Divide 1,000 by 250.",
    difficulty: 2,
    objectConnection:
      "Your cup sent us to pouring and sharing a drink, not a number printed on the cup.",
    verificationStrategy: "Divide 1000 by 250.",
    valuesUsed: [
      operand("total water", 1000, "given_in_problem", "mL"),
      operand("cup amount", 250, "given_in_problem", "mL"),
    ],
    shapesUsed: [],
    correctAnswer: numberAnswer(4),
    computation: {
      type: "division",
      operation: "quotient",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: null,
      operands: [
        operand("total water", 1000, "given_in_problem", "mL"),
        operand("cup amount", 250, "given_in_problem", "mL"),
      ],
    },
  };
}

function basketballFraction(): WireChallenge {
  return {
    canGenerate: true,
    question:
      "A basketball game has 4 equal quarters. If 1 quarter is over, what fraction of the game remains?",
    skillCode: "fractions",
    solution: "3 of the 4 quarters remain, so 3/4 of the game is left.",
    hint1: "A whole game is 4 equal parts.",
    hint2: "One part used leaves three parts.",
    difficulty: 2,
    objectConnection:
      "Your basketball sent us to basketball quarters in a game, not a number printed on the ball.",
    verificationStrategy: "Evaluate the remaining parts of the whole.",
    valuesUsed: [
      operand("quarters in a game", 4, "contextual"),
      operand("quarters finished", 1, "given_in_problem"),
    ],
    shapesUsed: [],
    correctAnswer: {
      type: "fraction",
      value: null,
      numerator: 3,
      denominator: 4,
      unit: null,
    },
    computation: {
      type: "fraction_remaining",
      operation: "",
      shape: null,
      numerator: null,
      denominator: null,
      simplify: true,
      operands: [
        operand("quarters in a game", 4, "contextual"),
        operand("quarters finished", 1, "given_in_problem"),
      ],
    },
  };
}

function inspiredInvestigation(
  topic: string,
  reason: string,
  usable: string[],
): SkillFitWire {
  return investigation("addition", {
    challengeMode: "inspired_math",
    usableProperties: usable,
    reason,
    inspirationContext: { topic, reason },
  });
}

function combinedWire(
  skill: SkillId,
  challenge: WireChallenge | null,
  extras: {
    analysis?: ObjectAnalysis;
    investigation?: SkillFitWire;
    discovery?: WireDiscovery | null;
  } = {},
): CombinedRequestResult {
  void extras.analysis;
  return {
    status: "ok",
    wire: {
      investigation:
        extras.investigation ??
        investigation(skill, {
          usableProperties:
            skill === "geometry"
              ? ["rectangular carton with a screw cap"]
              : ["printed bottle volume: 11 fl oz"],
        }),
      discovery: extras.discovery === undefined ? discovery() : extras.discovery,
      challenge,
    },
  };
}

async function runCase({
  analysis,
  skillId,
  grade = 4,
  combined,
  challenges = [],
  collectLogs = false,
}: {
  analysis: ObjectAnalysis;
  skillId: SkillId;
  grade?: Grade;
  combined: CombinedRequestResult | CombinedRequestResult[];
  challenges?: ChallengeRequestResult[];
  collectLogs?: boolean;
}) {
  const combinedQueue = Array.isArray(combined) ? [...combined] : [combined];
  const challengeQueue = [...challenges];
  let combinedCalls = 0;
  let challengeCalls = 0;
  const lines: string[] = [];
  const logger = collectLogs
    ? createQuestLogger("test-trace", (_level, message, payload) => {
        lines.push(`${message} ${JSON.stringify(payload)}`);
      })
    : undefined;

  const result = await runQuestGenerationWithRetry({
    analysis,
    skillId,
    grade,
    requestCombined: async () => {
      combinedCalls += 1;
      return combinedQueue.shift() ?? { status: "api_failure" };
    },
    requestChallenge: async () => {
      challengeCalls += 1;
      return challengeQueue.shift() ?? { status: "api_failure" };
    },
    logger,
  });

  return { result, combinedCalls, challengeCalls, lines };
}

async function main() {
check("the shared budget is two candidates", MAX_CHALLENGE_CANDIDATES === 2);

const happy = await runCase({
  analysis: bottle,
  skillId: "subtraction",
  combined: combinedWire("subtraction", bottleSubtract()),
});

check(
  "valid candidate 1 makes no extra call",
  happy.result.status === "ok" &&
    happy.combinedCalls === 1 &&
    happy.challengeCalls === 0,
);

const schemaRetry = await runCase({
  analysis: bottle,
  skillId: "subtraction",
  collectLogs: true,
  combined: combinedWire(
    "subtraction",
    bottleSubtract({
      computation: {
        type: "arithmetic",
        operation: "subtract",
        shape: null,
        numerator: null,
        denominator: null,
        simplify: null,
        operands: [],
      },
    }),
  ),
  challenges: [{ status: "ok", wire: bottleSubtract() }],
});

check(
  "schema fail → retry → success keeps one extra challenge call",
  schemaRetry.result.status === "ok" &&
    schemaRetry.result.attemptsUsed === 2 &&
    schemaRetry.combinedCalls === 1 &&
    schemaRetry.challengeCalls === 1,
);

check(
  "schema fail logs attempt 1 then runs candidate 2",
  schemaRetry.lines.some((line) => line.includes('"attempt":1')) &&
    schemaRetry.lines.some((line) => line.includes('"attempt":2')) &&
    schemaRetry.lines.some((line) => line.includes("candidate_1_schema")) &&
    schemaRetry.lines.some((line) => line.includes("generation_candidate_2")),
);

const groundingRetry = await runCase({
  analysis: bottle,
  skillId: "subtraction",
  collectLogs: true,
  combined: combinedWire(
    "subtraction",
    bottleSubtract({
      valuesUsed: [
        operand("printed bottle volume", 12, "observed", "fl oz"),
        operand("amount poured out", 4, "given_in_problem", "fl oz"),
      ],
      computation: {
        type: "arithmetic",
        operation: "subtract",
        shape: null,
        numerator: null,
        denominator: null,
        simplify: null,
        operands: [
          operand("printed bottle volume", 12, "observed", "fl oz"),
          operand("amount poured out", 4, "given_in_problem", "fl oz"),
        ],
      },
      correctAnswer: numberAnswer(8, "fl oz"),
    }),
  ),
  challenges: [{ status: "ok", wire: bottleSubtract() }],
});

check(
  "grounding fail → retry → success",
  groundingRetry.result.status === "ok" &&
    groundingRetry.combinedCalls === 1 &&
    groundingRetry.challengeCalls === 1 &&
    groundingRetry.lines.some((line) => line.includes("candidate_1_grounding")) &&
    groundingRetry.lines.some((line) => line.includes('"attempt":2')),
);

const verifyRetry = await runCase({
  analysis: bottle,
  skillId: "subtraction",
  collectLogs: true,
  combined: combinedWire(
    "subtraction",
    bottleSubtract({
      correctAnswer: numberAnswer(8, "fl oz"),
      solution: "11 − 4 = 8 fluid ounces.",
    }),
  ),
  challenges: [{ status: "ok", wire: bottleSubtract() }],
});

check(
  "verification fail → retry → success",
  verifyRetry.result.status === "ok" &&
    verifyRetry.combinedCalls === 1 &&
    verifyRetry.challengeCalls === 1 &&
    verifyRetry.lines.some((line) =>
      line.includes("candidate_1_verification"),
    ) &&
    verifyRetry.lines.some((line) => line.includes('"attempt":2')),
);

const apiRetry = await runCase({
  analysis: bottle,
  skillId: "subtraction",
  combined: [
    { status: "api_failure" },
    combinedWire("subtraction", bottleSubtract()),
  ],
});

check(
  "candidate 1 API fail retries combined generation, not challenge-only",
  apiRetry.result.status === "ok" &&
    apiRetry.combinedCalls === 2 &&
    apiRetry.challengeCalls === 0,
);

const bothFail = await runCase({
  analysis: bottle,
  skillId: "subtraction",
  collectLogs: true,
  combined: combinedWire(
    "subtraction",
    bottleSubtract({
      computation: {
        type: "arithmetic",
        operation: "subtract",
        shape: null,
        numerator: null,
        denominator: null,
        simplify: null,
        operands: [],
      },
    }),
  ),
  challenges: [
    {
      status: "ok",
      wire: bottleSubtract({
        computation: {
          type: "arithmetic",
          operation: "subtract",
          shape: null,
          numerator: null,
          denominator: null,
          simplify: null,
          operands: [],
        },
      }),
    },
  ],
});

check(
  "both candidates fail as generation failure, not an object detour",
  bothFail.result.status === "failed" &&
    bothFail.result.failure.reason === "generation_failure" &&
    bothFail.result.failure.recommendedNextAction === "retry" &&
    bothFail.combinedCalls === 1 &&
    bothFail.challengeCalls === 1 &&
    !bothFail.result.failure.studentMessage.toLowerCase().includes(
      "find another object",
    ),
);

check(
  "both failures emit QUEST_GENERATION_FAILED with attempt 1 and 2",
  bothFail.lines.some((line) => line.includes("QUEST_GENERATION_FAILED")) &&
    bothFail.lines.some((line) => line.includes('"attempt":1')) &&
    bothFail.lines.some((line) => line.includes('"attempt":2')) &&
    bothFail.result.status === "failed" &&
    bothFail.result.diagnostic?.candidate1FailureCode !== undefined &&
    bothFail.result.diagnostic?.candidate2FailureCode !== undefined,
);

const missingChallenge = finalizeQuestSections(
  {
    investigation: investigation("subtraction"),
    discovery: discovery(),
    challenge: null,
  },
  { analysis: bottle, skillId: "subtraction" },
);

check(
  "a valid path and Discovery are retained when the challenge subsection is missing",
  missingChallenge.status === "ready" &&
    missingChallenge.challengeWire === null &&
    missingChallenge.discovery.title.length > 0 &&
    missingChallenge.fit.challengeMode === "object_math",
);

const retainedRetry = await runCase({
  analysis: bottle,
  skillId: "subtraction",
  combined: combinedWire("subtraction", null),
  challenges: [{ status: "ok", wire: bottleSubtract() }],
});

check(
  "missing challenge subsection uses challenge-only retry",
  retainedRetry.result.status === "ok" &&
    retainedRetry.combinedCalls === 1 &&
    retainedRetry.challengeCalls === 1,
);

const cases: Array<{
  name: string;
  analysis: ObjectAnalysis;
  skillId: SkillId;
  investigation: SkillFitWire;
  discovery: WireDiscovery;
  challenge: WireChallenge;
}> = [
  {
    name: "protein bottle + multiplication",
    analysis: bottle,
    skillId: "multiplication",
    investigation: investigation("multiplication"),
    discovery: discovery(),
    challenge: bottleMultiply(),
  },
  {
    name: "protein bottle + subtraction",
    analysis: bottle,
    skillId: "subtraction",
    investigation: investigation("subtraction"),
    discovery: discovery(),
    challenge: bottleSubtract(),
  },
  {
    name: "protein bottle + geometry",
    analysis: bottle,
    skillId: "geometry",
    investigation: investigation("geometry", {
      usableProperties: ["rectangular carton with a screw cap"],
      reason: "Visible carton form supports geometry.",
    }),
    discovery: discovery(),
    challenge: bottleGeometry(),
  },
  {
    name: "wallet + addition",
    analysis: wallet,
    skillId: "addition",
    investigation: inspiredInvestigation(
      "money, dollars, and budgeting",
      "A wallet holds money.",
      ["rectangular form"],
    ),
    discovery: discovery({
      title: "Made to carry cards",
      text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
    }),
    challenge: walletMoney("addition"),
  },
  {
    name: "wallet + addition recovers investigation_math",
    analysis: wallet,
    skillId: "addition",
    investigation: investigation("addition", {
      challengeMode: "investigation_math",
      usableProperties: [],
      reason: "No printed amount is visible.",
      evidenceRequest: {
        type: "student_count",
        prompt: "Count the cards in your wallet.",
        targetProperty: "visible count",
        reason: "A count lets us add.",
      },
      inspirationContext: null,
    }),
    discovery: discovery({
      title: "Made to carry cards",
      text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
    }),
    challenge: walletMoney("addition"),
  },
  {
    name: "wallet + multiplication",
    analysis: wallet,
    skillId: "multiplication",
    investigation: inspiredInvestigation(
      "money, dollars, and budgeting",
      "A wallet holds money.",
      ["rectangular form"],
    ),
    discovery: discovery({
      title: "Made to carry cards",
      text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
    }),
    challenge: walletMoney("multiplication"),
  },
  {
    name: "wallet + subtraction",
    analysis: wallet,
    skillId: "subtraction",
    investigation: inspiredInvestigation(
      "money, dollars, and budgeting",
      "A wallet holds money.",
      ["rectangular form"],
    ),
    discovery: discovery({
      title: "Made to carry cards",
      text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
    }),
    challenge: walletMoney("subtraction"),
  },
  {
    name: "wallet multi-step subtraction",
    analysis: wallet,
    skillId: "subtraction",
    investigation: inspiredInvestigation(
      "money, dollars, and budgeting",
      "A wallet holds money.",
      ["rectangular form"],
    ),
    discovery: discovery({
      title: "Made to carry cards",
      text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
    }),
    challenge: walletMultiStep(),
  },
  {
    name: "wallet + geometry",
    analysis: wallet,
    skillId: "geometry",
    investigation: investigation("geometry", {
      usableProperties: ["rectangular form"],
      reason: "Visible form can anchor geometry.",
    }),
    discovery: discovery({
      title: "Made to carry cards",
      text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
    }),
    challenge: walletGeometry(),
  },
  {
    name: "sneaker + multiplication",
    analysis: sneaker,
    skillId: "multiplication",
    investigation: investigation("multiplication", {
      usableProperties: ["8 visible eyelets"],
      reason: "The visible eyelets can be scaled.",
    }),
    discovery: discovery({
      title: "Made to hold a foot",
      text: "Sneakers are built with openings for laces so they can be tightened. Those openings are easy to count.",
    }),
    challenge: sneakerMultiply(),
  },
  {
    name: "cup + division",
    analysis: cup,
    skillId: "division",
    investigation: inspiredInvestigation(
      "drinking, pouring, and sharing",
      "A cup holds a drink that can be shared.",
      ["cylinder"],
    ),
    discovery: discovery({
      title: "Made to hold a drink",
      text: "A cup is an open vessel for a drink. That everyday use is pouring and sharing.",
    }),
    challenge: cupDivision(),
  },
  {
    name: "basketball + fractions",
    analysis: basketball,
    skillId: "fractions",
    investigation: inspiredInvestigation(
      "scoring, teams, and shots",
      "Basketball games are split into equal quarters.",
      ["sphere"],
    ),
    discovery: discovery({
      title: "Made to bounce",
      text: "A basketball is a sphere designed to bounce and be passed. Games are split into equal parts of play.",
    }),
    challenge: basketballFraction(),
  },
];

for (const example of cases) {
  const ran = await runCase({
    analysis: example.analysis,
    skillId: example.skillId,
    combined: {
      status: "ok",
      wire: {
        investigation: example.investigation,
        discovery: example.discovery,
        challenge: example.challenge,
      },
    },
  });

  check(
    `${example.name} succeeds on candidate 1 with no extra call`,
    ran.result.status === "ok" &&
      ran.combinedCalls === 1 &&
      ran.challengeCalls === 0,
  );

  if (example.name === "wallet + addition recovers investigation_math") {
    check(
      "wallet + addition investigation wire becomes inspired_math before challenge finalization",
      ran.result.status === "ok" &&
        ran.result.fit.challengeMode === "inspired_math",
    );
  }
}

const objectMathWalletAddition = finalizeSkillFit(
  {
    challengeMode: "object_math",
    fitScore: 0.8,
    usableProperties: ["rectangular form"],
    reason: "The wallet looks rectangular.",
    suggestedObjectCharacteristics: [],
    alternativeSkillCodes: [],
    evidenceRequest: null,
    inspirationContext: null,
  },
  wallet,
  "addition",
);

check(
  "numberless wallet + addition does not stay object_math just because it is rectangular",
  objectMathWalletAddition.status === "ok" &&
    objectMathWalletAddition.fit.challengeMode === "inspired_math",
);

check(
  "numberless wallet + addition does not require investigation",
  objectMathWalletAddition.status === "ok" &&
    objectMathWalletAddition.fit.challengeMode === "inspired_math",
);

check(
  "numberless wallet + addition does not become poor_fit",
  objectMathWalletAddition.status !== "poorFit" &&
    objectMathWalletAddition.status !== "failed",
);

const parsedBrokenChallenge = {
  status: "ok" as const,
  wire: {
    investigation: inspiredInvestigation(
      "money, dollars, and budgeting",
      "A wallet holds money.",
      ["rectangular form"],
    ),
    discovery: discovery({
      title: "Made to carry cards",
      text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
    }),
    challenge: null,
  },
  challengeIssues: [
    { path: "computation", code: "invalid_union", expected: "union" },
  ],
};

check(
  "combined parse keeps a valid path when only ChallengeSchema fails",
  parsedBrokenChallenge.wire.investigation.challengeMode === "inspired_math" &&
    parsedBrokenChallenge.wire.discovery !== null &&
    parsedBrokenChallenge.wire.challenge === null &&
    parsedBrokenChallenge.challengeIssues[0]?.path === "computation",
);

const retainedFromParse = await runCase({
  analysis: wallet,
  skillId: "addition",
  collectLogs: true,
  combined: parsedBrokenChallenge,
  challenges: [{ status: "ok", wire: walletMoney("addition") }],
});

check(
  "candidate 1 schema fail from combined parse still runs candidate 2 challenge-only",
  retainedFromParse.result.status === "ok" &&
    retainedFromParse.combinedCalls === 1 &&
    retainedFromParse.challengeCalls === 1 &&
    retainedFromParse.result.fit.challengeMode === "inspired_math" &&
    retainedFromParse.lines.some((line) => line.includes('"attempt":1')) &&
    retainedFromParse.lines.some((line) => line.includes('"attempt":2')),
);

const recoveredPayload = extractCombinedPayload({
  error: {
    output_text: JSON.stringify({
      investigation: { challengeMode: "inspired_math" },
      discovery: { title: "Made to carry cards" },
      challenge: { computation: "bad" },
    }),
  },
});

check(
  "combined payload recovery finds investigation without logging challenge text",
  recoveredPayload?.investigation !== undefined &&
    recoveredPayload.challenge !== undefined,
);

const walletTraceCandidate1 = await runCase({
  analysis: wallet,
  skillId: "addition",
  collectLogs: true,
  combined: {
    status: "ok",
    wire: {
      investigation: inspiredInvestigation(
        "money, dollars, and budgeting",
        "A wallet holds money.",
        ["rectangular form"],
      ),
      discovery: discovery({
        title: "Made to carry cards",
        text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
      }),
      challenge: {
        ...walletMoney("addition"),
        solution: "Add the two amounts together.",
      },
    },
  },
});

check(
  "wallet + addition omitted solution is repaired on candidate 1",
  walletTraceCandidate1.result.status === "ok" &&
    walletTraceCandidate1.combinedCalls === 1 &&
    walletTraceCandidate1.challengeCalls === 0 &&
    walletTraceCandidate1.result.challenge.solution ===
      "Add $20 and $50. $20 + $50 = $70.",
);

check(
  "wallet + addition solution repair logs without a candidate 2 call",
  walletTraceCandidate1.challengeCalls === 0 &&
    walletTraceCandidate1.lines.some((line) =>
      line.includes("candidate_1_solution_repair"),
    ) &&
    walletTraceCandidate1.lines.some((line) =>
      line.includes('"repair":"deterministic_solution"'),
    ) &&
    !walletTraceCandidate1.lines.some((line) =>
      line.includes("generation_candidate_2"),
    ),
);

const walletUnframed = await runCase({
  analysis: wallet,
  skillId: "addition",
  collectLogs: true,
  combined: {
    status: "ok",
    wire: {
      investigation: inspiredInvestigation(
        "money, dollars, and budgeting",
        "A wallet holds money.",
        ["rectangular form"],
      ),
      discovery: discovery({
        title: "Made to carry cards",
        text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
      }),
      challenge: {
        ...walletMoney("addition"),
        question:
          "Your wallet has $20 and you add $50. How much money do you have?",
      },
    },
  },
});

check(
  "wallet unframed given_in_problem question is prefixed on candidate 1",
  walletUnframed.result.status === "ok" &&
    walletUnframed.combinedCalls === 1 &&
    walletUnframed.challengeCalls === 0 &&
    walletUnframed.result.challenge.question ===
      "Suppose your wallet has $20 and you add $50. How much money do you have?",
);

check(
  "wallet framing repair logs without a candidate 2 call",
  walletUnframed.challengeCalls === 0 &&
    walletUnframed.lines.some((line) =>
      line.includes("candidate_1_framing_repair"),
    ) &&
    walletUnframed.lines.some((line) =>
      line.includes('"repair":"hypothetical_prefix"'),
    ) &&
    !walletUnframed.lines.some((line) => line.includes("generation_candidate_2")),
);

const beverageCan: ObjectAnalysis = {
  objectName: "beverage can",
  category: "packaged beverage",
  confidence: 0.94,
  visibleText: ["222 mL"],
  visibleMeasurements: [
    { value: 222, unit: "mL", label: "printed can volume" },
  ],
  countableProperties: [],
  shapeProperties: ["cylinder"],
  observableProperties: ["pull tab"],
  typicalUses: [
    "drinking",
    "holding a flavored beverage",
    "single-serve beverage container",
  ],
};

function canAddition(): WireChallenge {
  return arithmeticChallenge(
    "addition",
    "222 mL plus another 100 mL equals how much?",
    "Your can shows 222 mL, so that printed volume starts the addition.",
    [
      operand("printed can volume", 222, "observed", "mL"),
      operand("added volume", 100, "given_in_problem", "mL"),
    ],
    "add",
    322,
    "mL",
  );
}

const canTrace = await runCase({
  analysis: beverageCan,
  skillId: "addition",
  collectLogs: true,
  combined: combinedWire("addition", canAddition(), {
    investigation: investigation("addition", {
      usableProperties: ["printed can volume: 222 mL"],
      reason: "The printed volume anchors addition.",
    }),
  }),
});

check(
  "beverage can + Grade 4 addition repairs missing object reference on candidate 1",
  canTrace.result.status === "ok" &&
    canTrace.combinedCalls === 1 &&
    canTrace.challengeCalls === 0 &&
    canTrace.result.status === "ok" &&
    canTrace.result.challenge.question.toLowerCase().includes("can"),
);

check(
  "can object-reference repair logs without a candidate 2 call",
  canTrace.challengeCalls === 0 &&
    canTrace.lines.some((line) =>
      line.includes("candidate_1_object_reference_repair"),
    ) &&
    canTrace.lines.some((line) => line.includes('"repair":"object_reference"')) &&
    !canTrace.lines.some((line) => line.includes("generation_candidate_2")) &&
    !canTrace.lines.some((line) => line.includes("222 mL plus another")),
);

const walletValuesUsedRepair = await runCase({
  analysis: wallet,
  skillId: "subtraction",
  collectLogs: true,
  combined: {
    status: "ok",
    wire: {
      investigation: inspiredInvestigation(
        "money, spending, and saving",
        "A wallet holds money.",
        ["rectangular form"],
      ),
      discovery: discovery({
        title: "Made to carry cards",
        text: "A wallet is shaped to hold cards and bills in a flat pocket you can close. That form is what makes it easy to carry.",
      }),
      challenge: {
        ...walletMultiStep(),
        valuesUsed: [
          operand("starting dollars", 50, "given_in_problem", "dollars"),
          operand("added dollars", 20, "given_in_problem", "dollars"),
          operand("running total", 70, "given_in_problem", "dollars"),
          operand("final amount", 55, "given_in_problem", "dollars"),
        ],
      },
    },
  },
});

check(
  "multi-step valuesUsed repair logs without a candidate 2 call",
  walletValuesUsedRepair.result.status === "ok" &&
    walletValuesUsedRepair.challengeCalls === 0 &&
    walletValuesUsedRepair.lines.some((line) =>
      line.includes("candidate_1_values_used_repair"),
    ) &&
    walletValuesUsedRepair.lines.some((line) =>
      line.includes('"repair":"values_used"'),
    ) &&
    !walletValuesUsedRepair.lines.some((line) =>
      line.includes("generation_candidate_2"),
    ),
);

if (failed > 0) {
  console.error(`\n${failed} generation-reliability checks failed`);
  process.exit(1);
}

console.log("\nall generation-reliability checks passed");
}

void main();
