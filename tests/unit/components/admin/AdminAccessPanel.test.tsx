import { render, screen } from "@testing-library/react";

import { AdminAccessShell } from "@/components/admin/AdminAccessPanel";

describe("AdminAccessShell", () => {
  it("eagerly loads its above-the-fold brand image", () => {
    render(
      <AdminAccessShell>
        <h1>Activate account</h1>
      </AdminAccessShell>,
    );

    expect(screen.getByRole("img", { name: "AnonResume" })).toHaveAttribute(
      "loading",
      "eager",
    );
  });
});
