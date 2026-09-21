"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type DesignerKpi = {
  name: string;
  code: string;
  donGiao: number;
  donHT: number;
  donChuaHT: number;
  donTamDung: number;
  donBiChuyenDi: number;
  donTiepTuc: number;
  donTre: number;
  donDungHan: number;
  donChoBuong: number;
  tongGio: number;
  quiDoiNgay: number;
  isOther?: boolean;
};

const TH: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--ink-muted)",
  background: "var(--cream-dark, #f0ebe3)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
  textAlign: "center",
};
const THLeft: React.CSSProperties = { ...TH, textAlign: "left" };
const TD: React.CSSProperties = {
  padding: "9px 12px",
  fontSize: "13px",
  borderBottom: "1px solid var(--border-light, #f0ede8)",
  textAlign: "center",
  whiteSpace: "nowrap",
};
const TDLeft: React.CSSProperties = { ...TD, textAlign: "left" };

function Num({ v, blue, red }: { v: number; blue?: boolean; red?: boolean }) {
  if (v === 0) return <span style={{ color: "var(--ink-muted)", fontSize: "12px" }}>—</span>;
  return (
    <span style={{
      fontWeight: 600,
      color: blue ? "#1E40AF" : red ? "var(--s-red, #dc2626)" : "var(--ink)",
    }}>{v}</span>
  );
}

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const CURRENT_YEAR = 2026;
const YEARS = [2025, 2026, 2027];

export function Kpi3dClient({ defaultMonth, defaultYear }: { defaultMonth: number; defaultYear: number }) {
  const [month, setMonth] = useState(defaultMonth);
  const [year,  setYear]  = useState(defaultYear);

  const { data, isFetching, isError } = useQuery<{ data: DesignerKpi[]; month: number; year: number }>({
    queryKey: ["kpi-3d", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/admin/kpi-3d?month=${month}&year=${year}`);
      if (!res.ok) throw new Error("Lỗi tải dữ liệu KPI");
      return res.json();
    },
    staleTime: 30 * 60_000, // cache 30 phút — KPI theo tháng ít thay đổi realtime
    gcTime:    30 * 60_000,
  });

  const rows = data?.data ?? [];

  // Totals
  const totals = rows.reduce(
    (acc, r) => ({
      donGiao:     acc.donGiao     + r.donGiao,
      donHT:       acc.donHT       + r.donHT,
      donChuaHT:   acc.donChuaHT   + r.donChuaHT,
      donTamDung:  acc.donTamDung  + r.donTamDung,
      donBiChuyenDi: acc.donBiChuyenDi + r.donBiChuyenDi,
      donTiepTuc: acc.donTiepTuc + r.donTiepTuc,
      donTre:      acc.donTre      + r.donTre,
      donDungHan:  acc.donDungHan  + r.donDungHan,
      donChoBuong: acc.donChoBuong + r.donChoBuong,
      tongGio:     acc.tongGio     + r.tongGio,
    }),
    { donGiao: 0, donHT: 0, donChuaHT: 0, donTamDung: 0, donBiChuyenDi: 0, donTiepTuc: 0, donTre: 0, donDungHan: 0, donChoBuong: 0, tongGio: 0 }
  );
  const totalNgay = Math.round((totals.tongGio / 8) * 10) / 10;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tháng</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="psx-input"
            style={{ fontSize: "13px", width: "72px" }}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Năm</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="psx-input"
            style={{ fontSize: "13px", width: "88px" }}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {isFetching && <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Đang tải...</span>}
        {isError   && <span style={{ fontSize: "11px", color: "var(--s-red, #dc2626)" }}>Lỗi tải dữ liệu</span>}
      </div>

      {/* ĐÃ BỎ LEGEND ("Số liệu chính" / "Trễ deadline").
          Hai ô màu đó giải thích màu của hai cột — nhưng CHÍNH TIÊU ĐỀ hai cột đó đã được
          tô đúng màu ấy và tự gọi tên mình ("Đơn trễ deadline" màu đỏ). Màu ở đây là ĐẤU
          NHẤN, không phải một mã cần tra — mã mới cần legend. Một chú giải cho thứ không cần
          tra chỉ làm người đọc tưởng mình đang bỏ sót điều gì. */}

      {/* Table */}
      <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "940px" }}>
          <thead>
            <tr>
              <th style={{ ...THLeft, width: "36px", textAlign: "center" }}>#</th>
              <th style={{ ...THLeft, minWidth: "160px" }}>Nhân viên</th>
              <th style={TH} title="Đếm theo NGÀY GIAO 3D nằm trong tháng đang chọn">Đơn được giao<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>trong tháng</span></th>
              <th style={{ ...TH, color: "#1E40AF" }} title="Đếm theo NGÀY HOÀN THÀNH 3D nằm trong tháng đang chọn — kể cả đơn giao từ tháng trước">Đơn HT<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>trong tháng</span></th>
              <th style={TH} title="Giao trong tháng này mà chưa có ngày HT — đã trừ đơn tạm dừng và đơn bị chuyển đi">Đơn chưa HT<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>trong tháng</span></th>
              {/* Tách khỏi "chưa HT": đơn bị Admin/Order bắt gác để nhảy sang đơn gấp hơn không
                  phải lỗi của nhân viên. Gộp chung là buộc tội họ cho một quyết định điều hành. */}
              <th style={TH} title="Đơn đang bị tạm dừng theo yêu cầu — đã trừ khỏi cột Đơn chưa HT">
                Đơn tạm dừng<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>theo yêu cầu</span>
              </th>
              {/* Đơn bị lấy đi giao người khác mà người duyệt VẪN quyết định tính công. Trường
                  hợp chọn "không tính KPI" không hiện ở đây — lượt đó bị loại khỏi cả báo cáo. */}
              <th style={TH} title="Đơn bị chuyển sang nhân viên khác nhưng vẫn được tính công — đã trừ khỏi cột Đơn chưa HT">
                Đơn bị chuyển đi<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>vẫn tính công</span>
              </th>
              {/* Cột "Đơn được giao" neo theo tháng GIAO, nên đơn bị gác từ tháng trước và làm
                  tiếp tháng này khiến tháng này nhìn như nhân viên rảnh. Cột này bổ sung thông
                  tin đó mà KHÔNG sửa số của tháng trước — số đã báo cáo thì không nên đổi. */}
              <th style={TH} title="Đơn được giao từ tháng trước, tháng này vẫn ghi nhận giờ làm">
                Đơn tiếp tục<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>từ tháng trước</span>
              </th>
              <th style={{ ...TH, color: "var(--s-red, #dc2626)" }} title="Hoàn thành sau Deadline KPI — deadline do hệ thống tự tính theo lịch làm việc">Đơn trễ<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>deadline</span></th>
              <th style={TH} title="Hoàn thành đúng hoặc trước Deadline KPI — % tính trên số Đơn HT trong tháng">Đơn HT<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>đúng hạn</span></th>
              <th style={TH} title="Toàn bộ đơn đang chờ HT Ở MỌI THỜI ĐIỂM — KHÔNG lọc theo tháng đang chọn">Tồn đơn<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(mọi thời điểm)</span></th>
              <th style={{ ...TH, color: "#1E40AF" }} title="Tổng giờ thực tế ghi nhận TRONG tháng — đơn làm vắt tháng thì mỗi tháng chỉ tính phần giờ của tháng đó">Tổng giờ TT<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>/ tháng</span></th>
              <th style={TH} title="Tổng giờ thực tế chia cho số giờ MỘT NGÀY LÀM VIỆC của lịch, không phải hằng số 8 giờ">Qui đổi<br /><span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>ngày</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={13} style={{ ...TD, padding: "40px", color: "var(--ink-muted)" }}>
                  Không có dữ liệu cho tháng {month}/{year}
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const pctDungHan = r.donHT > 0 ? Math.round((r.donDungHan / r.donHT) * 100) : null;
              const isOther = r.isOther === true;
              return (
                <tr key={r.name} style={{
                  background: isOther
                    ? "rgba(251,191,36,0.08)"
                    : i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                  borderTop: isOther ? "1px dashed var(--border)" : undefined,
                }}>
                  <td style={{ ...TD, fontSize: "11px", color: "var(--ink-muted)" }}>
                    {isOther ? "?" : i + 1}
                  </td>
                  <td style={TDLeft}>
                    {isOther ? (
                      <span style={{ fontStyle: "italic", color: "var(--ink-muted)", fontSize: "12px" }}>
                        Khác (tên không có trong danh sách)
                      </span>
                    ) : (
                      <>
                        <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "var(--ink-muted)", marginRight: "6px" }}>{r.code}</span>
                        <span style={{ fontWeight: 500, color: "var(--ink)" }}>{r.name}</span>
                      </>
                    )}
                  </td>
                  <td style={TD}><Num v={r.donGiao} /></td>
                  <td style={TD}><Num v={r.donHT} blue /></td>
                  <td style={TD}><Num v={r.donChuaHT} /></td>
                  <td style={TD}><Num v={r.donTamDung} /></td>
                  <td style={TD}><Num v={r.donBiChuyenDi} /></td>
                  <td style={TD}><Num v={r.donTiepTuc} /></td>
                  <td style={TD}><Num v={r.donTre} red /></td>
                  <td style={TD}>
                    {r.donHT > 0 ? (
                      <span style={{ fontWeight: 600, color: "var(--s-green, #16a34a)" }}>
                        {r.donDungHan}
                        {pctDungHan !== null && (
                          <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--ink-muted)", marginLeft: "3px" }}>({pctDungHan}%)</span>
                        )}
                      </span>
                    ) : <span style={{ color: "var(--ink-muted)", fontSize: "12px" }}>—</span>}
                  </td>
                  <td style={TD}><Num v={r.donChoBuong} /></td>
                  <td style={TD}><span style={{ fontWeight: 600, color: r.tongGio > 0 ? "#1E40AF" : "var(--ink-muted)", fontSize: r.tongGio > 0 ? "13px" : "12px" }}>{r.tongGio > 0 ? r.tongGio : "—"}</span></td>
                  <td style={TD}><span style={{ fontWeight: 600, color: r.quiDoiNgay > 0 ? "var(--ink)" : "var(--ink-muted)", fontSize: r.quiDoiNgay > 0 ? "13px" : "12px" }}>{r.quiDoiNgay > 0 ? r.quiDoiNgay : "—"}</span></td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ background: "var(--cream-dark, #f0ebe3)", borderTop: "2px solid var(--border)" }}>
                <td colSpan={2} style={{ ...TDLeft, fontWeight: 700, fontSize: "12px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Tổng cộng
                </td>
                <td style={{ ...TD, fontWeight: 700 }}>{totals.donGiao || "—"}</td>
                <td style={{ ...TD, fontWeight: 700, color: "#1E40AF" }}>{totals.donHT || "—"}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{totals.donChuaHT || "—"}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{totals.donTamDung || "—"}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{totals.donBiChuyenDi || "—"}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{totals.donTiepTuc || "—"}</td>
                <td style={{ ...TD, fontWeight: 700, color: "var(--s-red, #dc2626)" }}>{totals.donTre || "—"}</td>
                <td style={{ ...TD, fontWeight: 700, color: "var(--s-green, #16a34a)" }}>{totals.donDungHan || "—"}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{totals.donChoBuong || "—"}</td>
                <td style={{ ...TD, fontWeight: 700, color: "#1E40AF" }}>{totals.tongGio > 0 ? Math.round(totals.tongGio * 1000) / 1000 : "—"}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{totalNgay > 0 ? totalNgay : "—"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ĐÃ BỎ DÒNG CHÚ THÍCH CHÂN BẢNG.
          Bốn định nghĩa của nó ĐÃ ĐƯỢC NÓI bởi dòng phụ của chính các cột đó ("trong tháng",
          "(mọi thời điểm)"), nên nó là lần thứ hai của cùng một câu — và nằm cách xa cột nhất
          có thể, dưới đáy bảng.
          Phần giải thích thật đã chuyển vào `title` của từng cột: đọc được ĐÚNG LÚC đang trỏ
          vào cột khó hiểu, thay vì phải cuộn xuống rồi tự dò xem định nghĩa nào ứng cột nào.
          Bốn cột đã có `title` từ trước chính là bằng chứng rằng đây mới là chỗ đúng. */}
    </div>
  );
}
