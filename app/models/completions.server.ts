import { prisma } from "~/db.server";
import type { User } from "@prisma/client";

export async function getMostRecentCompletions(userId: User["id"]) {
  return prisma.completion.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export function addCompletion({
  userId,
  aiCompletion,
  prompt,
  tokens,
}: {
  userId: User["id"];
  aiCompletion: string;
  prompt: string;
  tokens: Number;
}) {
  return prisma.completion.create({
    data: {
      prompt,
      answer: aiCompletion,
      tokens: Number(tokens),
      user: {
        connect: { id: String(userId) },
      },
    },
  });
}
