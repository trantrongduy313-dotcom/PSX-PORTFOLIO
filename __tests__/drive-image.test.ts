import { describe, expect, it } from "vitest";

import { driveThumbnailUrl, extractDriveFileId } from "@/app/lib/business/drive-image";

// Link trong DB (OrderItem.designFileUrl) là link Drive dạng người-bấm-vào, KHÔNG phải ảnh.
// Trỏ <img src> thẳng vào nó sẽ ra trang HTML của Drive chứ không ra hình. Phải bóc file ID
// rồi dựng URL thumbnail. Drive có nhiều dạng URL tuỳ chỗ người dùng copy ra.

const REAL_ID = "1h_GrsZk2rvNslsGrNYjz4jIovT0RGlgC";

describe("extractDriveFileId — bóc ID từ các dạng link Drive", () => {
  it("dạng phổ biến nhất: copy từ nút Share", () => {
    // Đây đúng dạng đang có trong dữ liệu thật — hậu tố `?usp=drivesdk` là dấu vết của link
    // được tạo qua Drive SDK, và đó là dạng chiếm gần như toàn bộ dữ liệu link ảnh MO.
    //
    // Trước đây dòng này trỏ sang `mo_drive_links.csv` ở thư mục gốc. File đó đã được xoá
    // (dữ liệu đã vào DB), nên ghi lại ĐẶC ĐIỂM ngay tại đây thay vì trỏ sang một file — một
    // chú thích trỏ vào chỗ không còn gì thì tệ hơn không có chú thích.
    expect(extractDriveFileId(`https://drive.google.com/file/d/${REAL_ID}/view?usp=drivesdk`)).toBe(REAL_ID);
  });

  it.each([
    ["không có query", `https://drive.google.com/file/d/${REAL_ID}/view`],
    ["dạng link cũ /open", `https://drive.google.com/open?id=${REAL_ID}`],
    ["dạng tải trực tiếp /uc", `https://drive.google.com/uc?id=${REAL_ID}&export=view`],
    ["dạng rút gọn /d/", `https://drive.google.com/d/${REAL_ID}/view`],
    ["host docs.google.com", `https://docs.google.com/file/d/${REAL_ID}/edit`],
    ["có khoảng trắng thừa hai đầu", `  https://drive.google.com/file/d/${REAL_ID}/view  `],
  ])("%s", (_label, url) => {
    expect(extractDriveFileId(url)).toBe(REAL_ID);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["chuỗi rỗng", ""],
    ["không phải URL", "chi-la-mot-dong-chu"],
    ["Drive nhưng không có ID", "https://drive.google.com/drive/my-drive"],
  ])("%s → null, không ném lỗi", (_label, url) => {
    expect(() => extractDriveFileId(url)).not.toThrow();
    expect(extractDriveFileId(url)).toBeNull();
  });

  it("host lạ → null, KHÔNG biến URL bất kỳ thành lời gọi ra ngoài", () => {
    // Nếu nhận bừa mọi host, một link do người dùng dán vào có thể thành nơi ta đi tải ảnh.
    expect(extractDriveFileId(`https://ke-xau.example.com/file/d/${REAL_ID}/view`)).toBeNull();
    expect(extractDriveFileId(`https://drive.google.com.ke-xau.example.com/file/d/${REAL_ID}/view`)).toBeNull();
  });
});

describe("driveThumbnailUrl — dựng URL cho thẻ <img>", () => {
  it("dựng đúng endpoint thumbnail kèm chiều rộng", () => {
    const url = driveThumbnailUrl(`https://drive.google.com/file/d/${REAL_ID}/view`, 400);
    expect(url).toBe(`https://drive.google.com/thumbnail?id=${REAL_ID}&sz=w400`);
  });

  it("đổi chiều rộng theo cỡ ô hiển thị — ảnh render 3D rất nặng, không tải bản gốc", () => {
    expect(driveThumbnailUrl(`https://drive.google.com/file/d/${REAL_ID}/view`, 200))
      .toContain("sz=w200");
  });

  it("link không bóc được ID → null để giao diện rơi về link chữ như hiện tại", () => {
    // Đây là nhánh giữ cho trường hợp xấu nhất KHÔNG tệ hơn hiện trạng.
    expect(driveThumbnailUrl("https://mot-noi-khac.example.com/anh.png")).toBeNull();
    expect(driveThumbnailUrl(null)).toBeNull();
  });

  it("ID được mã hoá vào query, không ghép chuỗi thô", () => {
    const url = driveThumbnailUrl("https://drive.google.com/open?id=a b/c");
    expect(url).toContain("a%20b%2Fc");
  });
});
