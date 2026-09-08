"use client";

import { Input } from "antd";
import type { ComponentProps } from "react";

type AdminOtpInputProps = Omit<
  ComponentProps<typeof Input.OTP>,
  "className" | "classNames" | "length" | "size"
>;

export function AdminOtpInput(props: AdminOtpInputProps) {
  return (
    <Input.OTP
      {...props}
      autoComplete="one-time-code"
      classNames={{ input: "admin-otp__input", root: "admin-otp" }}
      inputMode="numeric"
      length={6}
      size="large"
    />
  );
}
