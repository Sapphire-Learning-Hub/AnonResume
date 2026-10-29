"use client";
import { useRef, useState } from "react";
/** Keep the owning surface mounted until Ant Design finishes its exit motion. */
export function useClosingDialog(onClose: () => void) {
  const [open, setOpen] = useState(true);
  const completion = useRef(onClose);
  function close(afterClose: () => void = onClose) {
    completion.current = afterClose;
    setOpen(false);
  }
  return { open, close, afterClose: () => completion.current() };
}
