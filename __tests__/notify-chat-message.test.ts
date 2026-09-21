import { describe, expect, it } from "vitest";

import {
  buildAssignmentBatchMessage,
  buildDesignPriorityChangedMessage,
  buildNewAssignmentMessage,
  buildOvertimeRequestMessage,
  formatVnDeadline,
  type AssignmentNotice,
  type DesignPriorityChangeNotice,
} from "@/app/lib/business/notify/chat-message";
import { isAllowedChatWebhook, redactWebhookUrl } from "@/app/lib/notify/google-chat";

// Ngày giờ trong test LUÔN ghi rõ giờ Việt Nam (vitest chạy TZ=UTC giống Vercel).
const vn = (iso: string) => new Date(`${iso}+07:00`);

function notice(overrides: Partial<AssignmentNotice> = {}): AssignmentNotice {
  return {
    designerName: "N8n",
    moNumber: "26.42432.1",
    productName: "Vỏ vòng xoàn",
    groupName: "Nhóm 2",
    standardMinutes: 240,
    deadlineAt: vn("2026-08-10T14:27:00"),
    workUrl: "https://psx.example.com/dashboard/design-3d",
    ...overrides,
  };
}

/**
 * TOÀN BỘ nội dung tin nhắn dưới dạng một chuỗi — gồm `text`, thẻ, VÀ bản chữ dự phòng.
 *
 * Các test múi giờ phải soi cả ba: chi tiết giờ nay nằm trong thẻ chứ không còn trong `text`,
 * và bản dự phòng cũng là thứ nhân viên sẽ đọc khi thẻ bị từ chối. Soi mỗi `text` như bản
 * trước thì một mốc giờ sai trong thẻ sẽ lọt qua hết.
 */
const allText = (payload: { text: string } | null) => JSON.stringify(payload);

describe("Múi giờ trong tin nhắn — CHỖ NGUY HIỂM NHẤT", () => {
  // Dự án đã từng có bug deadline lệch 7 tiếng vì dùng giờ máy chủ (Vercel chạy UTC). Trong
  // tin nhắn Chat thì bug đó TỆ HƠN: nhân viên không có gì để đối chiếu, họ tin luôn số sai.
  it("deadline hiện theo GIỜ VIỆT NAM, không phải giờ máy chủ", () => {
    expect(formatVnDeadline(vn("2026-08-10T14:27:00"))).toBe("14:27 ngày 10/08/2026");
  });

  it("KHÔNG được hiện 07:27 (giờ UTC của cùng mốc đó) — soi cả thẻ và bản dự phòng", () => {
    const all = allText(buildNewAssignmentMessage(notice()));
    expect(all).toContain("14:27");
    expect(all).not.toContain("07:27");
  });

  it("mốc gần nửa đêm không bị lệch sang ngày khác", () => {
    // 00:30 giờ VN ngày 11/08 = 17:30 UTC ngày 10/08. Nếu render theo UTC sẽ ra ngày 10.
    expect(formatVnDeadline(vn("2026-08-11T00:30:00"))).toBe("00:30 ngày 11/08/2026");
  });

  it("không bao giờ để lọt định dạng ISO thô vào tin nhắn", () => {
    const all = allText(buildNewAssignmentMessage(notice()));
    expect(all).not.toContain("T14:27");
    expect(all).not.toContain("Z");
  });
});

describe("Thẻ Google Chat — vì sao không dùng chữ thuần nữa", () => {
  it("LINK THÀNH NÚT, không dán URL nguyên văn vào chữ", () => {
    // Bản trước in "Mở việc: https://example.vercel.app/dashboard/design-3d"
    // và URL tự xuống dòng giữa chừng — chiếm hai dòng cho một hành động.
    const payload = buildNewAssignmentMessage(notice());
    expect(payload.text).not.toContain("https://");
    expect(JSON.stringify(payload.cardsV2)).toContain('"text":"Mở việc"');
    expect(JSON.stringify(payload.cardsV2)).toContain("psx.example.com");
  });

  it("`text` chỉ MỘT DÒNG — nó là dòng hiện ở danh sách hội thoại và thông báo đẩy", () => {
    // Nhồi cả chi tiết vào `text` là hiện hai lần cùng một nội dung (một lần ở text, một ở thẻ).
    const payload = buildNewAssignmentMessage(notice());
    expect(payload.text).toBe("*N8n* — có việc thiết kế 3D mới");
    expect(payload.text).not.toContain("\n");
  });

  it("MO làm tiêu đề thẻ, sản phẩm làm phụ đề — thứ bậc thật, không phải bốn dòng bằng nhau", () => {
    const card = buildNewAssignmentMessage(notice()).cardsV2![0].card as Record<string, never>;
    // Đầu vào là "26.42432.1" (đúng như DB lưu) — đầu ra hiện "_" cho đồng nhất với
    // mọi màn hình. Tin nhắn Chat nằm lại vĩnh viễn và người ta copy mã từ đó đi tìm.
    expect(card.header).toEqual({ title: "26.42432_1", subtitle: "Vỏ vòng xoàn" });
  });

  it("ĐỊNH DẠNG TRONG THẺ LÀ HTML, không phải Markdown", () => {
    // Dùng lẫn hai hệ là chữ hiện ra kèm luôn dấu sao — đúng loại lỗi làm tin trông cẩu thả.
    const card = JSON.stringify(buildNewAssignmentMessage(notice()).cardsV2);
    expect(card).toContain("<b>");
    expect(card).not.toContain("*14:27");
  });

  it("thoát ký tự HTML trong dữ liệu người dùng nhập", () => {
    // Tên sản phẩm có "<" sẽ phá vỡ thẻ, hoặc tệ hơn là chèn được thẻ HTML lạ.
    const card = JSON.stringify(
      buildNewAssignmentMessage(notice({ groupName: "Nhóm <b>2</b>" })).cardsV2,
    );
    expect(card).toContain("&lt;b&gt;");
  });

  it("LUÔN có bản chữ dự phòng — không test được thẻ với API thật", () => {
    // Thiếu nó thì một payload sai khiến nhân viên MẤT HẲN thông báo: đổi một lỗi thẩm mỹ
    // thành một lỗi chức năng.
    const payload = buildNewAssignmentMessage(notice());
    expect(payload.fallbackText).toContain("26.42432_1");
    expect(payload.fallbackText).toContain("14:27");
    // Bản dự phòng dùng cú pháp link của Chat, không dán URL trơ.
    expect(payload.fallbackText).toContain("|Mở việc>");
  });

  it("kèm khoảng còn lại cạnh mốc tuyệt đối khi biết 'bây giờ'", () => {
    // "09:41 12/08" một mình không nói được gấp hay không — người đọc phải tự trừ trong đầu.
    const all = allText(buildNewAssignmentMessage(notice(), vn("2026-08-10T10:27:00")));
    expect(all).toContain("còn 4 giờ");
  });

  it("không truyền 'bây giờ' → chỉ mốc tuyệt đối, không đoán bừa", () => {
    expect(allText(buildNewAssignmentMessage(notice()))).not.toContain("còn ");
  });
});

describe("Tin nhắn một lượt giao việc", () => {
  it("tên nhân viên ở DÒNG ĐẦU, in đậm — để cả phòng quét mắt là bỏ qua được tin không phải của mình", () => {
    const text = buildNewAssignmentMessage(notice()).text;
    expect(text.split("\n")[0]).toBe("*N8n* — có việc thiết kế 3D mới");
  });

  it("có đủ MO, sản phẩm, nhóm KPI kèm số giờ, deadline, link", () => {
    const all = allText(buildNewAssignmentMessage(notice()));
    expect(all).toContain("26.42432_1");
    expect(all).toContain("Vỏ vòng xoàn");
    expect(all).toContain("Nhóm 2");
    expect(all).toContain("4 giờ");
    expect(all).toContain("https://psx.example.com/dashboard/design-3d");
  });

  it("KHÔNG chứa tên khách hàng — Space là kênh chung của cả phòng", () => {
    // Kiểu AssignmentNotice cố ý không có trường khách hàng, nên không thể lọt vào.
    const all = allText(buildNewAssignmentMessage(notice()));
    expect(all).not.toContain("Testing4");
    expect(all.toLowerCase()).not.toContain("khách");
  });

  it("thiếu dữ liệu → hiện gạch ngang, không hiện 'undefined'", () => {
    const all = allText(buildNewAssignmentMessage(
      notice({ moNumber: null, productName: null, groupName: null }),
    ));
    expect(all).not.toContain("undefined");
    expect(all).not.toContain("null");
  });

  it("không có link → bỏ hẳn nút, không để nút trơ không bấm được", () => {
    const payload = buildNewAssignmentMessage(notice({ workUrl: null }));
    expect(JSON.stringify(payload.cardsV2)).not.toContain("buttonList");
    expect(payload.fallbackText).not.toContain("Mở việc");
    expect(payload.fallbackText?.endsWith("\n")).toBe(false);
  });
});

describe("Gộp nhiều lượt thành MỘT tin nhắn", () => {
  // Một lần lưu đơn nhiều MO có thể tạo nhiều lượt giao việc. Gửi rời sẽ dồn 5 tin vào Space
  // cùng lúc — đúng kiểu làm người ta tắt thông báo.
  it("không có lượt nào → null, không gửi tin rỗng", () => {
    expect(buildAssignmentBatchMessage([])).toBeNull();
  });

  it("một lượt → dùng đúng tin đơn lẻ, không thêm phần đầu 'Có N việc'", () => {
    expect(buildAssignmentBatchMessage([notice()])).toEqual(buildNewAssignmentMessage(notice()));
  });

  it("nhiều lượt → MỘT tin, MỘT section mỗi nhân viên", () => {
    const payload = buildAssignmentBatchMessage([
      notice({ moNumber: "26.001.1" }),
      notice({ moNumber: "26.002.1" }),
      notice({ designerName: "Việt 3D", moNumber: "26.003.1" }),
    ]);
    expect(payload!.text).toContain("Có *3* việc thiết kế 3D mới");

    const card = payload!.cardsV2![0].card as { sections: Array<{ header: string }> };
    // Mỗi nhân viên chỉ xuất hiện MỘT lần làm tiêu đề section (+1 section cho nút).
    expect(card.sections.filter((s) => s.header === "N8n")).toHaveLength(1);
    expect(card.sections.filter((s) => s.header === "Việt 3D")).toHaveLength(1);

    const all = allText(payload);
    for (const mo of ["26.001_1", "26.002_1", "26.003_1"]) expect(all).toContain(mo);
  });

  it("tin gộp cũng có bản chữ dự phòng, nhóm theo nhân viên", () => {
    const fallback = buildAssignmentBatchMessage([
      notice({ moNumber: "26.001.1" }),
      notice({ designerName: "Việt 3D", moNumber: "26.003.1" }),
    ])!.fallbackText!;
    expect(fallback.match(/\*N8n\*/g)?.length).toBe(1);
    expect(fallback).toContain("*Việt 3D*");
  });

  it("mọi deadline trong tin gộp cũng theo giờ VN", () => {
    const all = allText(buildAssignmentBatchMessage([
      notice({ moNumber: "A" }),
      notice({ moNumber: "B", deadlineAt: vn("2026-08-11T00:30:00") }),
    ]));
    expect(all).toContain("14:27 ngày 10/08/2026");
    expect(all).toContain("00:30 ngày 11/08/2026");
  });
});

describe("Rào an toàn cho URL webhook", () => {
  it("chỉ nhận URL thuộc chat.googleapis.com", () => {
    expect(isAllowedChatWebhook("https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t")).toBe(true);
  });

  it.each([
    ["domain lạ — đường rò rỉ dữ liệu đơn hàng", "https://ke-xau.example.com/collect"],
    ["giả dạng bằng tiền tố", "https://chat.googleapis.com.ke-xau.example.com/x"],
    ["http không mã hoá", "http://chat.googleapis.com/v1/spaces/AAA/messages"],
    ["không phải URL", "khong-phai-url"],
    ["rỗng", ""],
  ])("từ chối %s", (_label, url) => {
    expect(isAllowedChatWebhook(url)).toBe(false);
  });

  it("che key và token trước khi ghi log — hai bí mật nằm ngay trong query string", () => {
    const redacted = redactWebhookUrl(
      "https://chat.googleapis.com/v1/spaces/AAQAFAKESPACE/messages?key=AIzaSyREAL_SECRET&token=REAL_TOKEN",
    );
    expect(redacted).not.toContain("AIzaSyREAL_SECRET");
    expect(redacted).not.toContain("REAL_TOKEN");
    // Vẫn giữ định danh Space để lần ra được Space nào lỗi.
    expect(redacted).toContain("AAQAFAKESPACE");
  });

  it("URL rác cũng không ném lỗi khi che", () => {
    expect(() => redactWebhookUrl("rac")).not.toThrow();
  });
});

// ─── Tin nhắn khai báo tăng ca ───────────────────────────────────────────────
//
// Đây là kênh DUY NHẤT chạm tới người duyệt khi họ không mở app: huy hiệu trên tab chỉ giúp người
// đã ở trong màn hình. Một khai báo nằm chờ vài ngày là tiền lương nhân viên bị treo.
const OT = {
  designerName: "N8N",
  moNumber: "26.42432.1",
  productName: "Vòng tay xoàn",
  startAt: vn("2026-08-13T06:26:00"),
  endAt: vn("2026-08-13T07:26:00"),
  minutes: 60,
  reason: null as string | null,
  overlapMinutes: 0,
  workUrl: null as string | null,
};

describe("buildOvertimeRequestMessage", () => {
  // `text` là dòng hiện trong danh sách hội thoại VÀ trong thông báo đẩy trên điện thoại — nó
  // phải trả lời "ai, bao nhiêu, cần gì ở tôi" TRƯỚC KHI người ta mở ra.
  it("dòng đầu nói đủ ai / bao nhiêu / cần gì", () => {
    const p = buildOvertimeRequestMessage(OT);
    expect(p.text).toContain("N8N");
    expect(p.text).toContain("1 giờ");
    expect(p.text).toContain("chờ duyệt");
  });

  it("cùng một ngày → gộp ngày, không lặp lại hai lần", () => {
    const p = buildOvertimeRequestMessage(OT);
    const card = JSON.stringify(p.cardsV2);
    expect(card).toContain("06:26 → 07:26 ngày 13/08/2026");
  });

  it("qua đêm → ghi đủ ngày ở CẢ HAI đầu", () => {
    const p = buildOvertimeRequestMessage({
      ...OT,
      startAt: vn("2026-08-13T22:00:00"),
      endAt: vn("2026-08-14T01:00:00"),
      minutes: 180,
    });
    const card = JSON.stringify(p.cardsV2);
    expect(card).toContain("13/08/2026");
    expect(card).toContain("14/08/2026");
  });

  // ⚠️ Tăng ca theo định nghĩa là làm NGOÀI giờ. Phần rơi vào giờ hành chính là thứ người duyệt
  // cần soát — hệ thống cố ý không chặn cứng vì có ca đặc thù hợp lệ, nên cảnh báo phải tới được
  // mắt người quyết định.
  it("có phần rơi vào giờ hành chính → hiện cảnh báo", () => {
    const p = buildOvertimeRequestMessage({ ...OT, overlapMinutes: 30 });
    expect(JSON.stringify(p.cardsV2)).toContain("giờ hành chính");
    expect(p.fallbackText).toContain("giờ hành chính");
  });

  // Chỉ hiện KHI CÓ. Một dòng "0 phút trong giờ hành chính" ở mọi tin sẽ bị mắt bỏ qua — và bỏ
  // qua luôn cái dòng đó vào hôm nó khác 0.
  it("không rơi vào giờ hành chính → KHÔNG có dòng nào về nó", () => {
    const p = buildOvertimeRequestMessage(OT);
    expect(JSON.stringify(p.cardsV2)).not.toContain("giờ hành chính");
  });

  it("không có lý do → không đẻ ra một dòng trống", () => {
    expect(JSON.stringify(buildOvertimeRequestMessage(OT))).not.toContain("Lý do");
  });

  // Thẻ có thể bị Google Chat từ chối (đổi schema, icon lạ) — luôn phải có bản chữ để gửi lại,
  // nếu không thì trường hợp xấu là MẤT HẲN thông báo.
  it("luôn kèm bản chữ dự phòng", () => {
    const p = buildOvertimeRequestMessage(OT);
    expect(p.fallbackText).toBeTruthy();
    expect(p.fallbackText).toContain("N8N");
  });

  // KHÔNG có test "không lộ tên khách": OvertimeNotice không hề có trường khách hàng, nên một
  // phép kiểm ở đây sẽ luôn xanh mà không chứng minh gì. Chốt chặn thật nằm ở câu `select` của
  // notifyNewOvertimeRequest — cùng chỗ, cùng lý do với tin giao việc.
});

// ─── Đổi ưu tiên thiết kế 3D ─────────────────────────────────────────────────

describe("buildDesignPriorityChangedMessage", () => {
  const CHANGE: DesignPriorityChangeNotice = {
    designerNames: ["N8n"],
    moNumber: "26.42432.1",
    productName: "Vỏ vòng xoàn",
    fromLabel: "Bình thường",
    toLabel: "UT1 — Siêu gấp",
    raised: true,
    changedByName: "Duy",
    workUrl: "https://psx.example.com/dashboard/design-3d",
  };

  // ĐIỀU KIỆN CỨNG của cả tính năng: chưa giao việc thì không có ai cần biết. Trả null để chỗ gọi
  // không phải tự nhớ luật — nhớ luật ở hai nơi thì một nơi sẽ quên.
  it("chưa có ai đang làm → không dựng tin nhắn", () => {
    expect(buildDesignPriorityChangedMessage({ ...CHANGE, designerNames: [] })).toBeNull();
  });

  // Space còn nhận tin về ưu tiên của ĐƠN HÀNG, cũng mang chữ "UT1". Hai loại tin trơ giống nhau
  // thì người đọc xử lý sai đúng lúc cần xử lý đúng.
  it("dòng đầu nói rõ là ưu tiên THIẾT KẾ, không phải của đơn", () => {
    const p = buildDesignPriorityChangedMessage(CHANGE)!;
    expect(p.text).toContain("Ưu tiên thiết kế");
  });

  it("nêu cả bậc cũ và bậc mới — chỉ có bậc mới thì không biết đã đổi bao nhiêu", () => {
    const p = buildDesignPriorityChangedMessage(CHANGE)!;
    const card = JSON.stringify(p.cardsV2);
    expect(card).toContain("Bình thường");
    expect(card).toContain("UT1 — Siêu gấp");
  });

  // Nâng và hạ đòi hai hành động trái ngược. Một câu chung chung ("ưu tiên đã đổi") buộc người
  // đọc tự suy, và suy sai thì làm sai thứ tự.
  it("nâng ưu tiên → bảo làm trước; hạ ưu tiên → KHÔNG bảo làm trước", () => {
    const up = buildDesignPriorityChangedMessage(CHANGE)!;
    expect(up.fallbackText).toContain("trước");

    const down = buildDesignPriorityChangedMessage({
      ...CHANGE,
      fromLabel: "UT1 — Siêu gấp",
      toLabel: "Bình thường",
      raised: false,
    })!;
    expect(down.fallbackText).not.toContain("dựng MO này trước");
    expect(down.fallbackText).toContain("nhường chỗ");
  });

  // Người nhận cần biết hỏi lại AI, không phải "hệ thống".
  it("nêu tên người điều chỉnh", () => {
    expect(JSON.stringify(buildDesignPriorityChangedMessage(CHANGE))).toContain("Duy");
  });

  it("nhiều người cùng giữ MO → nêu đủ tên", () => {
    const p = buildDesignPriorityChangedMessage({ ...CHANGE, designerNames: ["N8n", "Kim"] })!;
    expect(p.fallbackText).toContain("N8n");
    expect(p.fallbackText).toContain("Kim");
  });

  // Cùng lý do với hai loại tin trên: thẻ có thể bị Google Chat từ chối, mất thẻ không được phép
  // thành mất thông báo.
  it("luôn kèm bản chữ dự phòng", () => {
    expect(buildDesignPriorityChangedMessage(CHANGE)!.fallbackText).toBeTruthy();
  });
});
