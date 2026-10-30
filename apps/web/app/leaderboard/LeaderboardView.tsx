"use client";

import Link from "next/link";
import LangSwitch from "../../game3d/ui/LangSwitch";
import { useT } from "../../settings/react";

export default function LeaderboardView() {
  const t = useT();
  return (
    <main className="page">
      <LangSwitch className="page-lang" />
      <h1>{t("boardTitle")}</h1>
      <p>{t("boardSoon")}</p>
      <Link className="btn" href="/">
        {t("home")}
      </Link>
    </main>
  );
}
