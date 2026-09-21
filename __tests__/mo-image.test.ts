import { describe, expect, it } from "vitest";

import {
  IMAGE_PATH_PREFIX,
  MAX_SAMPLE_IMAGES,
  addSampleImage,
  buildImagePath,
  pathFromPublicUrl,
  publicImageUrl,
  removeSampleImage,
  resolveMoImageSource,
  validateImageUpload,
} from "@/app/lib/business/mo-image";

describe("validateImageUpload — chốt chặn cuối phía server", () => {
  it("JPEG/PNG/WEBP hợp lệ, dung lượng nhỏ → cho qua", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateImageUpload({ contentType, size: 300_000 })).toBeNull();
    }
  });

  it("loại file khác (PDF, SVG…) → chặn", () => {
    expect(validateImageUpload({ contentType: "application/pdf", size: 1000 })).toContain("JPEG");
    expect(validateImageUpload({ contentType: "image/svg+xml", size: 1000 })).not.toBeNull();
  });

  it("dung lượng 0 hoặc âm → chặn (không tin dữ liệu client gửi lên)", () => {
    expect(validateImageUpload({ contentType: "image/jpeg", size: 0 })).not.toBeNull();
    expect(validateImageUpload({ contentType: "image/jpeg", size: -5 })).not.toBeNull();
  });

  it("vượt 8MB → chặn, dù browser đã thu nhỏ trước (chốt chặn cuối, không tin client)", () => {
    const reason = validateImageUpload({ contentType: "image/jpeg", size: 9 * 1024 * 1024 });
    expect(reason).toContain("8MB");
  });

  it("đúng 8MB (biên) → vẫn cho qua", () => {
    expect(validateImageUpload({ contentType: "image/jpeg", size: 8 * 1024 * 1024 })).toBeNull();
  });
});

describe("buildImagePath — CHỨA MÃ NGẪU NHIÊN để bucket công khai không bị dò", () => {
  it("hai lần build cho CÙNG item ra hai path KHÁC NHAU khi không truyền random cố định", () => {
    const a = buildImagePath({ orderItemId: "item-1", contentType: "image/jpeg" });
    const b = buildImagePath({ orderItemId: "item-1", contentType: "image/jpeg" });
    expect(a).not.toBe(b);
  });

  it("đuôi file khớp đúng contentType", () => {
    expect(buildImagePath({ orderItemId: "item-1", contentType: "image/png", random: "abc" })).toMatch(/\.png$/);
    expect(buildImagePath({ orderItemId: "item-1", contentType: "image/webp", random: "abc" })).toMatch(/\.webp$/);
    expect(buildImagePath({ orderItemId: "item-1", contentType: "image/jpeg", random: "abc" })).toMatch(/\.jpg$/);
  });

  it("path chứa orderItemId để phân theo từng item", () => {
    expect(buildImagePath({ orderItemId: "item-42", contentType: "image/jpeg", random: "x" })).toContain("item-42");
  });
});

describe("publicImageUrl — ghép URL công khai", () => {
  it("ghép đúng base + bucket + path", () => {
    const url = publicImageUrl({ supabaseUrl: "https://abcde.supabase.co", bucket: "mo-images", path: "mo/item-1/x.jpg" });
    expect(url).toBe("https://abcde.supabase.co/storage/v1/object/public/mo-images/mo/item-1/x.jpg");
  });

  it("base có dấu / thừa ở cuối → không bị lặp dấu /", () => {
    const url = publicImageUrl({ supabaseUrl: "https://abcde.supabase.co/", bucket: "mo-images", path: "x.jpg" });
    expect(url).not.toContain("co//storage");
  });
});

describe("resolveMoImageSource — BA TẦNG ưu tiên, quyết định nằm ở ĐÂY không phải trong JSX", () => {
  it("có ảnh đại diện → ưu tiên ảnh đó, link Drive vẫn trả về song song", () => {
    const result = resolveMoImageSource({
      designImageUrl: "https://abcde.supabase.co/storage/v1/object/public/mo-images/x.jpg",
      designFileUrl: "https://drive.google.com/drive/folders/abc",
    });
    expect(result.uploadedImageUrl).toContain("mo-images");
    expect(result.driveLinkUrl).toContain("drive.google.com");
  });

  it("chỉ có link Drive, chưa upload ảnh → uploadedImageUrl null, driveLinkUrl có", () => {
    const result = resolveMoImageSource({ designImageUrl: null, designFileUrl: "https://drive.google.com/file/d/x/view" });
    expect(result.uploadedImageUrl).toBeNull();
    expect(result.driveLinkUrl).not.toBeNull();
  });

  it("không có gì → cả hai null", () => {
    expect(resolveMoImageSource({ designImageUrl: null, designFileUrl: null })).toEqual({
      uploadedImageUrl: null,
      driveLinkUrl: null,
    });
  });

  it("chuỗi rỗng/toàn khoảng trắng coi như không có", () => {
    const result = resolveMoImageSource({ designImageUrl: "   ", designFileUrl: "" });
    expect(result.uploadedImageUrl).toBeNull();
    expect(result.driveLinkUrl).toBeNull();
  });
});

// ─── Hai khe ảnh dùng chung một bucket ───────────────────────────────────────

describe("IMAGE_PATH_PREFIX — hai khe không được giẫm chân nhau", () => {
  // 🔴 Xoá ảnh của một khe quét theo tiền tố. Một tiền tố nằm trong tiền tố kia là xoá khe này
  // chạm khe kia — mất ảnh của MO mà không có lỗi nào báo.
  it("không tiền tố nào là tiền tố của tiền tố khác", () => {
    const all = Object.values(IMAGE_PATH_PREFIX);
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        expect(a.startsWith(b), `"${a}" bắt đầu bằng "${b}"`).toBe(false);
      }
    }
  });

  it("không tiền tố nào rỗng — rỗng là ghi thẳng vào gốc bucket", () => {
    for (const p of Object.values(IMAGE_PATH_PREFIX)) expect(p.length).toBeGreaterThan(0);
  });
});

describe("buildImagePath — theo khe ảnh", () => {
  // Mặc định phải là "mo": ảnh đại diện đã có dữ liệu thật trên production ở đường dẫn đó, và
  // một chỗ gọi quên truyền prefix KHÔNG được làm ảnh mới rơi sang thư mục khác.
  it("thiếu prefix → giữ nguyên đường cũ của ảnh đại diện", () => {
    const path = buildImagePath({ orderItemId: "item1", contentType: "image/png", random: "r" });
    expect(path).toBe("mo/item1/r.png");
  });

  it("khe ảnh mẫu đi vào thư mục riêng", () => {
    const path = buildImagePath({
      orderItemId: "item1", contentType: "image/jpeg",
      prefix: IMAGE_PATH_PREFIX.sample, random: "r",
    });
    expect(path).toBe("sample/item1/r.jpg");
  });
});

describe("pathFromPublicUrl — HÀM NGƯỢC của publicImageUrl", () => {
  const supabaseUrl = "https://abc.supabase.co";
  const bucket = "mo-images";

  // 🔴 BẤT BIẾN THEN CHỐT. Hai hàm này từng ở HAI FILE (một trong module, một riêng tư trong
  // route). Lệch nhau thì không có lỗi nào báo: chỉ là xoá trượt object (rác vĩnh viễn trong
  // bucket) hoặc xoá trúng file của MO khác.
  it("bóc lại ĐÚNG path đã ghép, ở mọi khe", () => {
    for (const prefix of Object.values(IMAGE_PATH_PREFIX)) {
      const path = buildImagePath({ orderItemId: "it1", contentType: "image/webp", prefix, random: "xyz" });
      const url = publicImageUrl({ supabaseUrl, bucket, path });
      expect(pathFromPublicUrl(url, bucket), prefix).toBe(path);
    }
  });

  it("URL không thuộc bucket này → null, KHÔNG phải đoán bừa một path", () => {
    expect(pathFromPublicUrl("https://drive.google.com/file/d/abc/view", bucket)).toBeNull();
    expect(pathFromPublicUrl("", bucket)).toBeNull();
  });

  it("bucket khác tên → null, không xoá nhầm sang bucket bên cạnh", () => {
    const url = publicImageUrl({ supabaseUrl, bucket: "khac", path: "mo/it/1.jpg" });
    expect(pathFromPublicUrl(url, bucket)).toBeNull();
  });
});

describe("Danh sách ảnh mẫu — trần ép ở TẦNG LUẬT, không phải ở giao diện", () => {
  const A = "https://x/a.jpg";
  const B = "https://x/b.jpg";
  const C = "https://x/c.jpg";

  it("thêm vào danh sách rỗng", () => {
    expect(addSampleImage([], A)).toEqual([A]);
  });

  it(`đầy ${MAX_SAMPLE_IMAGES} ảnh → TỪ CHỐI, trả null chứ không cắt bớt`, () => {
    // Trả null để chỗ gọi phân biệt "đã thêm" với "từ chối vì đầy" — nó cần biết để KHÔNG ghi
    // vào DB một file vừa upload nhưng thực ra bị loại.
    expect(addSampleImage([A, B], C)).toBeNull();
  });

  it("thêm TRÙNG URL không sinh mục thứ hai", () => {
    expect(addSampleImage([A], A)).toEqual([A]);
  });

  it("URL rỗng / chỉ khoảng trắng → từ chối", () => {
    expect(addSampleImage([], "")).toBeNull();
    expect(addSampleImage([], "   ")).toBeNull();
  });

  it("cắt khoảng trắng trước khi so trùng", () => {
    expect(addSampleImage([A], `  ${A}  `)).toEqual([A]);
  });

  it("KHÔNG sửa mảng gốc", () => {
    const src = [A];
    addSampleImage(src, B);
    expect(src).toEqual([A]);
  });

  it("bỏ đúng một ảnh, giữ nguyên ảnh còn lại", () => {
    expect(removeSampleImage([A, B], A)).toEqual([B]);
  });

  it("bỏ ảnh không có trong danh sách → danh sách nguyên vẹn", () => {
    expect(removeSampleImage([A], C)).toEqual([A]);
  });

  it("thêm rồi bỏ → về đúng trạng thái ban đầu", () => {
    const after = addSampleImage([A], B);
    expect(after).not.toBeNull();
    expect(removeSampleImage(after!, B)).toEqual([A]);
  });
});
