import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import * as database from "@/db";

const expectedTables = [
  "aiProviderCredentials",
  "aiModels",
  "aiModelRateVersions",
  "aiConversations",
  "aiMessages",
  "aiRuns",
  "aiProposals",
  "aiQuotaAccounts",
  "aiUsageLedger",
  "aiAuditPayloads",
] as const;

describe("AI database schema", () => {
  it("exports the complete AI persistence model", () => {
    expect(Object.keys(database)).toEqual(
      expect.arrayContaining([...expectedTables]),
    );
  });

  it("binds conversations to an owned resume and orders messages", () => {
    const conversationConfig = getTableConfig(database.aiConversations);
    const messageConfig = getTableConfig(database.aiMessages);

    const resumeForeignKey = conversationConfig.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === database.resumes,
    );

    expect(
      resumeForeignKey?.reference().columns.map((column) => column.name),
    ).toEqual(["user_id", "resume_id"]);
    expect(messageConfig.indexes.map((index) => index.config.name)).toContain(
      "ai_messages_conversation_sequence_unique",
    );
  });

  it("stores run settlement, proposal validation, and encrypted evidence fields", () => {
    expect(Object.keys(getTableColumns(database.aiRuns))).toEqual(
      expect.arrayContaining([
        "resumeVersion",
        "contextHash",
        "promptVersion",
        "reservedPoints",
        "finalPoints",
        "leaseExpiresAt",
      ]),
    );
    expect(Object.keys(getTableColumns(database.aiProposals))).toEqual(
      expect.arrayContaining([
        "baseResumeVersion",
        "targetHashes",
        "proposal",
        "appliedChangeIds",
      ]),
    );
    expect(Object.keys(getTableColumns(database.aiAuditPayloads))).toEqual(
      expect.arrayContaining([
        "encryptedRequest",
        "encryptedResponse",
        "payloadHash",
        "expiresAt",
      ]),
    );
  });

  it("preserves usage history when runs or models are removed", () => {
    const config = getTableConfig(database.aiUsageLedger);
    const foreignKeys = config.foreignKeys.map((foreignKey) => ({
      table: foreignKey.reference().foreignTable,
      onDelete: foreignKey.onDelete,
    }));

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        { table: database.aiRuns, onDelete: "set null" },
        { table: database.aiModels, onDelete: "set null" },
      ]),
    );
  });

  it("stores immutable model rate versions separately from model settings", () => {
    const columns = getTableColumns(database.aiModelRateVersions);
    const config = getTableConfig(database.aiModelRateVersions);

    expect(Object.keys(columns)).toEqual(expect.arrayContaining([
      "modelId",
      "version",
      "inputPointRate",
      "cachedInputPointRate",
      "outputPointRate",
      "createdAt",
    ]));
    expect(config.foreignKeys[0]?.reference().foreignTable).toBe(
      database.aiModels,
    );
  });
});
