"use client";

import { Button, Tooltip } from "antd";
import {
  GroupOutlined,
  UngroupOutlined,
  ColumnWidthOutlined,
  PictureOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { useI18n } from "@/i18n/I18nProvider";
import {
  canComposeResumeBlocks,
  type BlockCompositionCommand,
} from "@/domain/resume/composition/operations";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { ResumeDocument } from "@/domain/resume/schema";
import { useResumeEditorShellStyles } from "@/components/editor/ResumeEditorShell.style";
import { useBlockCompositionStyles } from "./BlockCompositionTools.style";

const commands = [
  { command: "group", Icon: GroupOutlined },
  { command: "row", Icon: ColumnWidthOutlined },
  { command: "image-right", Icon: PictureOutlined },
  { command: "ungroup", Icon: UngroupOutlined },
  { command: "into-previous", Icon: ArrowUpOutlined },
  { command: "into-next", Icon: ArrowDownOutlined },
  { command: "out", Icon: ExportOutlined },
] as const;

export function BlockCompositionTools({
  document,
  selection,
  enabled,
  onCommand,
}: {
  document: ResumeDocument;
  selection: ResumeEditorSelection;
  enabled: boolean;
  onCommand: (command: BlockCompositionCommand) => void;
}) {
  const { t } = useI18n();
  const { styles } = useResumeEditorShellStyles();
  const { styles: commandStyles } = useBlockCompositionStyles();
  return (
    <div className={styles.ribbonCommandStack}>
      {[commands.slice(0, 4), commands.slice(4)].map((row, index) => (
        <div key={index} className={styles.ribbonCommandRow}>
          {row.map(({ command, Icon }) => (
            <Tooltip key={command} title={t(`composition.${command}`)}>
              <Button
                aria-label={t(`composition.${command}`)}
                className={commandStyles.button}
                icon={<Icon aria-hidden />}
                disabled={
                  !enabled ||
                  !canComposeResumeBlocks(document, selection, command)
                }
                onClick={() => onCommand(command)}
              >
                {t(`composition.${command}`)}
              </Button>
            </Tooltip>
          ))}
        </div>
      ))}
    </div>
  );
}
