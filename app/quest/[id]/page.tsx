import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FlowSteps } from "@/components/layout/flow-steps";
import { AnswerForm } from "@/components/quest/answer-form";
import { QuestCard } from "@/components/quest/quest-card";
import { QuestExperience } from "@/components/quest/quest-experience";
import { QuestNotReady } from "@/components/quest/quest-not-ready";
import { loadQuestExperience } from "@/lib/quest-experience";
import { getMockQuest } from "@/lib/mock-quests";
import { isUuid } from "@/lib/profile";
import { getSkill } from "@/lib/skills";
import { parseGrade, parseSkillId } from "@/lib/types";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata(
  props: PageProps<"/quest/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;

  if (!isUuid(id)) {
    const quest = getMockQuest(id);
    return { title: quest ? `${quest.objectName} sidequest` : "Sidequest" };
  }

  const experience = await loadQuestExperience(id);
  if (experience.kind === "ready") {
    return { title: `${experience.quest.objectName} sidequest` };
  }

  return { title: "Sidequest" };
}

export default async function QuestPage(props: PageProps<"/quest/[id]">) {
  const { id } = await props.params;
  const params = await props.searchParams;

  // Older scan successes landed on a mock slug with the real id in ?quest=.
  // Send those to the trusted route so a leftover tab does not show the mock.
  if (!isUuid(id)) {
    const legacyId = firstParam(params.quest);
    if (legacyId && isUuid(legacyId)) {
      redirect(`/quest/${legacyId}`);
    }

    const quest = getMockQuest(id);
    if (!quest) notFound();

    const grade = parseGrade(params.grade) ?? quest.grade;
    const skill = getSkill(parseSkillId(params.skill) ?? quest.skillId);

    return (
      <div className="flex flex-col gap-8">
        <FlowSteps current="quest" />
        <QuestCard quest={quest} grade={grade} />
        <AnswerForm challenge={quest.challenge} skill={skill} grade={grade} />
      </div>
    );
  }

  const experience = await loadQuestExperience(id);

  if (experience.kind === "missing") {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <FlowSteps current="quest" />
      {experience.kind === "ready" ? (
        <QuestExperience quest={experience.quest} />
      ) : (
        <QuestNotReady state={experience} />
      )}
    </div>
  );
}
