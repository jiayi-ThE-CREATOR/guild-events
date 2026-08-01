"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * ハイドレーション後かどうか。localStorage 由来の表示が
 * サーバー HTML と食い違うのを防ぐために使う。
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
