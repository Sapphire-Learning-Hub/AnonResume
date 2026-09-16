import { createAiProposalToolDefinition } from "@/lib/ai/proposals/tool";

describe("AI proposal tool", () => {
  it("describes every required field for supported resume changes", () => {
    const definition = createAiProposalToolDefinition();
    const parameters = definition.parameters as {
      properties: {
        changes: {
          items: { oneOf: Array<{ required: string[] }> };
        };
      };
    };

    expect(parameters.properties.changes.items.oneOf).toHaveLength(5);
    expect(parameters.properties.changes.items.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          required: expect.arrayContaining([
            "type",
            "id",
            "reason",
            "sectionId",
            "blockPath",
            "beforeHash",
            "content",
          ]),
        }),
        expect.objectContaining({
          required: expect.arrayContaining([
            "type",
            "id",
            "reason",
            "sectionId",
            "listPath",
            "itemId",
            "beforeHash",
            "content",
          ]),
        }),
      ]),
    );
  });
});
