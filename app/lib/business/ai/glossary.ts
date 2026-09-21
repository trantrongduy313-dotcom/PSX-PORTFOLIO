import { STAGE_LABEL, STAGE_ORDER, type StageCode } from "@/app/lib/business/production-stage";
import type { KnowledgeTopic } from "@/app/lib/business/ai/topic";

// ═══════════════════════════════════════════════════════════════════════════
// BẢNG THUẬT NGỮ CHO TRỢ LÝ — DANH SÁCH SINH TỪ CODE, NGHĨA DO NGƯỜI VIẾT
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI:
//
// Người dùng hỏi "Chờ ĐX NL là gì của cột công đoạn" và trợ lý trả lời "nội dung hướng dẫn chưa
// nói về việc này". Trợ lý KHÔNG hỏng — nó bị cấm suy diễn (luật 1 của prompt), và bộ nội dung
// lúc đó có 4 mục / 211 dòng, không mục nào nói về 13 khâu sản xuất.
//
// Phần lớn câu hỏi kiểu đó là "X là gì?": Chờ ĐX NL · ĐBXM · TC Dây · Chờ duyệt NK…
//
// ─── VÌ SAO KHÔNG CHÉP TAY DANH SÁCH VÀO MỘT FILE .md ───────────────────────
//
// Vì hệ thống ĐÃ CÓ danh sách chuẩn: STAGE_ORDER + STAGE_LABEL. Chép sang .md là tạo nơi thứ
// hai, và ngày nào đó thêm một khâu trong code thì trợ lý vẫn dạy 13 khâu cũ — im lặng.
//
// 🎯 Ở ĐÂY DANH SÁCH LÀ DỮ LIỆU PHÁI SINH, KHÔNG PHẢI BẢN SAO. Thêm khâu trong code là trợ lý
// biết ngay ở lần `npm run kb:build` kế tiếp.
//
// ─── NHƯNG CODE CHỈ CHO TÊN, KHÔNG CHO NGHĨA ────────────────────────────────
//
// `"[2] Chờ ĐX NL"` không giải thích đề xuất nguyên liệu là gì, ai làm, chờ gì. Nên phần NGHĨA
// phải do người viết — và đó là chỗ có thể bị bỏ quên.
//
// 🔴 BỘ DÒ LÀ HỆ THỐNG KIỂU, KHÔNG PHẢI MỘT CẢNH BÁO: `Record<StageCode, string>` bên dưới bắt
// buộc phải có ĐỦ mọi mã khâu. Thêm một khâu vào STAGE_ORDER mà quên viết nghĩa thì `tsc` ĐỎ
// ngay lúc build — không phải một dòng log ai đó có thể bỏ qua, và càng không phải người dùng
// phát hiện hộ.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Id của mục sinh tự động.
 *
 * ⚠️ KHÔNG ĐỔI khi đã dùng: nó là nhãn dẫn nguồn trong câu trả lời và đã nằm trong
 * `ai_question_logs`. Đổi id là những dòng log cũ trỏ vào một mục không còn tồn tại.
 */
export const GLOSSARY_TOPIC_ID = "thuat-ngu-cong-doan";

/**
 * Mốc rà của phần NGHĨA.
 *
 * ⚠️ Danh sách khâu thì tự đúng, nhưng lời giải thích bên dưới là chữ người viết và nó CŨ ĐI
 * y như mọi tài liệu khác. Sửa nghĩa thì sửa cả mốc này — bộ dò độ cũ
 * (business/docs/staleness.ts) đọc nó để biết khi nào cần nhắc.
 */
export const GLOSSARY_LAST_REVIEWED = "2026-08";

/**
 * NGHĨA của từng khâu — phần con người phải viết.
 *
 * 🔴 `Record<StageCode, string>` là bộ dò: thiếu một mã là `tsc` đỏ. Đừng đổi thành
 * `Partial<Record<...>>` hay `Record<string, string>` cho "tiện" — làm vậy là gỡ đúng thứ khiến
 * file này đáng tin.
 *
 * Viết cho NGƯỜI DÙNG đọc, không phải cho lập trình viên: nói khâu đó làm gì và ai đụng vào nó,
 * không nói nó lưu ở cột nào.
 */
const STAGE_MEANING: Record<StageCode, string> = {
  RESIN: "In mẫu nhựa từ file 3D bằng máy in resin, để có mẫu thật trước khi đúc kim loại.",
  CHO_DX_NL:
    "Chờ đề xuất nguyên liệu. Xưởng đã biết cần làm gì nhưng chưa có bản đề xuất vật tư (loại vàng, đá, khối lượng) để duyệt mua.",
  CHO_NL:
    "Chờ nguyên liệu. Đề xuất đã duyệt nhưng vật tư chưa về tới xưởng nên chưa bắt đầu làm được.",
  DUC: "Đúc kim loại — rót vàng nóng chảy vào khuôn tạo từ mẫu resin.",
  NGUOI: "Nguội — làm sạch và hoàn thiện phôi sau khi đúc: cắt cây đúc, giũa, chỉnh hình.",
  TC_DAY: "Thủ công dây — làm phần dây, mắt xích, các chi tiết nối bằng tay.",
  TC_NGUOI: "Thủ công nguội — hoàn thiện bằng tay: giũa, chỉnh dáng, xử lý chi tiết nhỏ.",
  KHOA: "Gắn khoá — lắp khoá, chốt cho dây chuyền, lắc, vòng.",
  HOT: "Gắn hột (gắn đá) — cẩn đá chủ và đá tấm vào ổ đã chuẩn bị.",
  MOC: "Móc máy — đánh bóng bằng máy để bề mặt sáng đều.",
  DBXM: "Điện bề xử mặt (mạ) — xi mạ hoàn thiện bề mặt: vàng, trắng, hồng tuỳ yêu cầu.",
  QC: "Kiểm tra chất lượng — soát lỗi trước khi cho nhập kho.",
  DUYET_NK: "Chờ duyệt nhập kho — QC đã xong, đang chờ duyệt để đưa hàng vào kho.",
};

/**
 * Dựng mục kiến thức từ danh sách khâu + phần nghĩa.
 *
 * ⚠️ THỨ TỰ THEO `STAGE_ORDER`, không theo bảng chữ cái: đó là thứ tự các khâu thật sự đi qua,
 * và nó cũng làm chuỗi sinh ra TIỀN ĐỊNH — khối kiến thức được cache theo tiền tố chính xác, nên
 * thứ tự đảo giữa hai lần build là mất cache của mọi người dùng.
 *
 * KHÔNG có `roles`: mọi vai đều có thể gặp tên khâu trên màn hình, kể cả NV 3D khi mở một đơn.
 */
export function buildGlossaryTopic(): KnowledgeTopic {
  const rows = STAGE_ORDER.map((code) => `| \`${code}\` | ${STAGE_LABEL[code]} | ${STAGE_MEANING[code]} |`);

  const body = [
    "Cột **Công đoạn** hiển thị khâu sản xuất mà MO đang nằm ở đó. Số trong ngoặc vuông là thứ tự",
    "khâu, không phải mức ưu tiên.",
    "",
    "| Mã | Tên hiện trên màn hình | Nghĩa |",
    "|---|---|---|",
    ...rows,
    "",
    "Một MO đi lần lượt qua các khâu theo thứ tự trên. Khâu hiện tại là khâu đầu tiên chưa xong.",
    "",
    "⚠️ **Chờ ĐX NL** và **Chờ NL** là hai khâu CHỜ, không phải khâu làm: chúng nghĩa là xưởng",
    "đang bị chặn bởi vật tư chứ không phải đang gia công.",
  ].join("\n");

  return {
    id: GLOSSARY_TOPIC_ID,
    title: "Các khâu sản xuất (cột Công đoạn)",
    roles: [], // rỗng = MỌI vai trò, xem KnowledgeTopic.roles
    lastReviewed: GLOSSARY_LAST_REVIEWED,
    body,
  };
}
