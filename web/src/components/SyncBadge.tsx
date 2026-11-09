import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useStore } from "../store";

/** Small sync indicator shown only when signed in to a sync server. */
export function SyncBadge() {
  const { t } = useTranslation();
  const { data, syncStatus } = useStore();
  if (!data.account && syncStatus.state !== "error") return null;
  const label =
    syncStatus.state === "syncing" ? t("sync.syncing")
    : syncStatus.state === "error" ? t("sync.failed")
    : t("sync.synced");
  return (
    <Link to="/settings" className={`sync-badge ${syncStatus.state}`} title={label}>
      {syncStatus.state === "error" ? "⚠" : "⟳"} <span className="sync-label">{label}</span>
    </Link>
  );
}
