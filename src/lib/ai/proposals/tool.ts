import type { AiProposalToolDefinition } from "@/lib/ai/providers/types";

const identifier = { type: "string", minLength: 1, maxLength: 200 };
const path = {
  type: "array",
  minItems: 1,
  maxItems: 20,
  items: identifier,
};
const beforeHash = {
  type: "string",
  pattern: "^[a-f0-9]{64}$",
};
const reason = { type: "string", minLength: 1, maxLength: 500 };
const richTextMark = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: {
          enum: ["bold", "italic", "underline", "strike", "code", "tag"],
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { const: "link" },
        attrs: {
          type: "object",
          additionalProperties: false,
          properties: { href: { type: "string", minLength: 1 } },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "attrs"],
      properties: {
        type: { const: "textColor" },
        attrs: {
          type: "object",
          additionalProperties: false,
          required: ["color"],
          properties: {
            color: {
              type: "string",
              pattern: "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
            },
          },
        },
      },
    },
  ],
};

const richTextContent = {
  type: "object",
  additionalProperties: false,
  required: ["type", "content"],
  properties: {
    type: { const: "doc" },
    content: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "content"],
        properties: {
          type: { const: "paragraph" },
          content: {
            type: "array",
            items: {
              oneOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "text"],
                  properties: {
                    type: { const: "text" },
                    text: { type: "string", minLength: 1 },
                    marks: { type: "array", items: richTextMark },
                  },
                },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["type"],
                  properties: { type: { const: "hardBreak" } },
                },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "attrs"],
                  properties: {
                    type: { const: "resumeIcon" },
                    attrs: {
                      type: "object",
                      additionalProperties: false,
                      required: ["iconId"],
                      properties: {
                        iconId: { type: "string", minLength: 1 },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
};

function changeSchema(
  type: string,
  properties: Record<string, unknown>,
  required: string[],
) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "reason", "sectionId", "beforeHash", ...required],
    properties: {
      type: { const: type },
      id: { type: "string", minLength: 1, maxLength: 100 },
      reason,
      sectionId: identifier,
      beforeHash,
      ...properties,
    },
  };
}

export function createAiProposalToolDefinition(): AiProposalToolDefinition {
  return {
    name: "propose_resume_changes",
    description:
      "Return optional, content-only resume edits using target metadata copied verbatim from editableTargets. Never invent facts, metrics, dates, or achievements.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["changes"],
      properties: {
        summary: { type: "string", minLength: 1, maxLength: 1_000 },
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            oneOf: [
              changeSchema(
                "replace_section_title",
                { content: richTextContent },
                ["content"],
              ),
              changeSchema(
                "replace_text",
                { blockPath: path, content: richTextContent },
                ["blockPath", "content"],
              ),
              changeSchema(
                "replace_list_item",
                { listPath: path, itemId: identifier, content: richTextContent },
                ["listPath", "itemId", "content"],
              ),
              changeSchema(
                "insert_list_item",
                { listPath: path, afterItemId: identifier, content: richTextContent },
                ["listPath", "afterItemId", "content"],
              ),
              changeSchema(
                "delete_list_item",
                { listPath: path, itemId: identifier },
                ["listPath", "itemId"],
              ),
            ],
          },
        },
      },
    },
  };
}
