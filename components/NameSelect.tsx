"use client";

import { MEMBERS, isMember } from "@/lib/members";

/**
 * 名前はメンバー一覧から選ぶ。申請フォームとマイページで共用。
 * 一覧に無い名前（過去に自由入力で登録された分）が渡ってきたら、
 * 消えてしまわないよう先頭に足して選択できる状態を保つ。
 */
export default function NameSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
}) {
  const options =
    value && !isMember(value) ? [value, ...MEMBERS] : [...MEMBERS];

  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className={`border-line focus:border-navy w-full appearance-none rounded-xl border bg-white py-3 pr-10 pl-3.5 text-[15px] outline-none ${
          value ? "text-ink" : "text-ink-soft"
        }`}
      >
        <option value="">選択してください</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="text-ink-soft pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2"
      >
        <path
          d="M7 10l5 5 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
