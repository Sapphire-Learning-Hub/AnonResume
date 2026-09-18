import { Fragment } from "react";

export function AiPlainText({ children }: { children: string }) {
  return children.split(/\r\n?|\n/).map((line, index) => (
    <Fragment key={`${index}-${line}`}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}
