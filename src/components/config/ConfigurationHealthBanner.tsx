import type { ManagedConfigurationHealthState } from "@/lib/config/health";

export function ConfigurationHealthBanner({
  description,
  health,
  title,
}: {
  description: string;
  health: ManagedConfigurationHealthState;
  title: string;
}) {
  if (health === "healthy") return null;

  return (
    <aside className="configuration-health-banner" data-health={health} role="status">
      <strong>{title}</strong>
      <span>{description}</span>
    </aside>
  );
}
