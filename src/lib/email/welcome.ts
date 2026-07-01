import { readFile } from "node:fs/promises";
import path from "node:path";
import { GmailDraftConnector } from "@/lib/connectors/gmail";
import { config } from "@/lib/core/config";
import { getRepo } from "@/lib/db";
import { emit } from "@/lib/pipeline";

const WELCOME_SENT_KEY = (agentId: string) => `welcome:sent:${agentId}`;

const FALLBACK_TEMPLATE = `Hi {{firstName}},

Welcome to Forleads.

You are now inside the live map-first workspace: scout an address, review the evidence cards, and approve only the drafts you would actually stand behind with a client. The product is built to keep the research, writing, and follow-up visible in one place.

Start here:
1. Search one real address you already know.
2. Add one field note in your own voice.
3. Approve one email draft and confirm it lands in Gmail.

Nothing sends automatically. Every outward step stays human-approved, grounded, and reversible.

Reply to this draft with the first thing that feels slow or unclear so we can tighten the workflow around real work.

Welcome in,
Forleads`;

async function loadTemplate(): Promise<string> {
  const file = path.join(process.cwd(), ".agent", "drafts", "welcome-email-v1.md");
  try {
    return (await readFile(file, "utf8")).trim();
  } catch {
    return FALLBACK_TEMPLATE;
  }
}

function renderTemplate(template: string, firstName: string): string {
  return template.replaceAll("{{firstName}}", firstName).trim();
}

export async function sendWelcomeEmail(input: {
  agentId: string;
  email: string;
  name: string;
  accessToken?: string;
}): Promise<void> {
  const repo = await getRepo();
  const sentKey = WELCOME_SENT_KEY(input.agentId);
  const prior = await repo.getEventByIdempotencyKey(input.agentId, sentKey);
  if (prior) return;

  if (!config.welcomeEmailEnabled) {
    await emit(
      input.agentId,
      "welcome.skipped",
      { reason: "disabled" },
      "welcome",
      undefined,
      `welcome:skipped:${input.agentId}:disabled`,
    );
    return;
  }

  if (!input.accessToken) {
    await emit(
      input.agentId,
      "welcome.skipped",
      { reason: "missing_access_token" },
      "welcome",
      undefined,
      `welcome:skipped:${input.agentId}:missing_access_token`,
    );
    return;
  }

  const connector = new GmailDraftConnector(input.accessToken, false);
  const firstName = input.name.trim().split(/\s+/)[0] ?? "there";
  const body = renderTemplate(await loadTemplate(), firstName);
  const result = await connector.createDraft(
    {
      to: input.email,
      subject: "Welcome to Forleads",
      body,
      from: input.email,
    },
    {
      agentId: input.agentId,
      idempotencyKey: sentKey,
    },
  );

  if (!result.ok) {
    await emit(
      input.agentId,
      "welcome.skipped",
      { reason: result.error ?? "draft_failed" },
      "welcome",
      undefined,
      `welcome:skipped:${input.agentId}:${result.error ?? "draft_failed"}`,
    );
    return;
  }

  await emit(
    input.agentId,
    "welcome.sent",
    {
      provider: result.provider,
      externalId: result.externalId,
      url: result.url,
    },
    "welcome",
    undefined,
    sentKey,
  );
}
