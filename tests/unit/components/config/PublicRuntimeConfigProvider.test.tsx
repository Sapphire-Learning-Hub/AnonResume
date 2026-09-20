import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import {
  PublicRuntimeConfigProvider,
  type PublicRuntimeConfig,
} from "@/components/config/PublicRuntimeConfigProvider";
import { usePublicRuntimeConfig } from "@/components/config/usePublicRuntimeConfig";

function SourceCodeLink() {
  const configuration = usePublicRuntimeConfig();
  return <a href={configuration.sourceCodeUrl}>source</a>;
}

function snapshot(sourceCodeUrl: string): PublicRuntimeConfig {
  return {
    configurationHealth: "healthy",
    sourceCodeUrl,
  };
}

describe("PublicRuntimeConfigProvider", () => {
  it("hydrates the server-injected public configuration without a mismatch", async () => {
    const configuration = snapshot("https://github.com/example/anonresume");
    const element = (
      <PublicRuntimeConfigProvider value={configuration}>
        <SourceCodeLink />
      </PublicRuntimeConfigProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    const onRecoverableError = vi.fn();

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector("a")).toHaveAttribute(
      "href",
      configuration.sourceCodeUrl,
    );
    await act(async () => root?.unmount());
  });

  it("renders the current public configuration for each server request", () => {
    const first = renderToString(
      <PublicRuntimeConfigProvider value={snapshot("https://example.com/one")}>
        <SourceCodeLink />
      </PublicRuntimeConfigProvider>,
    );
    const second = renderToString(
      <PublicRuntimeConfigProvider value={snapshot("https://example.com/two")}>
        <SourceCodeLink />
      </PublicRuntimeConfigProvider>,
    );

    expect(first).toContain("https://example.com/one");
    expect(second).toContain("https://example.com/two");
  });
});
