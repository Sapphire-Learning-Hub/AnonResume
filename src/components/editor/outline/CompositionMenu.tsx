"use client";

import { MoreOutlined } from "@ant-design/icons";
import { Button, Dropdown } from "antd";
import {
  canComposeResumeBlocks,
  type BlockCompositionCommand,
} from "@/domain/resume/composition/operations";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { ResumeDocument } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";

const commands: BlockCompositionCommand[] = [
  "group",
  "row",
  "image-right",
  "ungroup",
  "into-previous",
  "into-next",
  "out",
];

export function CompositionMenu({
  document,
  selection,
  onCompose,
  className,
}: {
  document: ResumeDocument;
  selection: ResumeEditorSelection;
  onCompose: (command: BlockCompositionCommand) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: commands.map((command) => ({
          key: command,
          label: t(`composition.${command}`),
          disabled: !canComposeResumeBlocks(document, selection, command),
        })),
        onClick: ({ key }) => {
          const command = commands.find((command) => command === key);
          if (command) onCompose(command);
        },
      }}
    >
      <Button
        className={className}
        type="text"
        size="small"
        aria-label={t("outline.actions")}
        icon={<MoreOutlined />}
      />
    </Dropdown>
  );
}
