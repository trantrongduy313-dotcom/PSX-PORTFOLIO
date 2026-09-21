// ⚠️ FILE NÀY ĐƯỢC SINH RA TỰ ĐỘNG — ĐỪNG SỬA TAY.
//
// Nguồn: app/lib/ai/knowledge/*.md
// Sinh lại: npm run kb:build
//
// Sửa tay thì lần chạy `kb:build` kế tiếp xoá mất, và trong khoảng giữa thì checksum lệch
// nên test đỏ. Muốn đổi nội dung thì sửa file .md tương ứng.

import type { KnowledgeTopic } from "@/app/lib/business/ai/topic";

/** Dấu vân tay của các file .md nguồn. Test đối chiếu con số này — xem knowledge.ts. */
export const KNOWLEDGE_CHECKSUM = "1e1af39e";

export const KNOWLEDGE_TOPICS: readonly KnowledgeTopic[] = [
  // 00-tong-quan.md
  {
    id: "tong-quan",
    title: "Tổng quan hệ thống PSX",
    roles: [],
    lastReviewed: "2026-08",
    body: "PSX là hệ thống quản lý sản xuất trang sức nội bộ.\n\n## Hai khái niệm cốt lõi\n\n- **SO (Sales Order)** — đơn bán hàng lấy từ hệ thống Odoo, mã dạng `26.12345`. Một SO có thể\n  chứa nhiều mã hàng khác nhau.\n- **MO (Manufacturing Order)** — lệnh sản xuất cho từng mã hàng cụ thể trong SO. Một SO thường\n  có từ 1 đến 5 MO.\n\n**Mọi con số trong hệ thống đều đếm theo MO, không phải theo SO.** Thấy \"15 đơn đang hoạt động\"\nnghĩa là 15 MO đang được sản xuất, không phải 15 đơn bán hàng.\n\n## Các vai trò\n\n| Vai trò | Phạm vi |\n|---|---|\n| ADMIN — Quản trị viên | Toàn bộ hệ thống |\n| SALES — Kinh doanh | Đơn của cửa hàng mình được gán |\n| ORDER — Xử lý đơn hàng | Tạo đơn, giao việc thiết kế |\n| PRODUCTION — Sản xuất | Dữ liệu sản xuất, cảnh báo |\n| DESIGN_3D — Nhân viên Thiết kế 3D | Chỉ việc thiết kế do mình phụ trách |\n\n## Tìm việc ở đâu\n\n- **Danh sách đơn hàng** — bảng đơn chính. Việc lọc theo cửa hàng nằm ở thanh công cụ **ngay\n  trên bảng**, không nằm ở sidebar.\n- **Việc thiết kế 3D** — màn của nhân viên 3D.\n- **Cảnh báo** — nơi xử lý các cảnh báo đang mở.\n- **Thống kê** — số liệu tổng hợp.\n- Nhóm **Tài liệu** — Hướng dẫn sử dụng, Góp ý của tôi, Có gì mới.\n\n## Báo lỗi và góp ý\n\nNút **Góp ý** dán ở cạnh phải màn hình, luôn có mặt ở mọi trang trong dashboard. Gửi được cả\nbáo lỗi và đề xuất cải tiến, kèm được ảnh chụp màn hình (dán trực tiếp bằng Ctrl+V cũng được).\n\nHệ thống **tự kèm** màn hình đang mở, đơn/MO đang xem và bản build — người gửi không cần gõ lại\nnhững thứ đó.\n\nBáo lỗi thì admin nhận thông báo ngay. Đề xuất cải tiến thì không báo ngay, nhưng vẫn được ghi\nnhận và xem lại được ở mục **Góp ý của tôi**.",
  },
  // 01-so-mo-phien-ban.md
  {
    id: "so-mo-phien-ban",
    title: "Số phiên bản của MO",
    roles: [],
    lastReviewed: "2026-08",
    body: "Khi một MO phải làm lại, hệ thống tạo một **phiên bản mới** thay vì sửa lên bản cũ. Bản cũ được\ngiữ nguyên để còn đọc được lịch sử.\n\n## Cách đọc mã\n\n`26.12345_3` gồm ba phần:\n\n- `26` — năm\n- `12345` — số SO của Odoo\n- `_3` — **phiên bản thứ 3** của MO này\n\nMã không có hậu tố, ví dụ `26.12345`, là mã Odoo hai phần — **không phải** phiên bản 1 ẩn.\n\n## Dấu phân cách: một chỗ dễ nhầm\n\nTrong cơ sở dữ liệu tồn tại **cả hai** dấu phân cách:\n\n- Dữ liệu **cũ** dùng dấu chấm — `26.423343.2`\n- Dữ liệu **mới** chỉ ghi dấu gạch dưới — `26.423343_3`\n\n**Giao diện luôn hiển thị dấu gạch dưới `_`.** Đây thuần là chuyện hiển thị: thuật toán tính\n\"phiên bản lớn nhất + 1\" không thay đổi, và nó nhận diện được cả hai dạng.\n\nHệ quả thực tế cần nhớ:\n\n- Khi **tìm kiếm**, một MO cũ có thể đang được lưu với dấu chấm. Tìm không ra bằng `_` thì thử\n  bằng `.`\n- Việc **kiểm tra trùng MO** phải kiểm cả hai dạng, vì cùng một MO có thể tồn tại ở hai cách\n  ghi khác nhau.\n\n## Đánh số\n\nPhiên bản mới luôn là **số phiên bản lớn nhất đang có, cộng một** — kể cả khi phiên bản ở giữa\nđã bị huỷ. Số phiên bản không được dùng lại.",
  },
  // 02-canh-bao-tam-ngung.md
  {
    id: "canh-bao-tam-ngung",
    title: "Cảnh báo và trạng thái Tạm ngưng",
    roles: ["employee","manager"],
    lastReviewed: "2026-08",
    body: "## Bốn mức cảnh báo\n\n`LOW` · `MEDIUM` · `HIGH` · `CRITICAL`\n\nBa mức đầu chỉ để lưu ý — đơn vẫn chạy bình thường.\n\n**Mức `CRITICAL` thì khác: hệ thống TỰ ĐỘNG tạm ngưng đơn.** Không ai phải bấm gì; đơn chuyển\nsang trạng thái tạm ngưng ngay khi cảnh báo được tạo.\n\n## 🔴 Xử lý cảnh báo KHÔNG tự động chạy lại đơn\n\nĐây là chỗ nhầm nhiều nhất, và nhầm theo hướng tai hại: người xử lý tưởng đơn đã chạy lại, đơn\nthì vẫn nằm im.\n\nĐơn bị tạm ngưng tự động thì có **hai hành động riêng biệt**, và chúng độc lập với nhau:\n\n1. **Xử lý cảnh báo** — đánh dấu cảnh báo đã giải quyết. Đơn **vẫn còn tạm ngưng**.\n2. **Tiếp tục sản xuất** — bỏ trạng thái tạm ngưng để đơn chạy lại.\n\nMuốn đơn chạy lại thì phải làm hành động thứ hai. Chỉ làm hành động thứ nhất là cảnh báo sạch\nnhưng đơn đứng nguyên chỗ.\n\nLưu ý: \"Tiếp tục sản xuất\" chỉ áp dụng cho đơn bị **hệ thống tự động** tạm ngưng. Đơn bị tạm\nngưng vì lý do khác thì hành động này không có tác dụng.\n\n## Các loại cảnh báo\n\n| Loại | Nghĩa |\n|---|---|\n| Cảnh báo đặc biệt | Sinh ra từ ghi chú bán hàng, có thể tự tạm ngưng đơn |\n| Thiếu nguyên liệu | Thiếu nguyên vật liệu |\n| Đơn gấp | Đơn được đánh dấu gấp |\n| Vấn đề chất lượng | Không đạt kiểm tra chất lượng |\n| Thay đổi thiết kế | Thiết kế bị sửa sau khi đã vào sản xuất |\n| Khiếu nại khách hàng | Khách hàng phản ánh |\n\n## Trạng thái của đơn\n\n`DRAFT` → `PENDING_DESIGN` → `IN_DESIGN` → `DESIGN_REVIEW` → `DESIGN_APPROVED` →\n`DESIGN_COMPLETED` → `PENDING_PRODUCTION` → `IN_PRODUCTION` → `QUALITY_CHECK` → `COMPLETED`\n\nNgoài mạch trên có hai trạng thái nằm riêng: `SUSPENDED` (tạm ngưng) và `CANCELLED` (đã huỷ).\n\n**Đơn đã huỷ là kết cục cuối** — không chuyển tiếp sang trạng thái nào khác được.\n\n## Khoá sửa trường quan trọng\n\nTừ trạng thái `IN_PRODUCTION` trở đi, các trường quan trọng của đơn **bị khoá không cho sửa**.\nLý do: xưởng đã bắt đầu làm theo thông số đó, nên sửa số liệu lúc này là làm lệch giữa giấy tờ\nvà vật đang nằm trên bàn.\n\nCần đổi thật thì tạo **phiên bản MO mới**, không sửa lên bản đang chạy.",
  },
  // 03-thiet-ke-3d.md
  {
    id: "thiet-ke-3d",
    title: "Việc thiết kế 3D và KPI",
    roles: ["design3d","manager"],
    lastReviewed: "2026-08",
    body: "## Trình tự một lượt việc\n\n1. Đặt đơn hoặc Admin **giao lượt** cho một nhân viên 3D.\n2. Nhân viên bấm **Xác nhận nhận việc**.\n3. Nhân viên **ghi tiến độ** trong lúc làm.\n4. Nhân viên **gửi kết quả**.\n5. Người có quyền **đánh giá** kết quả.\n\n## Vì sao không ghi được tiến độ\n\nChỉ có ba lý do, và thông báo trên màn hình nói rõ lý do nào:\n\n- **Chưa xác nhận nhận việc.** Phải bấm \"Xác nhận nhận việc\" trước. Đây là lý do hay gặp nhất.\n- **Lượt giao việc đã đóng.** Lượt này kết thúc rồi; cần được giao một lượt mới.\n- **Đang tạm dừng** — nhưng chỉ chặn *gửi kết quả*, xem mục dưới.\n\n## Đang tạm dừng: ghi tiến độ được, gửi kết quả thì không\n\nKhi lượt việc đang bị tạm dừng:\n\n- ✅ **Vẫn ghi được** tiến độ thường — file render, ghi chú. Những dòng này không đụng tới giờ\n  công cũng không đụng deadline.\n- ❌ **Không gửi được kết quả.**\n\nLý do: **tạm dừng là chốt sổ cho phiên đó.** Số giờ của nhân viên được xác nhận ngay tại mốc\ndừng và đi vào KPI của tháng đó. Cho gửi kết quả sau khi đã chốt là đóng dấu \"xong / đúng hạn\"\nlên một phiên đã được chốt bằng một con số khác — hai lần chốt trên cùng một lượt, và không ai\nđọc được cái nào mới là thật.\n\nCần làm tiếp thì Đặt đơn hoặc Admin **giao một lượt mới** ở tab Thiết kế của đơn hàng. Mỗi phiên\nlà một lượt riêng, và KPI tính lại từ đầu cho phiên đó.\n\n## 🔴 Deadline KPI tính theo GIỜ LÀM VIỆC, không phải giờ đồng hồ\n\nĐây là con số bị hiểu sai nhiều nhất.\n\nDeadline đi theo **lịch làm việc đang được cấu hình**, nên nó nhảy qua ngoài giờ, qua ngày nghỉ.\n\nVí dụ cụ thể: giao việc **16:00 thứ Sáu**, nộp **09:00 thứ Hai**.\n\n- Giờ đồng hồ: **65 giờ**\n- Giờ làm việc thật: **khoảng 2 giờ**\n\nNên \"trễ hay không trễ\" không đọc được bằng cách trừ hai mốc thời gian.\n\nVà **\"một ngày làm việc\" không phải 8 giờ mặc định** — nó lấy theo lịch đang cấu hình. Một ngày\nba ca là **7 giờ 50 phút**.\n\n## Nhân viên 3D KHÔNG được tự tạm dừng việc của mình\n\nViệc tạm dừng do Admin, Đặt đơn hoặc Sản xuất thực hiện.\n\nLý do không phải là chuyện tin hay không tin: tạm dừng **vừa trừ giờ thực tế vừa dời deadline**.\nNếu người **đang được chấm điểm** tự bấm được thì con số KPI không còn nghĩa gì — với ai cũng\nvậy, kể cả với chính họ.\n\nCần dừng thì báo Đặt đơn hoặc Admin.\n\n## Phạm vi dữ liệu\n\nNhân viên 3D chỉ xem và chỉ cập nhật được **các lượt việc do mình phụ trách**. Không thấy việc\ncủa người khác.\n\nXác nhận nhận việc thì ngoài nhân viên phụ trách, Admin và Đặt đơn cũng bấm hộ được khi nhân\nviên vắng mặt — và hệ thống ghi lại **ai đã bấm**, nên phân biệt được \"nhân viên tự nhận\" với\n\"Đặt đơn nhận hộ\".",
  },
  // (sinh từ business/ai/glossary.ts)
  {
    id: "thuat-ngu-cong-doan",
    title: "Các khâu sản xuất (cột Công đoạn)",
    roles: [],
    lastReviewed: "2026-08",
    body: "Cột **Công đoạn** hiển thị khâu sản xuất mà MO đang nằm ở đó. Số trong ngoặc vuông là thứ tự\nkhâu, không phải mức ưu tiên.\n\n| Mã | Tên hiện trên màn hình | Nghĩa |\n|---|---|---|\n| `RESIN` | [1] Resin | In mẫu nhựa từ file 3D bằng máy in resin, để có mẫu thật trước khi đúc kim loại. |\n| `CHO_DX_NL` | [2] Chờ ĐX NL | Chờ đề xuất nguyên liệu. Xưởng đã biết cần làm gì nhưng chưa có bản đề xuất vật tư (loại vàng, đá, khối lượng) để duyệt mua. |\n| `CHO_NL` | [3] Chờ NL | Chờ nguyên liệu. Đề xuất đã duyệt nhưng vật tư chưa về tới xưởng nên chưa bắt đầu làm được. |\n| `DUC` | [4] Đúc | Đúc kim loại — rót vàng nóng chảy vào khuôn tạo từ mẫu resin. |\n| `NGUOI` | [5] Nguội | Nguội — làm sạch và hoàn thiện phôi sau khi đúc: cắt cây đúc, giũa, chỉnh hình. |\n| `TC_DAY` | [6] TC Dây | Thủ công dây — làm phần dây, mắt xích, các chi tiết nối bằng tay. |\n| `TC_NGUOI` | [7] TC Nguội | Thủ công nguội — hoàn thiện bằng tay: giũa, chỉnh dáng, xử lý chi tiết nhỏ. |\n| `KHOA` | [8] Khóa | Gắn khoá — lắp khoá, chốt cho dây chuyền, lắc, vòng. |\n| `HOT` | [9] Hột | Gắn hột (gắn đá) — cẩn đá chủ và đá tấm vào ổ đã chuẩn bị. |\n| `MOC` | [10] Móc máy | Móc máy — đánh bóng bằng máy để bề mặt sáng đều. |\n| `DBXM` | [11] ĐBXM | Điện bề xử mặt (mạ) — xi mạ hoàn thiện bề mặt: vàng, trắng, hồng tuỳ yêu cầu. |\n| `QC` | [12] QC | Kiểm tra chất lượng — soát lỗi trước khi cho nhập kho. |\n| `DUYET_NK` | [13] Chờ duyệt NK | Chờ duyệt nhập kho — QC đã xong, đang chờ duyệt để đưa hàng vào kho. |\n\nMột MO đi lần lượt qua các khâu theo thứ tự trên. Khâu hiện tại là khâu đầu tiên chưa xong.\n\n⚠️ **Chờ ĐX NL** và **Chờ NL** là hai khâu CHỜ, không phải khâu làm: chúng nghĩa là xưởng\nđang bị chặn bởi vật tư chứ không phải đang gia công.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-tong-quan",
    title: "Chào mừng & Tổng quan",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "Chào mừng bạn đến với Kim Hoàn V3 — hệ thống quản lý sản xuất trang sức nội bộ. Hướng dẫn này giúp bạn làm quen với giao diện và quy trình công việc cơ bản.\n\n## Hai khái niệm cốt lõi\n- SO (Sales Order): Đơn bán hàng từ hệ thống Odoo, mã số dạng 26.12345. Một SO có thể chứa nhiều mã hàng khác nhau.\n- MO (Manufacturing Order): Lệnh sản xuất cho từng mã hàng cụ thể trong SO. Một SO thường có từ 1 đến 5 MO.\n\n💡 Mọi con số trong hệ thống đều đếm theo MO, không phải SO. Khi thấy \"15 đơn đang hoạt động\" nghĩa là 15 MO đang được sản xuất.\n\n## Điều hướng cơ bản\nSidebar trái chứa các mục chính: Danh sách đơn hàng, Thống kê, Việc thiết kế 3D, Cảnh báo, và nhóm Tài liệu (Hướng dẫn sử dụng, Góp ý của tôi, Có gì mới).\n\n💡 Sidebar không còn danh sách cửa hàng. Việc lọc theo cửa hàng đã chuyển vào thanh công cụ ngay trên bảng đơn hàng — mở Danh sách đơn hàng rồi chọn cửa hàng ở đó.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-dang-nhap",
    title: "Đăng nhập & Tài khoản",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "Hệ thống sử dụng Google OAuth — bạn đăng nhập bằng tài khoản Google được cấp bởi công ty.\n\n## Vai trò tài khoản\nMỗi tài khoản được gán một trong 5 vai trò:\n- ADMIN — Quản trị viên: Toàn quyền truy cập\n- ORDER — Xử lý đơn hàng: Quản lý và chỉnh sửa đơn hàng\n- PRODUCTION — Sản xuất: Xem dữ liệu sản xuất\n- SALES — Kinh doanh: Xem đơn hàng theo cửa hàng được phân công\n- DESIGN_3D — Nhân viên Thiết kế 3D: Chỉ thấy màn Việc thiết kế 3D\n\n💡 Với vai trò SALES, bạn chỉ thấy các cửa hàng mà quản lý đã gán cho bạn. Nếu cần xem thêm cửa hàng, liên hệ với quản lý hệ thống.\n\n## Phiên đăng nhập\nPhiên làm việc được lưu trong database. Bạn có thể đăng xuất bất cứ lúc nào từ menu người dùng ở góc dưới sidebar.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-man-don-hang",
    title: "Màn Đơn hàng & chọn cửa hàng",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "Sau khi đăng nhập, sidebar của bạn có đúng hai nhóm: Danh sách đơn hàng và nhóm Tài liệu. Mọi việc hằng ngày nằm ở mục đầu tiên.\n\nNgay dưới tiêu đề trang là thanh Cửa hàng — nút Tất cả đứng đầu, rồi tới CH1, CH2… mỗi cửa hàng một chấm màu.\n- Bấm một cửa hàng → chỉ xem đơn của nơi đó\n- Bấm Tất cả → xem lại đơn của mọi cửa hàng bạn được gán\n\n💡 Nút Tất cả là đường quay lại. Bấm lại chính cửa hàng đang chọn thì không bỏ lọc — hãy dùng nút Tất cả.\n\n💡 Thanh Cửa hàng chỉ vai trò Sales mới có, và nó chỉ hiện những cửa hàng quản lý đã gán cho bạn. Cần thêm cửa hàng thì liên hệ quản lý hệ thống.\n\n## Bốn tab\n- Phòng Thiết Kế: MO đang ở giai đoạn thiết kế\n- Phòng Sản Xuất: MO đã chuyển sang sản xuất\n- Hoàn tất: MO đã xong\n- Đã hủy: MO bị huỷ\n\n💡 Số trên badge là số MO (lệnh sản xuất), không phải số đơn hàng SO. Một SO có thể có nhiều MO.\n\n## Đọc bảng đơn hàng\nMỗi hàng trong bảng là một MO, bao gồm: mã SO, mã MO, tên sản phẩm, NVL, trọng lượng, trạng thái và ngày giao dự kiến.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-tim-kiem-loc",
    title: "Tìm kiếm & Lọc đơn hàng",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "Thanh tìm kiếm tra cứu theo mã đơn, khách hàng, Sales, mã MO hoặc tên sản phẩm — gõ được thứ nào tiện nhất, không cần chọn loại trước.\n\n💡 Ô tìm kiếm hỗ trợ không dấu: gõ nhan kieng vẫn ra Nhẫn kiềng. Không cần bật dấu tiếng Việt khi đang vội.\n\n## Ba cách lọc, dùng chồng lên nhau được\n- Bốn tab — Phòng Thiết Kế · Phòng Sản Xuất · Hoàn tất · Đã hủy\n- Ưu tiên — nút bật/tắt cạnh ô tìm kiếm, chỉ hiện MO UT1\n- 7 ngày tới · Tuần này · Quá hạn — lọc theo ngày dự kiến hoàn thành\n\n💡 Các bộ lọc cộng dồn: chọn tab Phòng Sản Xuất rồi bấm Quá hạn thì bảng chỉ còn MO đang sản xuất và đã trễ hạn. Muốn bỏ hết thì bấm Xóa lọc.\n\n## Chấm màu Ưu tiên\n- UT1 — Siêu gấp: Mức cao nhất, cần xử lý ngay\n- UT2 — Gấp: Ưu tiên nhưng không gấp\n- SR — Showroom: Đơn showroom cần chú ý\n\n💡 Bộ lọc Ưu tiên chỉ hiện MO có mã UT1, và xét theo từng MO. Nghĩa là UT2 và SR KHÔNG lọt vào tab này, và một MO thường sẽ không bị kéo theo chỉ vì MO khác trong cùng SO được đánh ưu tiên.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-in-bao-cao",
    title: "Lọc nâng cao & In báo cáo",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "## Nguyên tắc: bản in = tab đang mở + bộ lọc đang áp\nBáo cáo không phải một màn riêng. Nó chụp lại đúng danh sách bạn đang nhìn:\n- Bạn đang ở tab nào thì in đơn của tab đó.\n- Có lọc — ví dụ hạn Tuần này — thì chỉ in những đơn trong tuần.\n- Không lọc gì thì in toàn bộ đơn của tab đó.\n- Sau đó bạn chọn những cột muốn in.\n\nNói cách khác: bạn lọc trên màn hình, hệ thống in đúng thứ đó. Bản in nhiều hay ít dòng là do bộ lọc, không phải do một thiết lập nào khác.\n\n💡 Con số trên nút — In / Xuất PDF (24) — chính là số MO sẽ được in. Nhìn nó trước khi bấm: thấy 400 trong khi bạn định in báo cáo tuần thì bộ lọc chưa ăn.\n\n💡 Con số đó tính trên toàn bộ danh sách đã lọc, không phải trang đang xem. Bảng chia trang 50 dòng nhưng bản in vẫn đủ cả 24 MO — không cần lật từng trang để in.\n\n## Hai nút, ở góc phải ngay trên bảng\n- Lọc nâng cao — lọc sâu theo từng cột (kiểu Google Sheet): chọn nhiều giá trị, lọc khoảng số, tìm trong danh sách giá trị. Số bên cạnh là số điều kiện đang bật.\n- In / Xuất PDF (N) — mở hộp thoại chọn cột.\n\nÔ tìm kiếm khác Lọc nâng cao chỗ nào: ô tìm kiếm quét một chuỗi qua nhiều trường cùng lúc — hợp khi bạn đã biết mình tìm gì. Lọc nâng cao đặt điều kiện trên từng cột cụ thể — hợp khi bạn dựng một danh sách để báo cáo.\n\n## Hộp thoại In / Xuất PDF báo cáo\n- Tiêu đề — mặc định “Báo cáo đơn hàng”, sửa được.\n- Kỳ báo cáo — tự điền theo bộ lọc: chọn hạn Quá hạn thì nó ghi “Đơn quá hạn dự kiến hoàn thành”; không lọc theo ngày thì ghi “Tất cả đơn (theo bộ lọc hiện tại)”. Vẫn sửa tay được.\n- Người xuất — tuỳ chọn, in vào phần đầu báo cáo.\n\nPhần Cột hiển thị có ba nút bấm nhanh, và góc phải luôn hiện Đã chọn N:\n- Báo cáo sếp — bộ cột gọn, đủ để đọc: SO · MO# · Khách hàng · Sản phẩm…\n- Đầy đủ — tích hết mọi cột\n- Bỏ chọn hết — bỏ tất cả, chỉ chừa cột bắt buộc\n\nBên dưới là các ô tích, chia ba nhóm: Đơn hàng · Sản phẩm & Kỹ thuật · Sản xuất & Kết quả.\n\n💡 Cột ghi (bắt buộc) — như SO — luôn được in và không bỏ tích được, để không bao giờ ra một bản báo cáo không tra ngược được. Cột ghi (PSX) chỉ có số liệu khi đơn đã sang xưởng.\n\nChọn Khổ giấy Dọc hoặc Ngang, rồi bấm Xem / Tải PDF — file mở ngay trên trình duyệt, từ đó bạn tải về hoặc bấm in.\n\n## Hai điều dễ vấp\n⚠️ Chọn quá 8 cột thì hệ thống tự chuyển sang khổ Ngang. Bạn đổi lại Dọc được, nhưng khi đó có dòng nhắc “chữ sẽ rất nhỏ” — và nó nói thật.\n\n⚠️ Hộp thoại không tự cập nhật khi bạn lọc lại phía sau. Hãy lọc xong rồi mới mở hộp thoại in.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-chi-tiet-mo",
    title: "Chi tiết MO",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "Click vào bất kỳ hàng nào trong bảng để mở panel chi tiết bên phải màn hình.\n\n## Thông tin trong panel\n- Mã SO / MO: Số đơn hàng và lệnh sản xuất\n- Sản phẩm: Tên, danh mục, NVL (vàng 18K, bạc…), size\n- Trọng lượng: Trọng lượng dự kiến (gram)\n- Trạng thái: Trạng thái hiện tại của MO này\n- Ngày giao: Hạn giao hàng cho khách\n\n## Phiên bản MO\nKhi một MO được chỉnh sửa thiết kế, hệ thống tạo phiên bản mới với hậu tố số:\n- 26.12345 — bản gốc\n- 26.12345_1 — phiên bản 1 (sửa lần 1)\n- 26.12345_2 — phiên bản 2 (sửa lần 2)\n\n💡 Các phiên bản cũ vẫn còn trong bảng để theo dõi lịch sử. Phiên bản mới nhất luôn hiển thị phía dưới bản gốc.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-trang-thai-tien-do",
    title: "Trạng thái & Tiến độ",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "Một MO đi qua hai phòng, và mỗi phòng theo dõi tiến độ bằng một thứ khác nhau. Đây là điều dễ nhầm nhất trong hệ thống, nên hai phần dưới đây tách riêng.\n\n💡 🎯 Phòng Thiết Kế theo dõi bằng Trạng thái. Phòng Sản Xuất theo dõi bằng Công đoạn. Nhìn nhầm cột là hiểu nhầm tiến độ.\n\n## 1. Phòng Thiết Kế — đi bằng Trạng thái\n- Chưa thiết kế — Mới tạo, chưa ai nhận\n- Làm INFO — Đang nhập thông tin sản phẩm\n- Đang thiết kế — Nhân viên 3D đang làm\n- Chờ khách duyệt — Đã gửi mẫu, chờ khách phản hồi\n- Chốt 3D — Chuyển xưởng — Khách đã chốt, sẵn sàng chuyển xưởng\n- Hoàn tất 3D — Xong phần thiết kế, đơn vẫn còn ở Phòng Thiết Kế\n\n💡 Đây là tên hiển thị thật trên bảng. Không phải MO nào cũng đi đủ sáu bước — nhiều MO nhảy thẳng từ Chưa thiết kế sang Chốt 3D — Chuyển xưởng.\n\n## 2. Phòng Sản Xuất — đi bằng Công đoạn\nKhi MO chuyển sang xưởng, cột Tình trạng gần như đứng yên ở “Đang sản xuất” — ở đây chỉ có hai trạng thái: Đang sản xuất và Tạm ngưng.\n\n⚠️ Đây là chỗ hay hiểu nhầm nhất: thấy cột Tình trạng không đổi suốt hai tuần không có nghĩa là đơn bị kẹt. Một MO nằm ở “Đang sản xuất” trong khi đi qua cả chục khâu. Muốn biết đơn đang ở đâu, nhìn cột Công đoạn.\n\n💡 Khâu đang chạy là khâu đầu tiên chưa xong. Số trong ngoặc vuông là thứ tự khâu, không phải mức ưu tiên.\n\n## 3. Trạng thái đặc biệt\n- Tạm ngưng: Bị treo — thường do vật liệu hoặc vấn đề với khách\n- Tạm ngưng - Chờ duyệt: Đang treo và chờ quản lý quyết định\n- Đã hủy: Đơn đã huỷ — không chỉnh sửa được nữa\n\nRiêng ở xưởng, Tạm ngưng còn ghi kèm lý do, và hai lý do hay gặp nhất là:\n- Chờ ĐX NL — chờ đề xuất nguyên liệu: đã biết cần làm gì nhưng chưa có bản đề xuất vật tư để duyệt mua\n- Chờ NL — chờ nguyên liệu: đề xuất đã duyệt nhưng vật tư chưa về tới xưởng\n\n⚠️ Hai lý do trên nghĩa là xưởng đang bị chặn bởi vật tư, không phải đang gia công chậm. Thấy MO treo ở đây thì liên hệ quản lý để biết dự kiến tiếp tục.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-meo-faq",
    title: "Mẹo & Câu hỏi thường gặp",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "## ❓ Tôi không thấy cửa hàng của mình trong sidebar?\nLiên hệ quản lý để được gán vào cửa hàng. Tài khoản SALES chỉ thấy các cửa hàng được phân công.\n\n## ❓ 26.12345_2 nghĩa là gì?\nĐây là phiên bản 2 của MO 26.12345. Mỗi lần thiết kế được sửa lại, một phiên bản mới được tạo. Bản gốc (26.12345) vẫn còn trong lịch sử.\n\n## ❓ Tại sao số tab và số bảng dashboard khác nhau?\nHai màn hình có thể được tải ở thời điểm khác nhau. Bấm F5 để làm mới dữ liệu.\n\n## ❓ Tôi có thể chỉnh sửa thông tin đơn hàng không?\nKhông. Vai trò SALES chỉ có quyền xem. Liên hệ nhân viên ORDER hoặc ADMIN để chỉnh sửa.\n\n## ❓ Suspended khác Cancelled thế nào?\nSuspended = tạm dừng, có thể tiếp tục. Cancelled = đã hủy vĩnh viễn, không thể tiếp tục.\n\n💡 Nếu bạn gặp lỗi hoặc dữ liệu bất thường, hãy chụp màn hình và gửi cho quản lý hệ thống kèm theo mã đơn hàng cụ thể.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-employee-gop-y-co-gi-moi",
    title: "Góp ý & Có gì mới",
    roles: ["employee"],
    lastReviewed: "2026-08",
    body: "Hai mục này nằm trong nhóm Tài liệu ở sidebar, cạnh chính trang Hướng dẫn bạn đang đọc.\n\n## Báo lỗi hoặc đề xuất — nút “Góp ý”\nNút Góp ý dán ở giữa cạnh phải màn hình, luôn thấy ở mọi trang. Khi mở panel chi tiết đơn, nút tự trượt sang trái để không bị che — vẫn bấm được.\n- Bấm Góp ý\n- Chọn loại: Báo lỗi (có chỗ chạy sai) hoặc Đề xuất cải tiến (muốn thêm việc)\n- Gõ hai ô — ô thứ hai không bắt buộc\n- Bấm Ctrl+V để dán ảnh vừa chụp, tối đa 4 ảnh\n- Bấm Gửi\n\n💡 Bạn không cần gõ lại số đơn, số MO hay tên màn hình — hệ thống tự kèm cả những thứ đó, kèm cả bản build đang chạy. Đó là lý do gửi qua đây nhanh hơn nhắn tin.\n\n💡 Ảnh nào tải lên lỗi sẽ có dấu LỖI và không chặn việc gửi — phản hồi vẫn đi, chỉ là không kèm ảnh đó.\n\nVới Báo lỗi, admin nhận thông báo ngay. Với Đề xuất cải tiến thì không — nó được xếp vào danh sách để admin xem, vì đề xuất không bao giờ gấp.\n\n## Theo dõi phản hồi của mình\nMở Góp ý của tôi để xem lại mọi thứ bạn đã gửi, trạng thái xử lý và câu trả lời của admin.\n\n## Xem hệ thống vừa đổi gì — “Có gì mới”\nMục Có gì mới có huy hiệu đỏ khi có cập nhật bạn chưa đọc. Mở ra, các mục mới có vạch hồng và nhãn MỚI; huy hiệu tắt ngay sau đó.\n\n⚠️ Hướng dẫn này mô tả hệ thống ở thời điểm được rà soát (xem mốc ở đầu mỗi chương). Hệ thống cập nhật liên tục, nên khi thấy giao diện khác với hướng dẫn, Có gì mới là chỗ tra trước tiên — và nếu vẫn không khớp thì bấm Góp ý báo cho admin.\n\n## Bạn là Nhân viên Thiết kế 3D?\nVai trò DESIGN_3D chỉ thấy màn Việc thiết kế 3D — nơi nhận việc, cập nhật tiến độ và xin tăng ca. Phần hướng dẫn riêng cho màn đó chưa được viết; hãy dùng nút Góp ý để hỏi khi cần.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-dashboard-thong-ke",
    title: "Dashboard & Thống kê",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Dashboard là màn hình tổng quan dành cho quản lý và bộ phận sản xuất. Tại đây bạn thấy toàn bộ tình trạng sản xuất theo thời gian thực.\n\n## Bốn Stat Cards\n- Tổng MO: Tổng số lệnh sản xuất đang hoạt động\n- Phòng Thiết Kế: MO đang ở giai đoạn thiết kế (PRE_PRODUCTION)\n- Phòng Sản Xuất: MO đang sản xuất (MASTER_HUB)\n- Quá hạn: MO đã qua ngày giao dự kiến chưa hoàn tất\n\n## Widget Dự đoán Vàng\nHiển thị lượng vàng dự kiến cần chuẩn bị cho các MO đang ở Phòng Sản Xuất chưa qua công đoạn Đúc. Dữ liệu được de-duplicate theo MO gốc — phiên bản mới nhất của mỗi MO được dùng để tính.\n\n💡 Số MO trong dashboard đếm tất cả cửa hàng. Để xem theo từng cửa hàng, vào trang cụ thể của cửa hàng đó.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-quan-ly-don-hang",
    title: "Quản lý Đơn hàng",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Trang Quản lý Đơn hàng (menu Danh sách đơn hàng) cho phép xem toàn bộ MO từ mọi cửa hàng cùng một lúc.\n\n## Bộ lọc nâng cao\n- Lọc theo Zone: PRE_PRODUCTION hoặc MASTER_HUB\n- Lọc theo trạng thái: Cụ thể hoặc toàn bộ đang hoạt động\n- Lọc Ưu tiên: Hiển thị chỉ MO UT1\n- Lọc ngày: Lọc theo khoảng ngày tạo đơn\n\n## Sắp xếp\nMặc định sắp xếp theo ngày tạo. Các MO cùng SO (và phiên bản của chúng) được nhóm lại với nhau — ví dụ 26.12345, 26.12345_1, 26.12345_2 luôn nằm liền kề.\n\n💡 Có nút In / Xuất PDF ở thanh công cụ phía trên bảng — số trong ngoặc là số MO sẽ được in theo bộ lọc đang áp dụng. Không cần dùng Ctrl+P của trình duyệt.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-tao-phien-ban-mo",
    title: "Tạo Phiên bản MO",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Khi một MO cần thay đổi thiết kế (kích thước mới, đá mới, yêu cầu khách hàng thay đổi…), thay vì chỉnh sửa trực tiếp hãy tạo phiên bản mới.\n\n## Quy trình tạo phiên bản\n- Mở panel chi tiết của MO cần sửa\n- Bật công tắc “Tạo phiên bản mới khi lưu” ở cuối panel\n- Sửa các trường cần đổi như bình thường\n- Bấm Lưu — hệ thống tự sinh số MO mới, bản gốc giữ nguyên\n\n💡 Đây là một công tắc, không phải một nút riêng. Khi tắt, mọi thay đổi ghi thẳng vào MO hiện tại; khi bật, phần sửa của bạn đi vào một phiên bản mới.\n\n⚠️ Không thể vừa bật “Tạo phiên bản” vừa Chuyển xưởng trong cùng một lần lưu — hai việc đó mâu thuẫn ý định, và hệ thống sẽ chặn.\n\n## Đánh số tự động\n- MO 26.12345 → phiên bản 1: 26.12345_1\n- Mỗi MO có counter riêng — nếu SO có 2 MO (26.99001 và 26.99002), phiên bản đầu tiên của từng MO đều là .1\n\n⚠️ Không nên tạo phiên bản cho MO đã ở trạng thái Hoàn tất hoặc Đã hủy.\n\n💡 Phiên bản cũ vẫn giữ nguyên trong bảng để audit trail. Chúng sẽ tự nhóm với bản gốc khi sắp xếp.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-uu-tien-rush",
    title: "Ưu tiên & phân loại",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Hệ thống có hai cấp độ ưu tiên để phân loại MO cần xử lý nhanh.\n\n## Ý nghĩa từng chấm màu\n- UT1 — Siêu gấp: Mức cao nhất. Chỉ mã này được tab “Ưu tiên” lọc ra.\n- UT2 — Gấp: Quan trọng nhưng không cấp bách. KHÔNG vào tab “Ưu tiên”.\n- SR — Showroom: Đơn hàng dành cho showroom.\n\n## Cách đặt ưu tiên\nMở panel chi tiết MO → chọn tab sản phẩm → click nút ưu tiên bên cạnh sản phẩm cần đánh dấu.\n\n💡 Ưu tiên lưu ở priorityCode của từng MO, không phải một cờ ở cấp đơn hàng. Một SO có thể có vài MO UT1 và vài MO Normal, và bộ lọc xét đúng từng MO.\n\n💡 Trước đây việc phân loại nằm rải rác nhiều chỗ (cờ cấp SO, cờ isRush, so chuỗi tại chỗ) và gây lọc sai — MO thường trong cùng SO vẫn lọt vào tab Ưu tiên. Nay chỉ còn một nguồn duy nhất.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-promote-sang-san-xuat",
    title: "Promote MO sang Sản xuất",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Sau khi thiết kế được duyệt, MO được chuyển (promote) từ Phòng Thiết Kế sang Phòng Sản Xuất.\n\n## Cách hoạt động\nHệ thống theo dõi zone ở cấp độ sản phẩm (item), không phải cấp đơn hàng:\n- Trước promote: item.zone = PRE_PRODUCTION\n- Sau promote: item.zone = MASTER_HUB\n- order.zone phản ánh zone của đa số items\n\n## Tại sao cần phân biệt item.zone?\nMột SO có thể có 3 MO, trong đó 2 MO đã chuyển sang sản xuất và 1 MO vẫn đang thiết kế. Hệ thống theo dõi từng MO độc lập để tab badges hiển thị chính xác.\n\n💡 Sau khi promote, MO sẽ di chuyển từ tab Phòng Thiết Kế sang tab Phòng Sản Xuất — badge số tự cập nhật.\n\n⚠️ Chỉ promote khi thiết kế đã được phê duyệt. Promote sai giai đoạn sẽ ảnh hưởng đến dự đoán vàng.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-phan-quyen-cua-hang",
    title: "Phân quyền & Quản lý Cửa hàng",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Hệ thống có 5 vai trò, mỗi vai trò có phạm vi truy cập khác nhau: ADMIN, ORDER, PRODUCTION, SALES và DESIGN_3D.\n\n## Gán nhân viên vào cửa hàng\nSALES không thể tự xem tất cả cửa hàng — cần được gán vào từng cửa hàng cụ thể:\n- Vào trang quản trị người dùng\n- Chọn nhân viên cần cấu hình\n- Thêm cửa hàng vào danh sách phân công\n\n💡 Một nhân viên SALES có thể được gán vào nhiều cửa hàng cùng lúc. Hệ thống sẽ tự chuyển hướng đến cửa hàng đầu tiên khi đăng nhập.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-canh-bao-giam-sat",
    title: "Alerts & Giám sát",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Hệ thống cảnh báo tự động phát hiện các tình huống bất thường và thông báo cho quản lý.\n\n## Mức độ cảnh báo\n- CRITICAL: Nghiêm trọng — tự động tạm dừng đơn hàng ngay khi xuất hiện\n- WARNING: Cảnh báo — cần chú ý nhưng không tự động can thiệp\n- INFO: Thông tin — theo dõi thôi, không cần hành động ngay\n\n## Xử lý CRITICAL alert\n- Thấy huy hiệu đỏ ở mục Cảnh báo trên sidebar (không phải header)\n- Mở trang Cảnh báo, hoặc panel chi tiết của MO bị ảnh hưởng\n- Đọc nội dung cảnh báo\n- Xử lý vấn đề thực tế\n- Bấm Giải quyết\n- Nếu muốn đơn chạy lại, phải tự tích chọn “cho đơn chạy tiếp” khi giải quyết\n\n⚠️ Giải quyết cảnh báo KHÔNG tự động bỏ trạng thái Tạm ngưng. Đó là một quyết định riêng và phải chọn có chủ ý — nên nếu sau khi giải quyết mà đơn vẫn treo, hãy kiểm lại ô tích đó.\n\n## Lịch sử Workflow\nMọi hành động trên đơn hàng đều được ghi lại trong Workflow History — bao gồm: ai thay đổi, thay đổi gì, lúc nào.\n\n⚠️ Không nên resolve CRITICAL alert trước khi đã xử lý vấn đề thực tế. Resolve sai có thể khiến đơn hàng tiếp tục sản xuất khi chưa an toàn.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-manager-phan-hoi-cai-tien",
    title: "Phản hồi & Ghi nhận cải tiến",
    roles: ["manager"],
    lastReviewed: "2026-08",
    body: "Hai công cụ để nói chuyện với nhân viên ngay trong hệ thống, thay cho nhắn tin qua nền tảng khác.\n\n## Hộp thư phản hồi\nSidebar → ADMIN → Phản hồi người dùng. Huy hiệu đỏ là số phản hồi chưa xử lý.\n\nMỗi phản hồi tự kèm bối cảnh: màn hình, đơn/MO đang xem, phiên bản đơn, và bản build lúc gặp lỗi. Đó là thứ biến “hôm trước em thấy lỗi” thành một việc truy được.\n- Báo lỗi → bắn thông báo Google Chat ngay\n- Đề xuất cải tiến → KHÔNG bắn chuông, chỉ đếm vào huy hiệu\n\n💡 Hai loại có hai vòng đời riêng. Báo lỗi: Mới → Đang xem → Đã sửa / Không phải lỗi. Đề xuất: Mới → Đã ghi nhận, chưa làm → Đang làm → Đã làm xong / Không làm.\n\n⚠️ Chọn Không phải lỗi hoặc Không làm thì bắt buộc ghi một dòng lý do. Người gửi chịu được câu “không”; họ không chịu được sự im lặng — và sau hai lần im lặng họ quay về nhắn tin.\n\n## Ghi nhận cải tiến\nSidebar → ADMIN → Ghi nhận cải tiến. Cách dùng: ghi dần trong ngày, đăng một lượt.\n- Gõ tiêu đề + chi tiết (không bắt buộc), chọn khu vực\n- Lưu nháp — chưa ai thấy\n- Cuối ngày bấm Đăng n mục\n\n💡 Cả lượt đăng chỉ gửi MỘT tin Google Chat, dù có 5 mục. Và sửa một mục đã đăng KHÔNG bắn tin lần hai — nên yên tâm sửa lỗi chính tả.\n\nViết theo góc người dùng, không theo góc kỹ thuật: “Chuyển xưởng — bản đã huỷ không còn chặn bản đúng” chứ không phải tên file hay tên hàm. Hệ thống sẽ nhắc nếu tiêu đề nghe như một ghi chú kỹ thuật.\n\n💡 Chỉ tick Quan trọng khi không biết thì làm sai việc — nó hiện một dải thông báo trên đầu trang. Tick mọi mục là không mục nào còn nổi bật.\n\n⚠️ Mục đã đăng thì không xoá được — người dùng đã đọc nó rồi. Muốn nó không hiện nữa thì bấm Bỏ đăng.\n\n## Vì sao hai thứ này liên quan tới nhau\nKhi bạn chốt một Đề xuất cải tiến là “Đã làm xong”, hãy ghi luôn một mục ở Có gì mới. Nhân viên thấy điều mình xin đã được làm — đó là thứ mạnh nhất khiến họ tiếp tục gửi góp ý.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-design3d-man-hinh-cua-ban",
    title: "Màn hình của bạn",
    roles: ["design3d"],
    lastReviewed: "2026-08",
    body: "Với vai trò DESIGN_3D, sidebar chỉ có một mục làm việc: Việc thiết kế 3D. Đó là toàn bộ nơi bạn cần.\n\n💡 Bạn chỉ thấy việc của chính mình. Phạm vi này bị ép ở tầng truy vấn phía máy chủ, không phải chỉ ẩn trên giao diện — nên không có cách nào xem việc của đồng nghiệp, kể cả khi đổi đường dẫn.\n\n## Hai tab\n- Việc được giao — danh sách các lượt giao việc của bạn\n- Tăng ca — khai báo và theo dõi giờ làm thêm của bạn\n\n## Đọc một dòng trong bảng\nMỗi dòng là một lượt giao việc cho một MO. Các cột đáng chú ý:\n- Nhóm KPI — nhóm công việc quyết định số giờ chuẩn cho MO này\n- Deadline KPI — mốc phải xong, tính theo giờ làm việc\n- Sớm / Trễ — bạn đang trước hay sau hạn\n\n💡 Một MO có thể có nhiều lượt qua thời gian (bị yêu cầu làm lại, hoặc giao lại cho người khác). Mỗi lượt được tính KPI riêng, độc lập với lượt trước.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-design3d-nhan-viec",
    title: "Nhận việc",
    roles: ["design3d"],
    lastReviewed: "2026-08",
    body: "Việc đầu tiên với mỗi lượt mới là bấm Xác nhận nhận việc.\n\n⚠️ Chưa xác nhận thì không ghi được tiến độ. Hệ thống sẽ trả đúng câu: “Bạn chưa xác nhận nhận việc. Bấm \"Xác nhận nhận việc\" trước khi cập nhật tiến độ.” Đây là chặn ở phía máy chủ, không phải chỉ mờ cái nút.\n\n## Vì sao phải có bước này\nMốc bạn nhận việc là mốc bắt đầu đếm giờ KPI. Không có nó thì hệ thống phải đoán, và mọi con số phía sau đều dựa trên một phỏng đoán.\n\n💡 Khoảng cách giữa lúc Đặt đơn giao và lúc bạn nhận được ghi lại riêng. Nhận sớm hơn mốc giao dự kiến thì độ trễ tính là 0, không bị tính âm.\n\n## Dòng “Chưa nhận việc”\nTrong bảng, lượt chưa xác nhận hiện chữ Chưa nhận việc màu cảnh báo. Đó là dấu hiệu việc cần làm ngay, không phải một trạng thái để chờ.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-design3d-cap-nhat-tien-do",
    title: "Cập nhật tiến độ & Gửi kết quả",
    roles: ["design3d"],
    lastReviewed: "2026-08",
    body: "Sau khi nhận việc, bạn ghi tiến độ bằng một trong ba trạng thái:\n- Đang thiết kế — đang làm bình thường\n- Chờ thêm thông tin / phản hồi — bạn bị vướng, cần Đặt đơn hoặc khách trả lời\n- Đã gửi kết quả — bạn đã nộp bài\n\n💡 Chọn Chờ thêm thông tin khi thật sự bị vướng. Trong bảng nó hiện thành Chờ phản hồi màu cảnh báo, để người cần trả lời bạn nhìn thấy.\n\n## Gửi kết quả\nChọn Đã gửi kết quả là đóng dấu giờ hoàn tất, và hệ thống chấm ngay Đúng hạn hay Trễ hạn cho lượt đó.\n\n## Sau khi bạn nộp\nLượt chuyển sang Chờ kiểm — Đặt đơn/Admin kiểm nội bộ trước khi gửi khách. Hai kết cục:\n- Đã duyệt — xong lượt này\n- Yêu cầu làm lại — cần sửa; có thể là một lượt mới cho bạn, hoặc giao cho người khác\n\n⚠️ Đây là bước kiểm nội bộ, khác với “Chờ khách duyệt” ở màn đơn hàng. Hai thứ dễ nhầm tên nhưng là hai chặng khác nhau.\n\n## Khi đơn đang bị gác\nNếu đơn của bạn bị tạm dừng, bạn vẫn ghi được ghi chú và File Render, nhưng KHÔNG gửi kết quả được.\n\n💡 Không phải để làm khó bạn: giờ công của giai đoạn đó đã được chốt tại đúng mốc tạm dừng và đã vào KPI. Cho nộp sau đó là chốt lần thứ hai lên cùng một lượt bằng một con số khác. Cần làm tiếp thì Đặt đơn/Admin giao lượt mới — và KPI tính lại từ đầu cho lượt đó.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-design3d-deadline-kpi",
    title: "Deadline KPI được tính thế nào",
    roles: ["design3d"],
    lastReviewed: "2026-08",
    body: "Đây là chương đáng đọc kỹ nhất, vì nó giải thích một con số dễ gây hiểu nhầm.\n\n## Tính theo GIỜ LÀM VIỆC, không phải giờ đồng hồ\nDeadline được tính bằng cách bước qua từng ca làm việc trong lịch: bỏ ngày nghỉ, bỏ giờ nghỉ giữa ca, bỏ đêm.\n\n💡 Ví dụ: giao 16:00 thứ Sáu, bạn xong 09:00 thứ Hai. Giờ đồng hồ là 65 giờ, nhưng giờ làm việc thật chỉ khoảng 2 giờ — và hệ thống tính theo con số thứ hai.\n\nNên đừng lấy hiệu số ngày để tự suy ra mình trễ bao nhiêu: cuối tuần và ban đêm không được tính.\n\n## Nhóm KPI quyết định số giờ chuẩn\nMỗi MO được gán một Nhóm KPI, và nhóm đó mang số giờ chuẩn. Deadline = mốc bạn nhận việc, cộng thêm số giờ chuẩn đó, đi theo lịch làm việc.\n\n## “Một ngày làm việc” là bao nhiêu\nLấy theo lịch đang cấu hình, không phải mặc định 8 giờ. Một lịch có Thứ 2 gồm ba ca (08:00–12:00, 13:00–15:00, 15:10–17:00) là 7 giờ 50 phút, không phải 8 giờ.\n\n## Cột “Sớm / Trễ”\nLà khoảng cách giữa bạn và deadline, cũng đo bằng giờ làm việc. Nên con số ở đây luôn nhỏ hơn phép trừ ngày thông thường của bạn — và đó là con số đúng.\n\n⚠️ Nếu cột này hiện một số bạn thấy vô lý, hãy dùng nút Góp ý báo lại kèm ảnh. Chính lớp lỗi đó từng có thật: một bản trước đây hiện “Trễ 142 giờ” trong khi phần lớn là đêm và Chủ nhật.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-design3d-tang-ca",
    title: "Tăng ca",
    roles: ["design3d"],
    lastReviewed: "2026-08",
    body: "Tab Tăng ca là nơi bạn khai báo giờ làm thêm cho việc của mình.\n\n## Khai báo\n- Mở tab Tăng ca\n- Bấm Khai báo tăng ca\n- Chọn khoảng thời gian đã làm thêm\n- Ghi Lý do (không bắt buộc, nhưng nên có — VD “Gấp đơn khách”)\n- Gửi\n\n💡 Bạn chỉ khai báo được cho việc do mình phụ trách.\n\n## Sau khi gửi\nKhai báo ở trạng thái chờ duyệt. Việc phê duyệt thuộc Leader/Giám sát — bạn không tự duyệt được, và điều đó là có chủ ý: đây là dữ liệu đi vào lương.\n- Đã duyệt — giờ được ghi nhận\n- Từ chối — không ghi nhận\n\n💡 Bạn luôn xem lại được khai báo của mình ở tab này, kể cả sau khi đã duyệt.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-design3d-viec-khong-lam-duoc",
    title: "Việc bạn không làm được — và vì sao",
    roles: ["design3d"],
    lastReviewed: "2026-08",
    body: "Biết trước ranh giới thì đỡ mất thời gian đi tìm một cái nút không tồn tại.\n\n## Bạn LÀM ĐƯỢC\n- Xem việc của mình\n- Xác nhận nhận việc\n- Cập nhật tiến độ và gửi kết quả\n- Khai báo tăng ca cho việc của mình\n\n## Bạn KHÔNG làm được\n- Tạm dừng / mở lại một lượt — chỉ Admin/Đặt đơn\n- Kiểm kết quả — chỉ Admin/Đặt đơn\n- Chuyển việc sang người khác — chỉ Admin/Đặt đơn\n- Xem tải công việc của đồng nghiệp — chỉ người đi giao việc\n- Tự duyệt tăng ca — chỉ Leader/Giám sát\n\n## Vì sao bạn không được tự tạm dừng\n⚠️ Tạm dừng vừa trừ giờ thực tế vừa dời deadline. Nếu người đang được chấm điểm tự bấm dừng được thì KPI không còn nghĩa gì — chỉ cần bấm dừng mỗi lần rời bàn là mọi đơn đều đúng hạn.\n\nĐây không phải là không tin bạn. Đó là điều kiện để con số KPI có nghĩa với tất cả mọi người, kể cả bạn.\n\n💡 Cần gác đơn thật (thiếu vật liệu, khách chưa trả lời, máy lỗi) thì nói với Đặt đơn/Admin — họ có nút đó. Trong lúc chờ, hãy ghi một dòng tiến độ Chờ thêm thông tin / phản hồi để lý do được lưu lại.\n\n## Nếu bấm gì mà bị từ chối\nHệ thống trả về câu nói rõ vì sao, không phải một lỗi chung chung. Nếu câu đó không giúp bạn hiểu, đó là lỗi của hệ thống — bấm Góp ý báo lại.",
  },
  // (sinh từ guide/content.tsx)
  {
    id: "huong-dan-design3d-gop-y-co-gi-moi-3d",
    title: "Góp ý & Có gì mới",
    roles: ["design3d"],
    lastReviewed: "2026-08",
    body: "Hai mục này nằm trong nhóm Tài liệu ở sidebar, cạnh trang Hướng dẫn bạn đang đọc. Cả hai đều dành cho mọi vai trò, kể cả bạn.\n\n## Báo lỗi hoặc đề xuất — nút “Góp ý”\nNút Góp ý dán ở giữa cạnh phải màn hình, luôn thấy.\n- Bấm Góp ý\n- Chọn Báo lỗi (có chỗ chạy sai) hoặc Đề xuất cải tiến\n- Gõ hai ô — ô thứ hai không bắt buộc\n- Bấm Ctrl+V để dán ảnh vừa chụp, tối đa 4 ảnh\n- Bấm Gửi\n\n💡 Bạn không cần gõ lại số MO hay tên màn hình — hệ thống tự kèm. Đó là lý do gửi qua đây nhanh hơn nhắn tin.\n\nXem lại những gì đã gửi và câu trả lời của admin ở Góp ý của tôi.\n\n## Khi hướng dẫn không khớp màn hình\nMục Có gì mới ghi lại những cải tiến đã đưa vào hệ thống, và có huy hiệu đỏ khi có cập nhật bạn chưa đọc.\n\n⚠️ Đầu mỗi chương có mốc rà soát. Hệ thống cập nhật liên tục, nên khi thấy màn hình khác với hướng dẫn: xem Có gì mới trước; nếu vẫn không khớp thì bấm Góp ý — đó chính là loại lỗi cần biết nhất.\n\n## Số KPI của bạn cũng cần được kiểm\n💡 Nếu Deadline, “Sớm / Trễ”, hay giờ tăng ca hiện ra con số bạn thấy không đúng, hãy báo. Đó là dữ liệu ảnh hưởng tới đánh giá công việc của bạn, và im lặng không sửa được nó.",
  },
];
