import type { AiToolDefinition } from "@/lib/ai/providers/types";

const reason = { type: "string", minLength: 1, maxLength: 500 };
const blockPath = {
  type: "array",
  minItems: 1,
  maxItems: 20,
  items: { type: "string", minLength: 1, maxLength: 200 },
};
const blockDraft: Record<string, unknown> = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "text"],
      properties: {
        type: { const: "text" },
        text: { type: "string", minLength: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "items"],
      properties: {
        type: { enum: ["badges", "list"] },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          items: { type: "string", minLength: 1 },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "children"],
      properties: {
        type: { enum: ["group", "row"] },
        direction: { enum: ["vertical", "horizontal"] },
        children: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {},
        },
      },
    },
  ],
};

function operationsTool(input: {
  name: string;
  description: string;
  operations: Record<string, unknown>[];
}): AiToolDefinition {
  return {
    name: input.name,
    description: input.description,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["operations"],
      properties: {
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: { oneOf: input.operations },
        },
      },
    },
  };
}

export function createAiAgentToolDefinitions(): AiToolDefinition[] {
  return [
    {
      name: "inspect_resume_structure",
      description: "Inspect the current resume structure and editable target IDs.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    {
      name: "list_resume_capabilities",
      description: "List the structural and content changes this editor supports.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    operationsTool({
      name: "stage_section_changes",
      description: "Stage section creation, rename, move, or deletion operations.",
      operations: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "title", "blocks", "reason"],
          properties: {
            type: { const: "create" },
            title: { type: "string", minLength: 1, maxLength: 200 },
            semantic: { type: "string", minLength: 1, maxLength: 100 },
            afterSectionId: { type: "string", minLength: 1, maxLength: 200 },
            blocks: {
              type: "array",
              minItems: 1,
              maxItems: 30,
              items: blockDraft,
            },
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "title", "reason"],
          properties: {
            type: { const: "rename" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            title: { type: "string", minLength: 1, maxLength: 200 },
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "toIndex", "reason"],
          properties: {
            type: { const: "move" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            toIndex: { type: "integer", minimum: 0 },
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "reason"],
          properties: {
            type: { const: "delete" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            reason,
          },
        },
      ],
    }),
    operationsTool({
      name: "stage_block_changes",
      description: "Stage block insertion, movement, or deletion inside a section.",
      operations: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "block", "reason"],
          properties: {
            type: { const: "insert" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            afterBlockPath: blockPath,
            block: blockDraft,
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "blockPath", "toIndex", "reason"],
          properties: {
            type: { const: "move" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            blockPath,
            toIndex: { type: "integer", minimum: 0 },
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "blockPath", "reason"],
          properties: {
            type: { const: "delete" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            blockPath,
            reason,
          },
        },
      ],
    }),
    operationsTool({
      name: "stage_content_changes",
      description: "Stage edits to section titles, text blocks, and list items.",
      operations: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "text", "reason"],
          properties: {
            type: { const: "replace_section_title" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            text: { type: "string", minLength: 1 },
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "blockPath", "text", "reason"],
          properties: {
            type: { const: "replace_text" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            blockPath,
            text: { type: "string", minLength: 1 },
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "listPath", "itemId", "reason"],
          properties: {
            type: { enum: ["replace_list_item", "delete_list_item"] },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            listPath: blockPath,
            itemId: { type: "string", minLength: 1, maxLength: 200 },
            text: { type: "string", minLength: 1 },
            reason,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "sectionId", "listPath", "afterItemId", "text", "reason"],
          properties: {
            type: { const: "insert_list_item" },
            sectionId: { type: "string", minLength: 1, maxLength: 200 },
            listPath: blockPath,
            afterItemId: { type: "string", minLength: 1, maxLength: 200 },
            text: { type: "string", minLength: 1 },
            reason,
          },
        },
      ],
    }),
    {
      name: "submit_resume_proposal",
      description: "Validate and submit all staged changes for user review.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["summary"],
        properties: {
          summary: { type: "string", minLength: 1, maxLength: 1_000 },
        },
      },
    },
  ];
}
