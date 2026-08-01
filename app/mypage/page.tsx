"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { cancelApplication, listApplicationsByName } from "@/lib/data";
import { fullDateTime, shortLocation } from "@/lib/format";
import {
  clearProfile,
  saveProfile,
  useProfile,
  type Profile,
} from "@/lib/profile";
import { useIsClient } from "@/lib/useIsClient";
import {
  UNIVERSITIES,
  type ApplicationWithEvent,
  type University,
} from "@/lib/types";

function toUniversity(value: string): University {
  return (UNIVERSITIES as readonly string[]).includes(value)
    ? (value as University)
    : "その他";
}

export default function MyPage() {
  const isClient = useIsClient();
  const profile = useProfile();
  const [rows, setRows] = useState<ApplicationWithEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (name: string) => {
    setError(null);
    try {
      setRows(await listApplicationsByName(name));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    listApplicationsByName(profile.name)
      .then((found) => alive && setRows(found))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [profile]);

  async function handleCancel(id: string) {
    if (!profile) return;
    if (!window.confirm("この申請をキャンセルしますか？")) return;
    try {
      await cancelApplication(id);
      await load(profile.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleSwitch() {
    clearProfile();
    setRows(null);
  }

  if (!isClient) {
    return (
      <p className="text-ink-soft py-16 text-center text-xs">読み込み中…</p>
    );
  }

  if (!profile) {
    return (
      <NameSearch
        onFound={(found, name) => {
          const next: Profile = {
            name,
            university: toUniversity(found[0].university),
            discord: found[0].discord,
          };
          saveProfile(next);
          setRows(found);
        }}
      />
    );
  }

  const applied = (rows ?? [])
    .filter((r) => r.status === "applied")
    .sort((a, b) =>
      (a.event?.event_date ?? "").localeCompare(b.event?.event_date ?? ""),
    );
  const attended = (rows ?? [])
    .filter((r) => r.status === "attended")
    .sort((a, b) =>
      (b.event?.event_date ?? "").localeCompare(a.event?.event_date ?? ""),
    );

  return (
    <>
      <header className="flex items-center gap-3 px-4 pt-6 pb-5">
        <div className="bg-navy-soft text-navy flex h-11 w-11 items-center justify-center rounded-full text-base font-bold">
          {profile.name.trim().charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-ink truncate text-lg font-bold">{profile.name}</h1>
          <p className="text-ink-soft text-xs">
            {profile.university}
            {profile.discord && (
              <>
                <span className="mx-1.5">・</span>
                {profile.discord}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSwitch}
          className="text-ink-soft text-[11px] underline"
        >
          別の名前で見る
        </button>
      </header>

      {error && (
        <p className="text-amber bg-amber-soft mx-4 rounded-xl p-3 text-xs">
          {error}
        </p>
      )}

      {!rows && !error && (
        <p className="text-ink-soft py-10 text-center text-xs">読み込み中…</p>
      )}

      {rows && (
        <div className="space-y-6 px-4">
          <section>
            <h2 className="text-ink mb-2 text-sm font-bold">
              申込中のイベント（{applied.length}）
            </h2>
            {applied.length === 0 ? (
              <p className="border-line text-ink-soft rounded-2xl border border-dashed p-6 text-center text-xs">
                まだ申し込んでいません
                <br />
                <Link href="/" className="text-navy mt-1 inline-block underline">
                  イベントを探す
                </Link>
              </p>
            ) : (
              <ul className="space-y-3">
                {applied.map((row) => (
                  <li
                    key={row.id}
                    className="border-line rounded-2xl border bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-ink text-sm font-bold">
                        {row.event?.title ?? "（削除されたイベント）"}
                      </h3>
                      <Badge tone="grass">申請中</Badge>
                    </div>
                    {row.event && (
                      <p className="text-ink-soft mt-1 text-xs">
                        {fullDateTime(row.event.event_date)}
                        <span className="mx-1.5">・</span>
                        {shortLocation(row.event.location)}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCancel(row.id)}
                      className="border-line text-ink-soft mt-3 w-full rounded-xl border py-2.5 text-xs font-semibold"
                    >
                      申請をキャンセル
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {attended.length > 0 && (
            <section>
              <h2 className="text-ink mb-2 text-sm font-bold">参加済み</h2>
              <ul className="space-y-3">
                {attended.map((row) => (
                  <li
                    key={row.id}
                    className="bg-canvas flex items-start justify-between gap-2 rounded-2xl p-3"
                  >
                    <div>
                      <h3 className="text-ink-soft text-sm font-bold">
                        {row.event?.title ?? "（削除されたイベント）"}
                      </h3>
                      {row.event && (
                        <p className="text-ink-soft mt-1 text-xs">
                          {fullDateTime(row.event.event_date)}
                          <span className="mx-1.5">・</span>
                          {shortLocation(row.event.location)}
                        </p>
                      )}
                    </div>
                    <Badge tone="outline">出席済</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** 認証が無いので、この端末に記録が無い人は名前で自分の申請を引く */
function NameSearch({
  onFound,
}: {
  onFound: (rows: ApplicationWithEvent[], name: string) => void;
}) {
  const [name, setName] = useState("");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || searching) return;

    setSearching(true);
    setMessage(null);
    try {
      const found = await listApplicationsByName(trimmed);
      if (found.length === 0) {
        setMessage("この名前の申請は見つかりませんでした");
      } else {
        onFound(found, trimmed);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="px-4 pt-6">
      <h1 className="text-ink text-2xl font-bold">マイページ</h1>
      <p className="text-ink-soft mt-1 text-xs">
        申請したときのお名前で、自分の申込状況を確認できます
      </p>

      <form onSubmit={handleSearch} className="mt-5 space-y-3">
        <label htmlFor="search-name" className="text-ink block text-xs font-semibold">
          お名前
        </label>
        <input
          id="search-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="山田 太郎"
          className="border-line focus:border-navy text-ink w-full rounded-xl border px-3.5 py-3 text-[15px] outline-none"
        />
        <button
          type="submit"
          disabled={!name.trim() || searching}
          className="bg-navy w-full rounded-xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
        >
          {searching ? "検索中…" : "申込状況を見る"}
        </button>
      </form>

      {message && <p className="text-ink-soft mt-3 text-xs">{message}</p>}

      <p className="text-ink-soft mt-6 text-center text-[11px]">
        まだ申し込んでいない方は{" "}
        <Link href="/" className="text-navy underline">
          イベント一覧
        </Link>{" "}
        から
      </p>
    </div>
  );
}
