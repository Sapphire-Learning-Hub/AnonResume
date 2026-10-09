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
  return (
    <div data-ai-enabled={configuration.aiEnabled}>
      <a href={configuration.sourceCodeUrl}>source</a>
      <a href={configuration.supportUrl}>support</a>
    </div>
  );
}

function snapshot(sourceCodeUrl: string): PublicRuntimeConfig {
  return {
    aiEnabled: true,
    configurationHealth: "healthy",
    privacyPolicyUrl: "https://example.com/privacy",
    sourceCodeUrl,
    supportUrl: "https://example.com/support",
    termsOfServiceUrl: "https://example.com/terms",
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
    expect(container.querySelector('[data-ai-enabled="true"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://example.com/support"]'))
      .not.toBeNull();
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
