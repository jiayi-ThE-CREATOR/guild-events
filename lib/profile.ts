"use client";

import { useSyncExternalStore } from "react";
import type { University } from "./types";

const KEY = "guild-events:profile";

/**
 * 認証は入れない設計なので、初回申請時の入力をこの端末に覚えておき、
 * マイページで「自分の申請」を引くのに使う。
 *
 * localStorage は SSR 中に読めないため、React の外部ストアとして扱う。
 * （effect の中で setState して二重レンダリングを起こさないための形）
 */
export type Profile = {
  name: string;
  university: University;
  discord: string | null;
};

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached: Profile | null = null;

function parse(raw: string): Profile | null {
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", emit);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", emit);
  };
}

/** raw 文字列が変わらない限り同じ参照を返す（useSyncExternalStore の要件） */
function getSnapshot(): Profile | null {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = raw ? parse(raw) : null;
  }
  return cached;
}

function getServerSnapshot(): Profile | null {
  return null;
}

export function useProfile(): Profile | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** hook を使えない場所（イベントハンドラ・effect の中）用 */
export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  return raw ? parse(raw) : null;
}

export function saveProfile(profile: Profile) {
  window.localStorage.setItem(KEY, JSON.stringify(profile));
  emit();
}

export function clearProfile() {
  window.localStorage.removeItem(KEY);
  emit();
}
