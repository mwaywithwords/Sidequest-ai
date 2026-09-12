import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlowSteps } from "@/components/layout/flow-steps";
import { AnswerForm } from "@/components/quest/answer-form";
import { QuestCard } from "@/components/quest/quest-card";
import { getMockQuest } from "@/lib/mock-quests";
import { getSkill } from "@/lib/skills";
import { parseGrade } from "@/lib/types";

export async function generateMetadata(
  props: PageProps<"/quest/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const quest = getMockQuest(id);
  return { title: quest ? `${quest.objectName} sidequest` : "Sidequest" };
}

export default async function QuestPage(props: PageProps<"/quest/[id]">) {
  const { id } = await props.params;
  const quest = getMockQuest(id);

  if (!quest) {
    notFound();
  }

  // Honour the grade the student chose so the mock stays internally consistent.
  const params = await props.searchParams;
  const grade = parseGrade(params.grade) ?? quest.grade;
  const skill = getSkill(quest.skillId);

  return (
    <div className="flex flex-col gap-8">
      <FlowSteps current="quest" />
      <QuestCard quest={quest} grade={grade} />
      <AnswerForm challenge={quest.challenge} skill={skill} grade={grade} />
    </div>
  );
}
