"use client";

import { useRef, useState } from "react";
import { CELL_MIN, type CellState, type Cells } from "@/lib/manual";

/**
 * 手動の予定を入れる画面（マイページの毎週の予定・会議ページのこの会議の予定で共用）。
 * 30 分のマスを塗るか、「時間を指定して追加」で入れる。保存ボタンで初めて送る。
 *
 * 塗り方：上で「予定あり／空いている／消す」を選び、マスを押したままなぞる。
 * スマホでは塗っている間ページがスクロールしないよう、マスの上は touch-action: none。
 * スクロールは左の時刻の列で行う。
 */

export type Column = { label: string; sub?: string };

type Brush = CellState | "erase";

const BRUSHES: { key: Brush; label: string; swatch: string }[] = [
  { key: "busy", label: "予定あり", swatch: "bg-kyoto" },
  { key: "free", label: "空いている", swatch: "bg-grass" },
  { key: "erase", label: "消す", swatch: "bg-white border border-line" },
];

function hhmm(min: number) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export default function ScheduleEditor({
  columns,
  startMin,
  endMin,
  cellKey,
  isDisabled,
  initialCells,
  initialExclusive,
  base,
  baseNote,
  onSave,
}: {
  columns: Column[];
  startMin: number;
  endMin: number;
  /** 列番号と 0 時からの分からマスのキーを作る */
  cellKey: (col: number, min: number) => string;
  /** 塗れないマス（会議の候補の外など） */
  isDisabled?: (col: number, min: number) => boolean;
  initialCells: Cells;
  initialExclusive: boolean;
  /** 下の層（毎週の予定・外部カレンダー）での見え方。薄く重ねて出す */
  base?: Record<string, CellState>;
  baseNote?: string;
  onSave: (cells: Cells, exclusive: boolean) => Promise<void>;
}) {
  const [cells, setCells] = useState<Cells>(initialCells);
  const [exclusive, setExclusive] = useState(initialExclusive);
  const [brush, setBrush] = useState<Brush>("busy");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // 1 回のなぞりの間に同じマスを何度も切り替えないよう、塗る内容を押した瞬間に決める
  const stroke = useRef<Brush | null>(null);

  const rows: number[] = [];
  for (let m = startMin; m < endMin; m += CELL_MIN) rows.push(m);

  function apply(key: string, value: Brush) {
    setCells((prev) => {
      if (value === "erase" ? !(key in prev) : prev[key] === value) return prev;
      const next = { ...prev };
      if (value === "erase") delete next[key];
      else next[key] = value;
      return next;
    });
    setDirty(true);
    setMessage(null);
  }

  function keyAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return el?.dataset.cell ?? null;
  }

  function onPointerDown(e: React.PointerEvent) {
    const key = keyAt(e.clientX, e.clientY);
    if (!key) return;
    e.preventDefault();
    // 同じ色のマスから始めたら、そのなぞりは「消す」にする（押し直しで取り消せるように）
    stroke.current = brush !== "erase" && cells[key] === brush ? "erase" : brush;
    apply(key, stroke.current);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!stroke.current) return;
    const key = keyAt(e.clientX, e.clientY);
    if (key) apply(key, stroke.current);
  }

  function endStroke() {
    stroke.current = null;
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(cells, exclusive);
      setDirty(false);
      setMessage({ ok: true, text: "保存しました" });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function cellClass(key: string) {
    const own = cells[key];
    if (own === "busy") return "bg-kyoto/80";
    if (own === "free") return "bg-grass/80";
    if (exclusive) return "bg-kyoto/15";
    const under = base?.[key];
    if (under === "busy") return "bg-ink-soft/25";
    if (under === "free") return "bg-grass/15";
    return "bg-white";
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {BRUSHES.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setBrush(b.key)}
            aria-pressed={brush === b.key}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              brush === b.key ? "border-navy bg-navy-soft text-navy" : "border-line text-ink-soft bg-white"
            }`}
          >
            <span className={`inline-block h-3 w-3 rounded-sm ${b.swatch}`} />
            {b.label}
          </button>
        ))}
      </div>

      <div className="border-line overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full border-collapse select-none text-[10px]">
          <thead>
            <tr>
              <th className="bg-white w-10" />
              {columns.map((c, i) => (
                <th key={i} className="text-ink px-0.5 py-1.5 text-center font-semibold">
                  {c.label}
                  {c.sub && <span className="text-ink-soft block font-normal">{c.sub}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerLeave={endStroke}
            onPointerCancel={endStroke}
          >
            {rows.map((min) => (
              <tr key={min}>
                <th
                  scope="row"
                  className="text-ink-soft w-10 pr-1 text-right align-top font-normal leading-none"
                >
                  {min % 60 === 0 ? hhmm(min) : ""}
                </th>
                {columns.map((_, col) => {
                  const key = cellKey(col, min);
                  if (isDisabled?.(col, min)) {
                    return (
                      <td
                        key={col}
                        aria-disabled
                        className="border-line cover-stripes h-5 min-w-9 border"
                      />
                    );
                  }
                  return (
                    <td
                      key={col}
                      data-cell={key}
                      style={{ touchAction: "none" }}
                      className={`border-line h-5 min-w-9 cursor-pointer border ${
                        min % 60 === 0 ? "border-t-ink-soft/30" : ""
                      } ${cellClass(key)}`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-ink-soft mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <Legend className="bg-kyoto/80" label="予定あり" />
        <Legend className="bg-grass/80" label="空いている" />
        {base && <Legend className="bg-ink-soft/25" label={baseNote ?? "ほかの予定"} />}
      </div>

      <RangeForm columns={columns} startMin={startMin} endMin={endMin} onAdd={(col, from, to, state) => {
        for (let m = from; m < to; m += CELL_MIN) {
          if (!isDisabled?.(col, m)) apply(cellKey(col, m), state);
        }
      }} />

      <label className="text-ink mt-4 flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={exclusive}
          onChange={(e) => {
            setExclusive(e.target.checked);
            setDirty(true);
            setMessage(null);
          }}
          className="mt-0.5"
        />
        <span>
          「空いている」で塗った時間以外は、すべて予定ありとみなす
          <span className="text-ink-soft block text-[11px]">
            カレンダーを使わず、出られる時間だけを塗りたい人向け
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="bg-navy rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {dirty && !saving && <span className="text-amber text-xs">未保存の変更があります</span>}
        {message && (
          <span className={`text-xs ${message.ok ? "text-grass" : "text-amber"}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm border border-line ${className}`} />
      {label}
    </span>
  );
}

/** 「時間を指定して追加」。塗るのが面倒なとき・長い時間をまとめて入れるとき用 */
function RangeForm({
  columns,
  startMin,
  endMin,
  onAdd,
}: {
  columns: Column[];
  startMin: number;
  endMin: number;
  onAdd: (col: number, from: number, to: number, state: CellState) => void;
}) {
  const [col, setCol] = useState(0);
  const [from, setFrom] = useState(startMin);
  const [to, setTo] = useState(Math.min(startMin + 60, endMin));
  const [state, setState] = useState<CellState>("busy");
  const times: number[] = [];
  for (let m = startMin; m <= endMin; m += CELL_MIN) times.push(m);
  const field = "border-line rounded-lg border bg-white px-2 py-1.5 text-xs";

  return (
    <details className="mt-3">
      <summary className="text-navy cursor-pointer text-xs font-semibold">＋ 時間を指定して追加</summary>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select aria-label="日" value={col} onChange={(e) => setCol(Number(e.target.value))} className={field}>
          {columns.map((c, i) => (
            <option key={i} value={i}>
              {c.sub ? `${c.sub}（${c.label}）` : c.label}
            </option>
          ))}
        </select>
        <select aria-label="開始" value={from} onChange={(e) => setFrom(Number(e.target.value))} className={field}>
          {times.slice(0, -1).map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}
        </select>
        <span className="text-ink-soft text-xs">〜</span>
        <select aria-label="終了" value={to} onChange={(e) => setTo(Number(e.target.value))} className={field}>
          {times.slice(1).map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}
        </select>
        <select aria-label="種類" value={state} onChange={(e) => setState(e.target.value as CellState)} className={field}>
          <option value="busy">予定あり</option>
          <option value="free">空いている</option>
        </select>
        <button
          type="button"
          disabled={from >= to}
          onClick={() => onAdd(col, from, to, state)}
          className="border-navy text-navy rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          追加
        </button>
      </div>
    </details>
  );
}
