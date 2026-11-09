import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { validScale, type Scale } from "@grades/calc";
import { ApiError } from "../api";
import { makeBackup, parseBackup } from "../backup";
import { type Language } from "../i18n";
import { NumberInput } from "../components/NumberInput";
import { stamp, useStore } from "../store";

const PRESETS: Scale[] = [
  { min: 1, max: 7, pass: 4 },
  { min: 0, max: 10, pass: 5 },
  { min: 0, max: 20, pass: 10 },
  { min: 0, max: 100, pass: 60 },
];

type Message = { kind: "ok" | "error"; text: string } | null;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const { data, syncStatus } = store;

  const [scale, setScale] = useState<Partial<Scale>>(data.scale);
  const [scaleMsg, setScaleMsg] = useState<Message>(null);

  const [serverUrl, setServerUrl] = useState(data.account?.serverUrl ?? window.location.origin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<Message>(null);

  const [dataMsg, setDataMsg] = useState<Message>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const complete = scale.min !== undefined && scale.max !== undefined && scale.pass !== undefined;

  function saveScale() {
    if (!complete || !validScale(scale as Scale)) {
      setScaleMsg({ kind: "error", text: t("errors.INVALID_SCALE") });
      return;
    }
    store.setScale(scale as Scale);
    setScaleMsg({ kind: "ok", text: t("settings.saved") });
  }

  async function signIn(e: FormEvent, register: boolean) {
    e.preventDefault();
    setBusy(true);
    setSyncMsg(null);
    try {
      await store.signIn(serverUrl, email.trim(), password, register);
      setPassword("");
    } catch (err) {
      setSyncMsg({ kind: "error", text: t(`errors.${err instanceof ApiError ? err.code : "UNKNOWN"}`) });
    } finally {
      setBusy(false);
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(makeBackup(data.classes, data.scale), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `grades-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(file: File) {
    const backup = parseBackup(await file.text());
    if (!backup) {
      setDataMsg({ kind: "error", text: t("data.importFailed") });
      return;
    }
    // Imported classes count as fresh edits so they win over local copies and deletions.
    store.importClasses(backup.classes.map((c) => ({ ...c, deleted: false, updatedAt: stamp() })), backup.scale);
    setScale(backup.scale);
    setDataMsg({ kind: "ok", text: t("data.importDone", { count: backup.classes.length }) });
  }

  const field = (key: keyof Scale) => (
    <label>
      {t(`settings.${key}`)}
      <NumberInput label={t(`settings.${key}`)} value={scale[key] ?? null} onChange={(v) => setScale({ ...scale, [key]: v ?? undefined })} />
    </label>
  );

  const lastSync = data.account?.lastSyncAt
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(data.account.lastSyncAt)
    : t("sync.never");

  return (
    <div className="layout">
      <header className="topbar">
        <Link className="button" to="/">← {t("settings.back")}</Link>
        <h1 className="title">{t("settings.title")}</h1>
      </header>
      <main className="content single">
        <section className="card">
          <h2>{t("settings.scale")}</h2>
          <p className="muted">{t("settings.scaleHelp")}</p>
          <div className="exam-fields">{field("min")}{field("max")}{field("pass")}</div>
          <div className="presets">
            <span className="muted">{t("settings.presets")}:</span>
            {PRESETS.map((p) => (
              <button key={`${p.min}-${p.max}`} type="button" onClick={() => setScale(p)}>
                {p.min}–{p.max} ({p.pass})
              </button>
            ))}
          </div>
          {scaleMsg && <p className={scaleMsg.kind} role="status">{scaleMsg.text}</p>}
          <div className="actions">
            <button className="primary" onClick={saveScale}>{t("settings.save")}</button>
          </div>

          <h2>{t("settings.language")}</h2>
          <select value={data.locale ?? ""} onChange={(e) => store.setLocale((e.target.value || null) as Language | null)}>
            <option value="">{t("settings.system")}</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </section>

        <section className="card">
          <h2>{t("sync.title")}</h2>
          <p className="muted">{t("sync.help")}</p>
          {data.account ? (
            <>
              <p>{t("sync.signedInAs", { email: data.account.email, server: data.account.serverUrl })}</p>
              <p className="muted">
                {syncStatus.state === "syncing" ? t("sync.syncing") : t("sync.lastSynced", { time: lastSync })}
              </p>
              {syncStatus.state === "error" && <p className="error">{t(`errors.${syncStatus.code}`, { defaultValue: t("errors.UNKNOWN") })}</p>}
              <div className="actions">
                <button className="primary" disabled={syncStatus.state === "syncing"} onClick={() => void store.syncNow()}>{t("sync.now")}</button>
                <button className="danger-btn" onClick={store.signOut}>{t("sync.signOut")}</button>
              </div>
            </>
          ) : (
            <form className="sync-form" onSubmit={(e) => signIn(e, false)}>
              {syncStatus.state === "error" && <p className="error">{t(`errors.${syncStatus.code}`, { defaultValue: t("errors.UNKNOWN") })}</p>}
              <label>
                {t("sync.server")}
                <input type="url" required value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://…" />
              </label>
              <label>
                {t("auth.email")}
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                {t("auth.password")}
                <input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                <small className="muted">{t("auth.passwordHint")}</small>
              </label>
              {syncMsg && <p className={syncMsg.kind} role="alert">{syncMsg.text}</p>}
              <div className="actions">
                <button className="primary" disabled={busy}>{t("auth.login")}</button>
                <button type="button" disabled={busy} onClick={(e) => {
                  const form = (e.currentTarget as HTMLButtonElement).form!;
                  if (form.reportValidity()) void signIn(e, true);
                }}>{t("auth.register")}</button>
              </div>
            </form>
          )}
        </section>

        <section className="card">
          <h2>{t("data.title")}</h2>
          <p className="muted">{t("data.help")}</p>
          {dataMsg && <p className={dataMsg.kind} role="status">{dataMsg.text}</p>}
          <div className="actions">
            <button onClick={exportData}>{t("data.export")}</button>
            <button onClick={() => fileInput.current?.click()}>{t("data.import")}</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importData(f);
                e.target.value = "";
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
