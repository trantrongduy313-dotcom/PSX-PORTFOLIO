// ─── Huy hiệu ĐẾM — dùng ở mọi nơi cần một con số "còn việc" ─────────────────
//
// TÁCH RA Ở LẦN THỨ BA, không sớm hơn. Khối JSX này đã được viết tay hai lần (Cảnh báo và
// Phản hồi người dùng) — hai lần là trùng hợp, ba lần là một khuôn. Mục "Có gì mới" là lần
// thứ ba.
//
// ⚠️ ĐỔI TÊN TỪ `CountBadge` Ở LẦN THỨ TƯ: thanh hành động nổi (ActionDock) cũng cần đúng
// con số này để nói "còn 5 việc cần xử lý" ngay cả khi nó đang thu gọn. Giữ tên cũ nghĩa là có
// một component tên `Sidebar*` sống trong ActionDock — một cái tên NÓI DỐI, và người đọc sau
// sẽ mất thời gian vì nó. Component này chưa bao giờ biết gì về Sidebar cả.
//
// VÌ SAO ĐÁNG TÁCH: mấy con số đỏ cạnh nhau mà lệch vài pixel hay lệch sắc đỏ thì đọc ra ngay
// là chắp vá — loại lệch không ai mở ticket nhưng ai cũng thấy. Một chỗ khai kích thước và màu
// là hết chuyện.
//
// JSX THUẦN: không state, không sự kiện, không hook → dùng được ở cả Server lẫn Client Component.

export function CountBadge({ count }: { count: number }) {
  // Số 0 KHÔNG hiện gì. Một vòng tròn "0" là nhiễu — nó chiếm chỗ của mắt để nói rằng không
  // có gì cần chú ý. Quyết định này nằm ở đây để cả ba chỗ gọi không phải nhớ tự kiểm.
  if (count <= 0) return null;

  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 700,
        background: "var(--s-red)",
        color: "#fff",
        padding: "1px 6px",
        borderRadius: "999px",
        minWidth: "20px",
        textAlign: "center",
      }}
    >
      {/* Cắt ở 99+: một con số bốn chữ số làm giãn mục nav và đẩy chữ xuống dòng. Và về mặt
          nghĩa thì 132 với 99+ là như nhau — cả hai đều là "nhiều, đi xử lý đi". */}
      {count > 99 ? "99+" : count}
    </span>
  );
}
