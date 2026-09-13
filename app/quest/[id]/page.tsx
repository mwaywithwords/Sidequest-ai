import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { QuestExperience } from "@/components/quest/quest-experience";
import { QuestNotReady } from "@/components/quest/quest-not-ready";
import { loadQuestExperience } from "@/lib/quest-experience";
import { isUuid } from "@/lib/profile";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata(
  props: PageProps<"/quest/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;

  if (!isUuid(id)) {
    return { title: "Sidequest" };
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
  // Send those to the trusted route so a leftover tab does not show a sample.
  if (!isUuid(id)) {
    const legacyId = firstParam(params.quest);
    if (legacyId && isUuid(legacyId)) {
      redirect(`/quest/${legacyId}`);
    }

    notFound();
  }

  const experience = await loadQuestExperience(id);

  if (experience.kind === "missing") {
    notFound();
  }

  return (
    <div className="game-page game-page-tight">
      {experience.kind === "ready" ? (
        <QuestExperience quest={experience.quest} />
      ) : (
        <QuestNotReady state={experience} />
      )}
    </div>
  );
}
