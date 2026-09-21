"use client";

import type { GuideLang, GuideRole } from "@/app/lib/guide/content";

// ─── Trạng thái đọc hướng dẫn, dưới dạng MỘT EXTERNAL STORE ──────────────────
//
// Người đọc đang ở bộ nào, chương nào, ngôn ngữ nào — lưu ở localStorage để lần sau mở lại
// đúng chỗ đã dừng.
//
// ⚠️ VÌ SAO KHÔNG `useEffect` + `setState`:
//
// Bản trước làm `useEffect(() => { setState(load()); setMounted(true); }, [])`. Nó chạy, nhưng
// ESLint của React chặn đúng: gọi `setState` đồng bộ trong effect tạo một lượt render dây chuyền.
// `useSyncExternalStore` là API React dựng riêng cho việc đọc trạng thái NGOÀI React, và nó lo
// luôn bản cho server (nơi không có localStorage) — nên bỏ được cả cờ `mounted`.
//
// Cùng khuôn đã dùng cho mốc "đã đọc" của changelog (_components/changelog/changelog-seen-store.ts).
//
// ⚠️ ĐIỂM CHẾT NGƯỜI CỦA useSyncExternalStore: `getSnapshot` phải trả về giá trị SO SÁNH ĐƯỢC
// bằng `Object.is`. Parse JSON ra một object mới mỗi lần gọi là vòng render vô hạn. Nên snapshot
// ở đây là CHUỖI THÔ của localStorage — chuỗi so bằng giá trị, không bằng tham chiếu. Việc dựng
// object là bước phái sinh, làm ở component.

const LS_KEY = "guide-state-v1";
const EVENT = "psx:guide-state";

export type GuideState = {
  role: GuideRole;
  chapter: number;
  lang: GuideLang;
  maxReached: number;
};

const listeners = new Set<() => void>();

export function subscribeGuideState(onChange: () => void): () => void {
  listeners.add(onChange);
  const relay = () => {
    for (const l of listeners) l();
  };
  window.addEventListener(EVENT, relay);
  // `storage` để hai tab cùng mở không lệch nhau.
  window.addEventListener("storage", relay);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener(EVENT, relay);
    window.removeEventListener("storage", relay);
  };
}

/**
 * Chuỗi thô trong localStorage.
 *
 * Trả `""` khi CHƯA có gì lưu — cố ý KHÔNG trả `null`, vì `null` là tín hiệu riêng của bản
 * server ("chưa hydrate"). Hai trạng thái đó phải phân biệt được: một cái nghĩa là "người này
 * chưa từng đọc", cái kia nghĩa là "chưa biết gì cả, đừng vẽ".
 */
export function getGuideStateSnapshot(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? "";
  } catch {
    // localStorage có thể ném (Safari private mode). Coi như chưa lưu gì.
    return "";
  }
}

/** Bản cho server: `null` = chưa hydrate. Phải TĨNH, không thì hydration mismatch. */
export function getGuideStateServerSnapshot(): null {
  return null;
}

/**
 * Dựng trạng thái từ chuỗi thô + vai trò mặc định.
 *
 * `defaultRole` chỉ là điểm khởi đầu cho lần vào ĐẦU TIÊN — suy từ vai trò tài khoản, để một
 * nhân viên 3D không phải tự tìm bộ của mình giữa ba tab. Nhưng LỰA CHỌN ĐÃ LƯU THẮNG: người đã
 * chủ động đổi tab thì lần sau phải thấy lại đúng tab đó. Đè lên lựa chọn của họ mỗi lần mở là
 * biến một tiện ích thành một sự khó chịu.
 */
export function mergeGuideState(raw: string | null, defaultRole: GuideRole): GuideState {
  const base: GuideState = { role: defaultRole, chapter: 0, lang: "vi", maxReached: 0 };
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<GuideState>;
    return { ...base, ...parsed };
  } catch {
    // Giá trị hỏng (người dùng tự sửa, hoặc dữ liệu từ bản cũ) → dùng mặc định, không nổ.
    return base;
  }
}

/** Ghi rồi phát sự kiện để mọi chỗ đang nghe vẽ lại. */
export function writeGuideState(next: GuideState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ghi không được thì phiên này vẫn đúng, chỉ là lần sau không nhớ */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}
