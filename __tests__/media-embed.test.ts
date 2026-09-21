import { describe, expect, it } from "vitest";

import { extractYoutubeId, resolveVideoEmbed } from "@/app/lib/business/media-embed";

// Nhận dạng sai ở đây KHÔNG ném lỗi — nó cho ra một ô đen câm hoặc một khung Drive báo "cần
// quyền", và người dùng chỉ biết là "video không xem được". Nên phần bóc link phải có test.

describe("Bóc video ID của YouTube", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
  ])("%s → %s", (url, id) => {
    expect(extractYoutubeId(url)).toBe(id);
  });

  it("không phải YouTube → null", () => {
    expect(extractYoutubeId("https://vimeo.com/12345")).toBeNull();
    expect(extractYoutubeId("khong-phai-url")).toBeNull();
    expect(extractYoutubeId(null)).toBeNull();
  });
});

describe("Quyết định cách xem video trong webapp", () => {
  it("link Drive → iframe /preview, KHÔNG phải /view", () => {
    const r = resolveVideoEmbed("https://drive.google.com/file/d/ABC123/view?usp=drivesdk");
    expect(r).toEqual({ kind: "iframe", src: "https://drive.google.com/file/d/ABC123/preview" });
  });

  it("link YouTube → iframe /embed", () => {
    const r = resolveVideoEmbed("https://youtu.be/dQw4w9WgXcQ");
    expect(r).toEqual({ kind: "iframe", src: "https://www.youtube.com/embed/dQw4w9WgXcQ" });
  });

  it("link file .mp4 trực tiếp → thẻ video", () => {
    const r = resolveVideoEmbed("https://cdn.example.com/clip.MP4");
    expect(r).toEqual({ kind: "video", src: "https://cdn.example.com/clip.MP4" });
  });

  it("link Drive có 'mp4' trong query KHÔNG bị nhận nhầm là file trực tiếp", () => {
    // Thứ tự thử quan trọng: xét host trước, đuôi file sau. Ngược lại thì thẻ <video> sẽ trỏ
    // vào trang HTML của Drive và hiện một ô đen câm, không báo lỗi gì.
    const r = resolveVideoEmbed("https://drive.google.com/file/d/XYZ/view?name=clip.mp4");
    expect(r.kind).toBe("iframe");
  });

  it("chặn javascript: và data: — không cho lọt vào src", () => {
    expect(resolveVideoEmbed("javascript:alert(1)//a.mp4").kind).toBe("none");
    expect(resolveVideoEmbed("data:video/mp4;base64,AAAA").kind).toBe("none");
  });

  it("link không nhận dạng được → none, để giao diện rơi về link chữ", () => {
    expect(resolveVideoEmbed("https://vimeo.com/12345").kind).toBe("none");
    expect(resolveVideoEmbed("drive.google.com/file/d/ABC/view").kind).toBe("none"); // thiếu https://
    expect(resolveVideoEmbed("   ").kind).toBe("none");
    expect(resolveVideoEmbed(null).kind).toBe("none");
  });
});
