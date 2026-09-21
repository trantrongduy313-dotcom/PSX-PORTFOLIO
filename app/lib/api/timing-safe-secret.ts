import * as crypto from "crypto";

/**
 * So hai chuỗi bí mật theo THỜI GIAN HẰNG ĐỊNH.
 *
 * 🔴 VÌ SAO KHÔNG DÙNG `a === b`: phép so sánh chuỗi thường thoát ra ngay ở byte đầu khác nhau,
 * nên thời gian trả lời rò rỉ "bạn đoán đúng được mấy ký tự". Kẻ tấn công dò từng byte một là
 * moi ra được cả secret mà không cần biết gì thêm.
 *
 * 🔴 VÌ SAO NÓ Ở ĐÂY CHỨ KHÔNG CHÉP LẠI: hàm này vốn nằm trong `api/import/sheet-sync/route.ts`.
 * Khi route thứ hai (cron đối chiếu Mã số mẫu) cũng cần, chép sang là tạo bản sao của một thứ
 * ĐÚNG-VỀ-BẢO-MẬT — loại bản sao tệ nhất: sửa bản gốc thì bản chép vẫn rò rỉ, và KHÔNG CÓ GÌ BÁO.
 * Hai nơi lưu cùng một sự thật thì sớm muộn lệch; ở đây cái lệch là một lỗ hổng.
 *
 * ⚠️ Độ dài KHÔNG được bảo vệ — `timingSafeEqual` đòi hai buffer bằng nhau nên phải kiểm trước,
 * và phép kiểm đó tự nó đã lộ độ dài. Chấp nhận được: độ dài secret không phải bí mật.
 */
export function timingSafeSecretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Bóc secret từ header `Authorization: Bearer <token>`.
 *
 * Vercel Cron gửi đúng dạng này. Trả `""` khi thiếu hoặc sai dạng — chỗ gọi so bằng
 * `timingSafeSecretMatches` nên chuỗi rỗng luôn trượt (khác độ dài).
 */
export function bearerToken(header: string | null | undefined): string {
  const s = String(header ?? "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(s);
  return m ? m[1].trim() : "";
}
