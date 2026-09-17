"use client";

import { Input } from "antd";
import { useRouter } from "next/navigation";

import { AdminToolbar } from "@/components/admin/AdminPage";
import type { PaginationSearchParams } from "@/lib/shared/pagination";

export function AdminAiSearch({
  basePath,
  placeholder,
  searchParams,
}: {
  basePath: string;
  placeholder: string;
  searchParams: PaginationSearchParams;
}) {
  const router = useRouter();

  return (
    <AdminToolbar>
      <Input.Search
        allowClear
        defaultValue={typeof searchParams.q === "string" ? searchParams.q : ""}
        placeholder={placeholder}
        onSearch={(value) => {
          const params = new URLSearchParams();
          if (value.trim()) params.set("q", value.trim());
          params.set("page", "1");
          router.push(`${basePath}?${params.toString()}`);
        }}
      />
    </AdminToolbar>
  );
}
