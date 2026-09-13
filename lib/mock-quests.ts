import type { Quest } from "./types";

/**
 * Hand-written stand-ins for what the AI pipeline will return. Each one obeys
 * the product rule that matters most: the photographed object genuinely carries
 * the numbers in the challenge, so the problem collapses without the object.
 */
export const MOCK_QUESTS: Quest[] = [
  {
    id: "soda-can",
    grade: 5,
    skillId: "division",
    objectName: "Soda can",
    objectCaption: "A 12 fl oz can photographed on a kitchen counter",
    discovery:
      "The 12 ounce can has barely changed since 1960. That size stuck around because it was the largest can an average hand could hold comfortably while drinking.",
    connection:
      "Your can tells us exactly how much it holds: 12 fluid ounces. That printed number is all we need to start dividing.",
    observed: [
      { label: "Volume", value: "12 fl oz", source: "printed label" },
      { label: "Shape", value: "cylinder", source: "measured shape" },
    ],
    challenge: {
      prompt:
        "A one-gallon drink dispenser holds 128 fluid ounces. If each can holds 12 fluid ounces, how many whole cans would you need to completely fill the dispenser?",
      answerUnit: "cans",
      hint: "Try dividing 128 by 12. You will have some left over — think about whether a partly filled dispenser counts as full.",
      solutionSteps: [
        "128 ÷ 12 = 10 remainder 8",
        "10 cans fill 120 fl oz, leaving 8 fl oz still empty",
        "So you need an 11th can to finish filling it",
      ],
      expectedAnswer: 11,
    },
  },
  {
    id: "pizza-box",
    grade: 4,
    skillId: "fractions",
    objectName: "Pizza",
    objectCaption: "An open box with a whole pizza cut into equal slices",
    discovery:
      "Pizzas are cut into equal wedges because every slice needs the same amount of crust to hold on to. The cuts all pass through the centre, which is what makes the slices fair.",
    connection:
      "I counted 8 equal slices in your photo. When a whole thing is split into 8 fair parts, each part is one eighth.",
    observed: [
      { label: "Equal slices", value: "8", source: "counted" },
      { label: "Cut pattern", value: "through centre", source: "measured shape" },
    ],
    challenge: {
      prompt:
        "Your pizza is cut into 8 equal slices. You and your family eat 3 of them. How many eighths of the pizza are still in the box?",
      answerUnit: "eighths",
      hint: "Start with all 8 eighths. Take away the eighths that were eaten.",
      solutionSteps: [
        "The whole pizza is 8 eighths",
        "3 slices eaten means 3 eighths are gone",
        "8 eighths − 3 eighths = 5 eighths",
      ],
      expectedAnswer: 5,
    },
  },
  {
    id: "egg-carton",
    grade: 3,
    skillId: "multiplication",
    objectName: "Egg carton",
    objectCaption: "An open carton showing two neat rows of cups",
    discovery:
      "Egg cartons are moulded into rows because the bumps between cups keep each egg from touching its neighbour. That grid is what stops them cracking in a bag.",
    connection:
      "Your carton is a rectangle of cups: 2 rows with the same number in each row. Equal rows are exactly what multiplication is for.",
    observed: [
      { label: "Rows", value: "2", source: "counted" },
      { label: "Cups per row", value: "6", source: "counted" },
    ],
    challenge: {
      prompt:
        "Your carton has 2 rows with 6 cups in each row. If every cup is filled, how many eggs does the carton hold?",
      answerUnit: "eggs",
      hint: "Two equal rows of 6. You can add 6 + 6, or multiply 2 × 6.",
      solutionSteps: ["2 rows × 6 cups in each row", "2 × 6 = 12"],
      expectedAnswer: 12,
    },
  },
  {
    id: "window-pane",
    grade: 3,
    skillId: "geometry",
    objectName: "Window",
    objectCaption: "A window divided into matching rectangular panes",
    discovery:
      "Windows are split into panes because a small piece of glass bends less than a big one under wind. Smaller rectangles make the whole window stronger.",
    connection:
      "Each pane in your photo is a rectangle, and rectangles have two pairs of matching sides. That is enough to measure the distance all the way around one.",
    observed: [
      { label: "Pane shape", value: "rectangle", source: "measured shape" },
      { label: "Width", value: "12 in", source: "measured shape" },
      { label: "Height", value: "18 in", source: "measured shape" },
    ],
    challenge: {
      prompt:
        "One pane of your window is 12 inches wide and 18 inches tall. If you traced all the way around the edge of that pane with your finger, how many inches would you travel?",
      answerUnit: "inches",
      hint: "A rectangle has two widths and two heights. Add all four sides.",
      solutionSteps: [
        "Two widths: 12 + 12 = 24",
        "Two heights: 18 + 18 = 36",
        "24 + 36 = 60 inches around",
      ],
      expectedAnswer: 60,
    },
  },
  {
    id: "cereal-box",
    grade: 4,
    skillId: "measurement",
    objectName: "Cereal box",
    objectCaption: "The side panel of a cereal box showing its net weight",
    discovery:
      "Cereal boxes are sold by weight, not by how full they look. Boxes settle during shipping, which is why the panel promises ounces instead of a fill line.",
    connection:
      "Your box states its net weight: 18 ounces. Once we have a real weight, we can compare it to other units of weight.",
    observed: [
      { label: "Net weight", value: "18 oz", source: "printed label" },
    ],
    challenge: {
      prompt:
        "Your box holds 18 ounces of cereal. There are 16 ounces in one pound. How many ounces short of 2 full pounds is your box?",
      answerUnit: "ounces",
      hint: "First work out how many ounces are in 2 pounds, then compare that to 18.",
      solutionSteps: [
        "2 pounds = 2 × 16 = 32 ounces",
        "32 − 18 = 14",
        "The box is 14 ounces short of 2 pounds",
      ],
      expectedAnswer: 14,
    },
  },
  {
    id: "bookshelf",
    grade: 3,
    skillId: "addition",
    objectName: "Bookshelf",
    objectCaption: "Two shelves of books photographed straight on",
    discovery:
      "Books stand upright on shelves because a spine is the strongest part of the binding. Lying them flat in tall stacks slowly crushes the pages at the bottom.",
    connection:
      "I counted the books on each shelf in your photo. Two separate groups of the same kind of thing is the setup for addition.",
    observed: [
      { label: "Top shelf", value: "14 books", source: "counted" },
      { label: "Bottom shelf", value: "9 books", source: "counted" },
    ],
    challenge: {
      prompt:
        "Your top shelf holds 14 books and the bottom shelf holds 9. How many books are on the bookshelf altogether?",
      answerUnit: "books",
      hint: "Start at 14 and count on 9 more.",
      solutionSteps: ["14 + 9", "14 + 6 = 20, then 3 more", "= 23 books"],
      expectedAnswer: 23,
    },
  },
  {
    id: "water-bottle",
    grade: 4,
    skillId: "subtraction",
    objectName: "Water bottle",
    objectCaption: "A part-empty bottle with its capacity printed near the base",
    discovery:
      "Most bottles print their capacity near the base because that is the last part of the label to wear off in a bag or a dishwasher.",
    connection:
      "Your bottle says it holds 500 millilitres when it is full, and the water sits well below the top. A known starting amount is what makes subtraction possible.",
    observed: [
      { label: "Full capacity", value: "500 mL", source: "printed label" },
      { label: "Amount drunk", value: "180 mL", source: "measured shape" },
    ],
    challenge: {
      prompt:
        "Your bottle holds 500 millilitres when full. You have already drunk 180 millilitres. How many millilitres of water are left in the bottle?",
      answerUnit: "mL",
      hint: "Take the amount you drank away from the amount the full bottle holds.",
      solutionSteps: ["500 − 180", "500 − 200 = 300, then add back 20", "= 320 mL"],
      expectedAnswer: 320,
    },
  },
];

export const FEATURED_QUEST = MOCK_QUESTS[0];
