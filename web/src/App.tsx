import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { ClassesPage } from "./pages/ClassesPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  return (
    <Routes>
      <Route path="/" element={<ClassesPage />} />
      <Route path="/classes/:id" element={<ClassesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
