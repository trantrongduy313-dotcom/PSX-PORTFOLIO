"use client";

import { CHANGELOG_SEEN_KEY } from "@/app/lib/business/changelog/seen";

// ─── Mốc "đã đọc" ở trình duyệt — dưới dạng MỘT EXTERNAL STORE ───────────────
//
// Chỉ là lớp I/O. QUYẾT ĐỊNH ("có chấm đỏ hay không", "ghi mốc nào") nằm ở
// `business/changelog/seen.ts` — thuần và có test. Cùng cách chia đã dùng ở `stage-collapse.ts`.
//
// ⚠️ VÌ SAO DỰNG THÀNH EXTERNAL STORE CHỨ KHÔNG `useEffect` + `setState`:
//
// Bản đầu của ba component ở đây đều làm `useEffect(() => setX(readLocalStorage()), [])`. Nó
// CHẠY, nhưng ESLint của React chặn đúng: gọi `setState` đồng bộ trong effect tạo một lượt
// render dây chuyền, và với ba component cùng làm vậy thì mỗi lần đổi trang là ba lượt render
// thừa.
//
// `useSyncExternalStore` là API React dựng riêng cho đúng ca này: đọc trạng thái NGOÀI React
// (localStorage), có bản riêng cho server (không có localStorage), và tự đăng ký nghe thay đổi.
// Đây là cách sửa đúng, không phải cách lách lint.
//
// ⚠️ VÌ SAO CẦN MỘT SỰ KIỆN TUỲ CHỌN (`CHANGELOG_SEEN_EVENT`):
//
// Sidebar nằm trong `layout.tsx`, nên trong App Router nó KHÔNG bị tháo ra khi điều hướng. Mở
// trang "Có gì mới" sẽ ghi mốc mới, nhưng huy hiệu không mount lại — nên nó vẫn hiện số cũ cho
// tới lần tải trang đầy đủ tiếp theo. Người dùng thấy "tôi vừa đọc xong mà chấm đỏ vẫn còn", họ
// bấm lại lần nữa, rồi kết luận chấm đỏ không đáng tin — và một tín hiệu không đáng tin thì tệ
// hơn không có tín hiệu.

export const CHANGELOG_SEEN_EVENT = "psx:changelog-seen";

/** null nếu chưa đọc gì, hoặc localStorage không dùng được (chế độ riêng tư, cookie bị chặn). */
function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    // localStorage có thể NÉM (Safari private mode). Không đọc được thì người dùng thấy chấm đỏ
    // mãi — hơi phiền, nhưng không mất thông tin nào.
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ghi không được thì lần tải sau nó hiện lại — trung thực hơn là im lặng */
  }
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Đăng ký nghe: sự kiện của chính ta + `storage` để hai tab cùng mở không lệch nhau. */
export function subscribeSeen(onChange: () => void): () => void {
  listeners.add(onChange);
  const relay = () => emit();
  window.addEventListener(CHANGELOG_SEEN_EVENT, relay);
  window.addEventListener("storage", relay);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener(CHANGELOG_SEEN_EVENT, relay);
    window.removeEventListener("storage", relay);
  };
}

/** Mốc đã đọc HIỆN TẠI — đổi theo thời gian, dùng cho huy hiệu. */
export function getSeenSnapshot(): string | null {
  return readRaw(CHANGELOG_SEEN_KEY);
}

/**
 * MỐC ĐÃ ĐỌC LÚC MỞ TRANG — chụp một lần rồi ĐÓNG BĂNG suốt phiên.
 *
 * 🔴 ĐÂY LÀ CHỖ DỄ VIẾT NGƯỢC NHẤT CỦA CẢ TÍNH NĂNG.
 *
 * Trang "Có gì mới" làm hai việc: gắn nhãn MỚI cho những mục người này chưa xem, VÀ ghi lại mốc
 * đã đọc. Nếu nhãn MỚI đọc từ `getSeenSnapshot()` thì ngay sau khi ghi mốc, phép so ra "không
 * có gì mới" và mọi nhãn MỚI biến mất — người dùng mở trang ra thấy một danh sách phẳng, đúng
 * lúc họ cần biết cái nào vừa thay đổi.
 *
 * Lỗi đó không nổ, không có log, chỉ âm thầm làm trang mất hết giá trị. Nên mốc dùng để gắn
 * nhãn phải là một BẢN CHỤP, và nó nằm ở module (không phải state) để không có cách nào bị ghi
 * đè bởi chính hành động đọc.
 */
let baseline: string | null | undefined = undefined;

export function getSeenBaseline(): string | null {
  if (baseline === undefined) baseline = readRaw(CHANGELOG_SEEN_KEY);
  return baseline;
}

/** Không bao giờ thay đổi sau lần chụp đầu → không cần nghe gì. */
export function subscribeNever(): () => void {
  return () => {};
}

/** Bản cho server: không có localStorage, và phải TĨNH để không gây hydration mismatch. */
export function getSeenServerSnapshot(): null {
  return null;
}

/** Ghi mốc rồi phát sự kiện để huy hiệu ở Sidebar cập nhật ngay. */
export function writeChangelogSeen(mark: string | null): void {
  if (!mark) return;
  // Chụp bản nền TRƯỚC khi ghi. Trang gọi hàm này trong effect, tức là sau render — nhưng gọi ở
  // đây một lần nữa là lưới an toàn: nếu về sau có đường gọi nào khác chạy trước lượt render
  // đầu, bản nền vẫn là giá trị CŨ chứ không phải giá trị vừa ghi.
  getSeenBaseline();
  writeRaw(CHANGELOG_SEEN_KEY, mark);
  emit();
}

// ─── Băng thông báo cho mục QUAN TRỌNG ───────────────────────────────────────
//
// Khoá RIÊNG, không dùng lại mốc "đã đọc". Hai hành động khác nhau:
//
//   · đóng băng thông báo  = "tôi thấy rồi, cho tôi làm việc"
//   · mở trang Có gì mới   = "tôi đã đọc"
//
// Gộp chúng nghĩa là đóng băng cũng tắt luôn chấm đỏ — một cú bấm X vô tình xoá mất dấu hiệu duy
// nhất còn lại nhắc họ vào đọc. Đó đúng là lý do KHÔNG dùng hộp thoại chặn ngang: người ta bấm X
// theo phản xạ, và mọi thứ gắn vào cú bấm đó đều mất theo.
//
// Lưu ID của mục đã đóng, không lưu thời điểm: mỗi mục quan trọng đáng được nhìn thấy đúng một
// lần, và ID là cách duy nhất nói được "đúng cái này thì tôi thấy rồi".

const BANNER_KEY = "changelog-banner-dismissed-v1";
const BANNER_EVENT = "psx:changelog-banner";

export function subscribeBanner(onChange: () => void): () => void {
  listeners.add(onChange);
  const relay = () => emit();
  window.addEventListener(BANNER_EVENT, relay);
  window.addEventListener("storage", relay);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener(BANNER_EVENT, relay);
    window.removeEventListener("storage", relay);
  };
}

export function getDismissedBannerSnapshot(): string | null {
  return readRaw(BANNER_KEY);
}

export function dismissBanner(entryId: string): void {
  writeRaw(BANNER_KEY, entryId);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(BANNER_EVENT));
  emit();
}
