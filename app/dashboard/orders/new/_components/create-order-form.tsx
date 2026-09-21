"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, AlertCircle, Copy, CheckCircle2 } from "lucide-react";
// PRIORITY_SLA_DAYS là pure constant — an toàn import phía client
// V2 ref: UU_TIEN_DAYS = { UT1:7, UT2:14, Normal:21, "SR — 30 ngày":30 }
import type { PriorityCode } from "@/app/lib/business/order-helpers";
import {
  calcDukien, formatDateVN, parseZodErrors, toPayload, todayVn,
  type FlowType, type FormDraft, type ItemDraft,
} from "@/app/lib/business/orders/create-order-payload";
import { useLabels } from "@/app/lib/i18n/locale-context";
import { getSnapshotKeysForNewOrder } from "@/app/lib/utils/snapshot-keys";
import { DateInput } from "@/app/dashboard/orders/_components/date-input";
import { PlatingSelect } from "@/app/dashboard/orders/_components/plating-select";
import { NvlSelect } from "@/app/dashboard/orders/_components/nvl-select";

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Dropdown constants ────────────────────────────────────────────────────────
// V2: nguon / phanLoai / tenSp / nvl / xiMa / loaiHotChu
// đều đến từ getPortalDropdowns() → cfg_Dropdowns sheet.
// V3: fallback tĩnh — thay bằng /api/config/dropdowns khi admin UI sẵn sàng.

// V2 ref: DD.nguon — từ sheet cfg_Dropdowns cột NGUON
const NGUON_OPTIONS = ["CH1", "CH2", "CH3", "ADM1", "ADM2", "PSX", "R&D"];

// V2 ref: DD.phanLoai — từ sheet cfg_Dropdowns cột PHAN LOAI KH
// PK = Phụ Kiện nội bộ (đơn hàng của Phòng Sản Xuất / R&D)
const PHAN_LOAI_KH_OPTIONS = ["VIP", "KH", "SR", "PK"];

// V2 ref: result.tenSp fallbacks trong getPortalDropdowns()
const TEN_SP_OPTIONS = [
  "Vỏ nhẫn",
  "Vỏ nhẫn xoàn", "Vỏ nhẫn trơn", "Nhẫn band xoàn", "Nhẫn band trơn",
  "Vỏ mặt xoàn", "Vỏ mặt trơn", "Mặt dây xoàn", "Mặt dây trơn",
  "Vỏ vòng xoàn", "Vỏ vòng trơn", "Vòng tay xoàn", "Vỏ bông tai xoàn",
  "Vỏ bông tai trơn", "Bông tai xoàn", "Bông tai trơn", "Vỏ lắc xoàn",
  "Vỏ lắc trơn", "Lắc tay xoàn", "Lắc tay trơn", "Dây chuyền",
  "Vỏ vòng cổ xoàn", "Vỏ vòng cổ trơn", "Vòng cổ xoàn", "Vòng cổ trơn",
  "Phụ kiện", "Charm",
  "Dây chuyền tay", "Khoen mũi",
];

// NVL_OPTIONS gom về nguồn dùng chung (app/lib/business/product-options) — dùng qua NvlSelect
// (checkbox chọn nhiều). Trước đây file này khai báo riêng với quy ước "18KW-Y" khác panel
// ("18KW/KY") → đã chuẩn hoá về một dạng duy nhất, nối bằng "/".

// V2 ref: result.xiMa fallbacks
// XI_MA_OPTIONS gom về nguồn dùng chung (app/lib/business/product-options).

// V2 ref: result.loaiHotChu fallbacks; label trong HTML là "Loại đá chủ" (i-loaihot)
const LOAI_HOT_CHU_OPTIONS = ["XOÀN TN", "LAB", "CZ", "ĐÁ MÀU", "NGỌC TRAI"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Initial state ────────────────────────────────────────────────────────────

// "Hôm nay" theo giờ VN (+7), không phải UTC — nếu chỉ dùng new Date().toISOString()
// (UTC), từ 00:00–07:00 giờ VN ngày mới, UTC vẫn còn là NGÀY HÔM TRƯỚC → TODAY sẽ sai
// lùi 1 ngày trong khung giờ đó.
const TODAY = todayVn(new Date());

const BLANK_ITEM: ItemDraft = {
  moId: "",
  tenSp: "", nvl: "", soLuong: "1", size: "", trongLuongYc: "",
  xiMa: "", loaiHotChu: "", thongSoDaChu: "", thongSoDaTam: "",
  file3d: "", dienGiai: "", ghiChuSp: "",
};

const INITIAL_FORM: FormDraft = {
  soOdoo: "",
  khachHang: "", salesName: "", nguon: "", phanLoaiKh: "",
  uuTien: "Normal",
  ngayChot: TODAY,
  ngayDukien: calcDukien("Normal", TODAY),
  dateIsAuto: true,
  donHang3Sao: false, linkChat: "", ghiChu: "",
  loaiDon: "production",
  items: [{ ...BLANK_ITEM }],
};

// ─── Payload builder: FormDraft → POST /api/orders ────────────────────────────

// ─── Helper ───────────────────────────────────────────────────────────────────

function fromTabToLoaiDon(fromTab?: string): FlowType {
  if (fromTab === "master-hub") return "production";
  // pre-production, all, completed, cancelled, undefined → default PTK
  return "pre_production";
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CreateOrderForm({ fromTab }: { fromTab?: string }) {
  const L                               = useLabels();
  const router                          = useRouter();
  const queryClient                     = useQueryClient();
  const [form, setForm]                 = useState<FormDraft>(() => ({
    ...INITIAL_FORM,
    loaiDon: fromTabToLoaiDon(fromTab),
  }));
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // SO# duplicate check
  type SoCheckState = "idle" | "checking" | "ok" | "taken";
  type SoCheckMeta = { orderId: string; customerName: string; salesName: string; nguon: string; donHang3Sao: boolean; linkChat: string; itemCount: number; status: string } | null;
  const [soCheck, setSoCheck]           = useState<SoCheckState>("idle");
  const [soCheckOrderId, setSoCheckOrderId] = useState<string | null>(null);
  const [soCheckMeta, setSoCheckMeta]   = useState<SoCheckMeta>(null);
  const soDebounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutWarnRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // code → id map, dùng để resolve storeId khi submit
  const [storeMap, setStoreMap]         = useState<Record<string, string>>({});

  // Restore form nếu user quay lại sau khi API thất bại
  useEffect(() => {
    const restore = queryClient.getQueryData<{ formSnapshot: FormDraft }>(["pending-create-restore"]);
    if (restore?.formSnapshot) {
      setForm(restore.formSnapshot);
      queryClient.removeQueries({ queryKey: ["pending-create-restore"] });
      queryClient.removeQueries({ queryKey: ["pending-create-failed"] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (!json?.data) return;
        const map: Record<string, string> = {};
        for (const s of json.data) map[s.code] = s.id;
        setStoreMap(map);
      })
      .catch(() => {});
  }, []);

  // Debounced SO# duplicate check — 600ms after user stops typing
  useEffect(() => {
    const so = form.soOdoo.trim();

    // Clear previous timer
    if (soDebounceRef.current) clearTimeout(soDebounceRef.current);

    // Only check if format looks valid (YY.NNNNN+)
    if (!so || !/^\d{2}\.\d{4,}$/.test(so)) {
      setSoCheck("idle");
      setSoCheckOrderId(null);
      setSoCheckMeta(null);
      return;
    }

    setSoCheck("checking");
    soDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/check-so?number=${encodeURIComponent(so)}`);
        const json = await res.json();
        if (json.exists) {
          setSoCheck("taken");
          setSoCheckOrderId(json.orderId ?? null);
          const meta: NonNullable<SoCheckMeta> = {
            orderId: json.orderId,
            customerName: json.customerName ?? "",
            salesName: json.salesName ?? "",
            nguon: json.nguon ?? "",
            donHang3Sao: json.donHang3Sao ?? false,
            linkChat: json.linkChat ?? "",
            itemCount: json.itemCount ?? 0,
            status: json.status ?? "",
          };
          setSoCheckMeta(meta);
          // Pre-fill từ SO hiện có — dùng làm mặc định, user vẫn sửa được cho riêng MO này
          // (trừ Nguồn — luôn dùng chung SO, không cho sửa).
          setForm((prev) => ({
            ...prev,
            khachHang: meta.customerName,
            salesName: meta.salesName,
            nguon: meta.nguon,
            donHang3Sao: meta.donHang3Sao,
            linkChat: meta.linkChat,
          }));
        } else {
          setSoCheck("ok");
          setSoCheckOrderId(null);
          setSoCheckMeta(null);
        }
      } catch {
        setSoCheck("idle");
      }
    }, 600);

    return () => {
      if (soDebounceRef.current) clearTimeout(soDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.soOdoo]);

  function setField<K extends keyof FormDraft>(key: K, value: FormDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  // V2 ref: onDateChange() — tính lại ngayDukien khi đổi uuTien hoặc ngayChot
  function handleUuTienChange(val: PriorityCode | "") {
    setForm((prev) => ({
      ...prev,
      uuTien:     val,
      ngayDukien: prev.dateIsAuto ? calcDukien(val, prev.ngayChot) : prev.ngayDukien,
    }));
    setErrors((prev) => { const n = { ...prev }; delete n.uuTien; return n; });
  }

  function handleNgayChotChange(dateStr: string) {
    setForm((prev) => ({
      ...prev,
      ngayChot:   dateStr,
      ngayDukien: prev.dateIsAuto ? calcDukien(prev.uuTien, dateStr) : prev.ngayDukien,
    }));
    setErrors((prev) => { const n = { ...prev }; delete n.ngayChot; delete n.ngayDukien; return n; });
  }

  // V2 ref: markManual() — user tự gõ ngayDukien → không tự tính lại nữa
  function handleNgayDukienChange(dateStr: string) {
    setForm((prev) => ({ ...prev, ngayDukien: dateStr, dateIsAuto: false }));
    setErrors((prev) => { const n = { ...prev }; delete n.ngayDukien; return n; });
  }

  // V2 ref: setFlow() — switch production / pre_production
  function handleLoaiDon(val: FlowType) {
    setForm((prev) => {
      if (val === "pre_production") {
        // V2: xóa ngày + ưu tiên khi chuyển sang Phòng Thiết kế
        return { ...prev, loaiDon: val, uuTien: "", ngayChot: "", ngayDukien: "", dateIsAuto: true };
      }
      const uuTien   = (prev.uuTien || "Normal") as PriorityCode;
      const ngayChot = prev.ngayChot || TODAY;
      return {
        ...prev, loaiDon: val, uuTien, ngayChot,
        ngayDukien: prev.dateIsAuto ? calcDukien(uuTien, ngayChot) : prev.ngayDukien,
      };
    });
  }

  const updateItem = useCallback((index: number, patch: Partial<ItemDraft>) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...patch };
      return { ...prev, items };
    });
    setErrors((prev) => {
      const n = { ...prev };
      Object.keys(patch).forEach((k) => delete n[`items.${index}.${k}`]);
      return n;
    });
  }, []);

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...BLANK_ITEM }] }));
  }

  // V2 ref: duplicateItem() — copy tất cả nhưng xóa MO# (user phải nhập riêng vì không trùng)
  function duplicateItem(index: number) {
    setForm((prev) => {
      const items = [...prev.items];
      items.splice(index + 1, 0, { ...items[index], moId: "" });
      return { ...prev, items };
    });
  }

  function removeItem(index: number) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }

  // V2 ref: validateOrder() + validateItems()
  function validateClient(): Record<string, string> {
    const errs: Record<string, string> = {};
    const isPre = form.loaiDon === "pre_production";

    // SO# từ Odoo — bắt buộc, định dạng YY.NNNNN+ (VD: 26.10680)
    const so = form.soOdoo.trim();
    if (!so) {
      errs.soOdoo = "Bắt buộc nhập SO# từ Odoo";
    } else if (!/^\d{2}\.\d{4,}$/.test(so)) {
      errs.soOdoo = "Sai định dạng — VD: 26.10680 (2 chữ số . 4+ chữ số)";
    }

    // V2: bắt buộc Khách hàng, Sales (text) — vẫn bắt buộc cả khi thêm vào đơn cũ vì có thể
    // ghi đè riêng cho MO này. Nguồn luôn dùng chung SO, không cần check khi soCheck=taken.
    if (!form.khachHang.trim())  errs.khachHang  = "Bắt buộc nhập";
    if (!form.salesName.trim())  errs.salesName  = "Bắt buộc nhập";
    if (soCheck !== "taken") {
      if (!form.nguon)             errs.nguon      = "Bắt buộc chọn";
    }

    // V2: Ngày chốt SX bắt buộc với luồng Sản Xuất, optional với Phòng Thiết kế
    if (!isPre && !form.ngayChot) errs.ngayChot = "Bắt buộc chọn";

    // V2: ngayDukien phải >= ngayChot
    if (form.ngayChot && form.ngayDukien && form.ngayDukien < form.ngayChot) {
      errs.ngayDukien = "Phải sau hoặc bằng Ngày chốt SX";
    }

    // V2: validateItems() — bắt buộc MO# + Tên SP + NVL + SL >= 1
    // V2 ref: validateCrMO() — format phải khớp YY.NNNNN+ (VD: 26.10680)
    const seenMo = new Set<string>();
    form.items.forEach((item, i) => {
      const mo = item.moId.trim();
      if (!mo) {
        errs[`items.${i}.moId`] = "Bắt buộc nhập MO#";
      } else if (!/^\d{2}\..{3,}/.test(mo)) {
        errs[`items.${i}.moId`] = "Sai định dạng — VD: 26.10680";
      } else if (seenMo.has(mo.toLowerCase())) {
        errs[`items.${i}.moId`] = "MO# trùng trong cùng đơn";
      } else {
        seenMo.add(mo.toLowerCase());
      }
      if (!item.tenSp) errs[`items.${i}.tenSp`] = "Bắt buộc chọn";
      if (!item.nvl)   errs[`items.${i}.nvl`]   = "Bắt buộc chọn";

      // Số lượng luôn = 1 — không cần validate

      // TL Yêu Cầu: optional cho cả đơn production lẫn PTK — sales có thể chưa có số liệu
      // lúc tạo đơn, bổ sung sau. Chỉ validate khi CÓ nhập thì phải > 0.
      if (item.trongLuongYc !== "") {
        const w = parseFloat(item.trongLuongYc);
        if (isNaN(w) || w <= 0) errs[`items.${i}.trongLuongYc`] = "Phải > 0";
      }

      // File 3D phải là URL hợp lệ nếu có nhập
      if (item.file3d.trim() && !/^https?:\/\/.+/.test(item.file3d.trim())) {
        errs[`items.${i}.file3d`] = "Phải là URL hợp lệ — VD: https://drive.google.com/...";
      }
    });

    if (form.linkChat.trim() && !/^https?:\/\/.+/.test(form.linkChat.trim())) {
      errs.linkChat = "Phải là URL hợp lệ — VD: https://zalo.me/...";
    }

    return errs;
  }

  async function handleAddToExisting() {
    if (!soCheckMeta) return;

    const clientErrs = validateClient();
    // Validate items + Khách hàng/Sales/Link chat (có thể ghi đè riêng cho MO này).
    // Nguồn luôn dùng chung SO nên không cần check ở đây.
    const relevantErrs = Object.fromEntries(
      Object.entries(clientErrs).filter(([k]) => k.startsWith("items.") || k === "khachHang" || k === "salesName" || k === "linkChat")
    );
    if (Object.keys(relevantErrs).length > 0) {
      setErrors(relevantErrs);
      setTimeout(() => document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }

    const { createOrderSchema: schema } = await import("@/app/lib/schemas/order");
    const dummyPayload = toPayload({ ...form, soOdoo: "00.0000" }, storeMap);

    // Ghi đè riêng cho MO này — chỉ gửi khi khác giá trị gốc của SO, để MO khác không set
    // override vẫn tiếp tục ăn theo SO nếu sau này SO đổi. Nguồn KHÔNG có override.
    const overrides: Record<string, unknown> = {};
    if (form.khachHang.trim() !== soCheckMeta.customerName) overrides.customerNameOverride = form.khachHang.trim();
    if (form.salesName.trim() !== soCheckMeta.salesName) overrides.salesNameOverride = form.salesName.trim();
    if (form.donHang3Sao !== soCheckMeta.donHang3Sao) overrides.donHang3SaoOverride = form.donHang3Sao;
    if (form.linkChat.trim() !== soCheckMeta.linkChat) overrides.linkChatOverride = form.linkChat.trim();

    // Ưu tiên/Ngày chốt/Dự kiến/Ghi chú Sales — cột riêng trên OrderItem, độc lập theo từng MO,
    // không đụng tới MO cũ trong cùng SO.
    const schedule: Record<string, unknown> = {};
    if (form.uuTien) schedule.priorityCode = form.uuTien;
    // Parse UTC ("Z") — cùng lý do đã sửa ở nhánh tạo SO mới phía trên, tránh lệch 1 ngày.
    if (form.ngayChot) schedule.estimatedDate = new Date(form.ngayChot + "T00:00:00Z").toISOString();
    // Gửi ĐÚNG giá trị đang hiển thị (không phân biệt dateIsAuto) — trống thì không gửi,
    // server sẽ lưu blank thay vì tự bịa ngày.
    if (form.ngayDukien) schedule.requiredDate = new Date(form.ngayDukien + "T00:00:00Z").toISOString();
    if (form.ghiChu.trim()) schedule.saleNote = form.ghiChu.trim();
    // Zone MO mới theo ĐÚNG nút "SẢN XUẤT NGAY / PHÒNG THIẾT KẾ" đang chọn trên form —
    // không ép theo zone hiện tại của SO (SO có thể đang PTK nhưng user muốn thêm MO thẳng vào PSX).
    const zone: Record<string, unknown> = { zone: form.loaiDon === "pre_production" ? "PRE_PRODUCTION" : "MASTER_HUB" };

    const itemsWithOverrides = dummyPayload.items.map((item) => ({ ...item, ...schedule, ...overrides, ...zone }));
    const parsedItems = schema.shape.items.safeParse(itemsWithOverrides);
    if (!parsedItems.success) {
      setErrors(parseZodErrors(parsedItems.error.issues.map((i) => ({ ...i, path: ["items", ...i.path] }))));
      return;
    }

    setIsSubmitting(true);
    const soOdoo = form.soOdoo.trim();
    const targetId = soCheckMeta.orderId;

    // Đưa về ĐÚNG phòng đã chọn (PTK/PSX) thay vì mở sidebar. Trước đây push
    // `?orderId=` khiến (a) sidebar tự bung và (b) thiếu `?tab=` nên rơi về tab
    // mặc định "master-hub" (PSX) — MO thêm vào PTK bị "lạc tab", tưởng như không
    // hiện. Push `?tab=` theo đúng loaiDon để MO xuất hiện ngay ở phòng của nó.
    const targetTab = form.loaiDon === "pre_production" ? "pre-production" : "master-hub";
    router.push(`/dashboard/orders?tab=${targetTab}`);

    toast.promise(
      fetch(`/api/orders/${targetId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsedItems.data }),
      }).then(async (res) => {
        if (res.status === 201) {
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["orders-snapshot"] });
          queryClient.invalidateQueries({ queryKey: ["order-panel", targetId] });
          return parsedItems.data.length;
        }
        const json = await res.json().catch(() => null);
        if (res.status === 409) throw new Error(json?.error?.message ?? "Đơn đã hoàn tất hoặc đã hủy");
        throw new Error(json?.error?.message ?? `Lỗi máy chủ (${res.status})`);
      }),
      {
        loading: `Đang thêm sản phẩm vào đơn ${soOdoo}…`,
        success: (count) => `Đã thêm ${count} sản phẩm vào đơn ${soOdoo}!`,
        error: (err: Error) => `Thêm sản phẩm thất bại — ${err.message}`,
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Nếu SO đã tồn tại, dẫn user qua flow thêm sản phẩm thay vì tạo đơn mới
    if (soCheck === "taken") {
      await handleAddToExisting();
      return;
    }

    const clientErrs = validateClient();
    if (Object.keys(clientErrs).length > 0) {
      setErrors(clientErrs);
      setTimeout(() => {
        document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    const payload = toPayload(form, storeMap);
    setIsSubmitting(true);
    const { createOrderSchema } = await import("@/app/lib/schemas/order");
    const parsed = createOrderSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(parseZodErrors(parsed.error.issues));
      setIsSubmitting(false);
      setTimeout(() => {
        document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    // Capture values — component sẽ unmount sau khi navigate
    const soOdoo        = form.soOdoo.trim();
    const targetTab     = form.loaiDon === "pre_production" ? "pre-production" : "master-hub";
    const finalPayload  = parsed.data;
    const tempId        = `pending-${Date.now()}`;

    // Capture form snapshot trước khi navigate (component sẽ unmount)
    const formSnapshot = { ...form, items: form.items.map(i => ({ ...i })) };

    // Báo hiệu "đang tạo đơn" cho orders-client — row placeholder xuất hiện ngay
    queryClient.setQueryData(["pending-create"], {
      tempId,
      soOdoo,
      tab:          targetTab,
      status:       "saving",
      customerName: form.khachHang || "…",
      salesName:    form.salesName || null,
      nguon:        form.nguon     || null,
      ngayDukien:   form.ngayDukien || null,
      uuTien:       form.uuTien    || "Normal",
      loaiDon:      form.loaiDon,
      itemCount:    form.items.length,
      createdAt:    new Date().toISOString(),
      formSnapshot,
      firstItem: form.items[0] ? {
        moId:         form.items[0].moId,
        tenSp:        form.items[0].tenSp,
        nvl:          form.items[0].nvl,
        size:         form.items[0].size,
        soLuong:      form.items[0].soLuong,
        xiMa:         form.items[0].xiMa,
        loaiHotChu:   form.items[0].loaiHotChu,
        thongSoDaChu: form.items[0].thongSoDaChu,
        trongLuongYc: form.items[0].trongLuongYc,
      } : null,
      allItemsData: form.items.map(item => ({
        moId:         item.moId,
        tenSp:        item.tenSp,
        nvl:          item.nvl,
        size:         item.size,
        soLuong:      item.soLuong,
        xiMa:         item.xiMa,
        loaiHotChu:   item.loaiHotChu,
        thongSoDaChu: item.thongSoDaChu,
        trongLuongYc: item.trongLuongYc,
      })),
    });

    // Thoát ngay — không chờ API; ?from=create báo page.tsx bỏ qua SSR
    router.push(`/dashboard/orders?tab=${targetTab}&from=create`);

    // Warning nếu API mất quá 15 giây
    timeoutWarnRef.current = setTimeout(() => {
      toast.warning(`Đang mất thời gian hơn bình thường để lưu đơn ${soOdoo}…`, {
        id: `create-timeout-${tempId}`,
        duration: Infinity,
      });
    }, 15_000);

    // API chạy nền — dọn dẹp pending state khi xong (try/finally đảm bảo luôn cleanup)
    (async () => {
      try {
        const res = await fetch("/api/orders", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(finalPayload),
        });
        if (res.status === 201) {
          const json = await res.json();
          const realOrderId = json?.data?.id;
          const orderNumber = (json?.data?.orderNumber ?? soOdoo) as string;

          if (realOrderId) {
            // Inject đơn mới trực tiếp vào snapshot cache — không cần refetch, không loading
            try {
              const snapRes = await fetch(`/api/orders?all=true&ids=${realOrderId}`);
              if (snapRes.ok) {
                const snapJson = await snapRes.json();
                const newOrder = snapJson?.data?.[0];
                if (newOrder) {
                  // Inject vào tất cả snapshot keys liên quan (all + zone-specific)
                  const keys = getSnapshotKeysForNewOrder(form.loaiDon as "production" | "pre_production");
                  for (const key of keys) {
                    queryClient.setQueryData(
                      ["orders-snapshot", key],
                      (old: { data: unknown[]; pagination: unknown } | undefined) => {
                        if (!old?.data) return old;
                        return { ...old, data: [newOrder, ...old.data] };
                      },
                    );
                  }
                }
              }
            } catch {
              // Inject thất bại → fallback: orders-client sẽ tự sync qua heartbeat
            }
            // Signal flash highlight cho row mới
            queryClient.setQueryData(["new-order-flash"], realOrderId);
          }
          // Chỉ toast success — amber row đã làm loading indicator, recovery banner xử lý error
          toast.success(`Tạo đơn ${orderNumber} thành công!`);
          return;
        }
        if (res.status === 409) throw new Error("SO# này đã tồn tại trong hệ thống");
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `Lỗi máy chủ (${res.status})`);
      } catch (err) {
        // Lưu form data để user có thể retry — recovery banner trong orders-client hiện thông báo
        queryClient.setQueryData(["pending-create-failed"], {
          soOdoo,
          errorMessage: err instanceof Error ? err.message : "Lỗi không xác định",
          formSnapshot,
        });
      } finally {
        // Hủy timeout warning dù thành công hay thất bại
        if (timeoutWarnRef.current) {
          clearTimeout(timeoutWarnRef.current);
          toast.dismiss(`create-timeout-${tempId}`);
        }
        queryClient.removeQueries({ queryKey: ["pending-create"] });
      }
    })();
  }

  const isPre     = form.loaiDon === "pre_production";
  const itemCount = form.items.length;

  return (
    <form onSubmit={handleSubmit} noValidate style={{ paddingBottom: "72px" }}>

      {/* ── Header: flow selector ─────────────────────────────────────────── */}
      <div style={{
        background: "var(--cream-card)", height: "48px", padding: "0 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: "10px", fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
          Sales Production Portal
        </span>
        <div style={{ display: "flex", border: "1px solid var(--border)", padding: "2px", gap: "2px" }}>
          {(["production", "pre_production"] as const).map((flow) => {
            const active = form.loaiDon === flow;
            return (
              <button key={flow} type="button" onClick={() => handleLoaiDon(flow)}
                style={{
                  fontSize: "10px", fontWeight: 700, padding: "5px 16px",
                  textTransform: "uppercase", letterSpacing: "0.08em", border: "none",
                  cursor: "pointer", transition: "all 0.15s",
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--cream)" : "var(--ink-muted)",
                }}>
                {flow === "production" ? L.ui.form.flowProduction : L.ui.form.flowPreProd}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
          {isPre ? L.ui.form.flowHintPreProd : L.ui.form.flowHintProduction}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "16px" }}>

        {Object.keys(errors).length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid var(--s-gold)", padding: "8px 14px", fontSize: "12px", color: "var(--s-gold)", background: "rgba(138,106,26,0.06)" }}>
            <AlertCircle style={{ width: "13px", height: "13px", flexShrink: 0 }} />
            Có <strong>{Object.keys(errors).length}</strong> lỗi cần kiểm tra — vui lòng xem lại các trường được đánh dấu đỏ
          </div>
        )}

        {/* ══ SECTION 1: Thông tin đơn hàng ══════════════════════════════════════ */}
        <Card title={L.ui.form.orderInfo}>

          {/* Hàng 1: SO | KH | Sales | Nguồn */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "14px" }}>
            <VField label={L.ui.form.soOdoo} required error={errors.soOdoo}>
              <VInput value={form.soOdoo} onChange={(v) => setField("soOdoo", v)}
                placeholder="VD: 26.10680" hasError={!!errors.soOdoo || soCheck === "taken"} />
              {soCheck === "checking" && (
                <span style={{ fontSize: "10px", color: "var(--ink-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Loader2 style={{ width: "10px", height: "10px" }} className="animate-spin" />
                  Đang kiểm tra...
                </span>
              )}
              {soCheck === "ok" && (
                <span style={{ fontSize: "10px", color: "var(--s-green)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 style={{ width: "10px", height: "10px" }} />
                  SO# hợp lệ
                </span>
              )}
              {soCheck === "taken" && soCheckMeta && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: "6px",
                  background: "rgba(138,106,26,0.07)", border: "1px solid rgba(138,106,26,0.3)",
                  borderRadius: "4px", padding: "8px 10px", marginTop: "2px",
                }}>
                  <span style={{ fontSize: "10px", color: "var(--s-gold)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                    <AlertCircle style={{ width: "10px", height: "10px", flexShrink: 0 }} />
                    SO này đã có trên hệ thống
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--ink-body)" }}>
                    <strong>{soCheckMeta.customerName}</strong>
                    {" · "}{soCheckMeta.itemCount} sản phẩm đang có
                  </span>
                  {(soCheckMeta.status === "COMPLETED" || soCheckMeta.status === "CANCELLED") && (
                    <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
                      Đơn này đã {soCheckMeta.status === "COMPLETED" ? "Hoàn tất" : "Đã hủy"} — MO mới thêm vào sẽ độc lập,
                      không ảnh hưởng các MO cũ trong đơn.
                    </span>
                  )}
                  <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                    <button
                      type="submit"
                      style={{
                        fontSize: "10px", fontWeight: 700, padding: "4px 10px",
                        background: "var(--s-green)", color: "#fff", border: "none",
                        borderRadius: "3px", cursor: "pointer", letterSpacing: "0.04em",
                      }}
                    >
                      + Thêm {form.items.length} sản phẩm vào đơn này
                    </button>
                    <a
                      href={`/dashboard/orders?orderId=${soCheckMeta.orderId}`}
                      target="_blank" rel="noreferrer"
                      style={{
                        fontSize: "10px", fontWeight: 600, padding: "4px 10px",
                        border: "1px solid var(--border)", borderRadius: "3px",
                        color: "var(--ink-muted)", textDecoration: "none",
                      }}
                    >
                      Xem đơn →
                    </a>
                  </div>
                </div>
              )}
              {soCheck === "idle" && (
                <span style={{ fontSize: "10px", color: "var(--ink-muted)", lineHeight: "1.3" }}>
                  {L.ui.form.soHint}
                </span>
              )}
            </VField>
            <VField label={L.ui.form.customer} required={soCheck !== "taken"} error={errors.khachHang}>
              <VInput value={form.khachHang} onChange={(v) => setField("khachHang", v)}
                placeholder={L.ui.form.phCustomer} hasError={!!errors.khachHang} />
              {soCheck === "taken" && (
                <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
                  Mặc định theo SO — sửa nếu MO này khác
                </span>
              )}
            </VField>
            <VField label={L.ui.form.sales} required={soCheck !== "taken"} error={errors.salesName}>
              <VInput value={form.salesName} onChange={(v) => setField("salesName", v)}
                placeholder={L.ui.form.phSales} hasError={!!errors.salesName} />
              {soCheck === "taken" && (
                <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
                  Mặc định theo SO — sửa nếu MO này khác
                </span>
              )}
            </VField>
            <VField label={L.ui.form.source} required={soCheck !== "taken"} error={errors.nguon}>
              <VSelect value={form.nguon} onChange={(v) => setField("nguon", v)}
                hasError={!!errors.nguon} disabled={soCheck === "taken"}
                options={[{ value: "", label: L.ui.form.select },
                  ...NGUON_OPTIONS.map((v) => ({ value: v, label: v }))]} />
              {soCheck === "taken" && (
                <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>Lấy từ đơn hiện có</span>
              )}
            </VField>
          </div>

          {/* Hàng bổ sung: Phân loại KH */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "14px" }}>
            <VField label={L.ui.form.customerType}>
              <VSelect value={form.phanLoaiKh} onChange={(v) => setField("phanLoaiKh", v)}
                options={[{ value: "", label: L.ui.form.select },
                  ...PHAN_LOAI_KH_OPTIONS.map((v) => ({ value: v, label: v }))]} />
            </VField>
          </div>

          {/* Hàng 2: Ưu tiên | Ngày chốt | Dự kiến | 3 sao */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "14px" }}>
            <VField label={L.ui.form.priority}>
              <VSelect value={form.uuTien}
                onChange={(v) => handleUuTienChange(v as PriorityCode | "")}
                options={[
                  { value: "",       label: L.ui.form.notSet },
                  { value: "Normal", label: `Normal — 21 ${L.ui.form.days}` },
                  { value: "UT2",    label: `UT2 — 14 ${L.ui.form.days}` },
                  { value: "UT1",    label: `UT1 — 7 ${L.ui.form.days}` },
                  { value: "SR",     label: `SR — 30 ${L.ui.form.days}` },
                ]} />
            </VField>
            <VField label={L.ui.form.commitDate} required={!isPre} error={errors.ngayChot}>
              <VDateInput value={form.ngayChot} onChange={handleNgayChotChange}
                hasError={!!errors.ngayChot} />
            </VField>
            <VField label={L.ui.form.expectedDate} error={errors.ngayDukien}>
              <VDateInput value={form.ngayDukien} onChange={handleNgayDukienChange}
                hasError={!!errors.ngayDukien} />
              <span style={{ fontSize: "10px", color: "var(--ink-muted)", lineHeight: "1.3" }}>
                {form.dateIsAuto && form.ngayDukien
                  ? `${formatDateVN(form.ngayDukien)} — ${L.ui.form.autoDateHint}`
                  : L.ui.form.manualDate}
              </span>
            </VField>
            <VField label={L.ui.form.starOrder}>
              <VSelect value={form.donHang3Sao ? "true" : "false"}
                onChange={(v) => setField("donHang3Sao", v === "true")}
                options={[
                  { value: "false", label: L.ui.form.starNo },
                  { value: "true",  label: L.ui.form.starYes },
                ]} />
            </VField>
          </div>

          {/* Hàng 3: Link Chat */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
            <div style={{ gridColumn: "span 2" }}>
              <VField label={L.ui.form.chatLink} error={errors.linkChat}>
                <VInput value={form.linkChat} onChange={(v) => setField("linkChat", v)}
                  placeholder="https://zalo.me/... hoặc Link Messenger" hasError={!!errors.linkChat} />
              </VField>
            </div>
          </div>

          {/* Hàng 4: Ghi chú Sales — full width textarea */}
          <VField label={L.ui.form.salesNote}>
            <VTextarea value={form.ghiChu} onChange={(v) => setField("ghiChu", v)}
              placeholder={L.ui.form.phSalesNote} rows={2} />
          </VField>

        </Card>

        {/* ══ SECTION 2: Danh sách sản phẩm ══════════════════════════════════════ */}
        <Card title={`${L.ui.form.productList} (${itemCount} ${L.ui.form.productUnit})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {form.items.map((item, index) => (
              <ItemCard
                key={index}
                index={index}
                item={item}
                errors={errors}
                canRemove={form.items.length > 1}
                isPre={isPre}
                onChange={(patch) => updateItem(index, patch)}
                onDuplicate={() => duplicateItem(index)}
                onRemove={() => removeItem(index)}
              />
            ))}
            <button type="button" onClick={addItem}
              style={{
                width: "100%", padding: "10px",
                border: "1px dashed var(--border)", background: "transparent",
                fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "var(--ink-muted)", cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ink)"; e.currentTarget.style.color = "var(--ink)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--ink-muted)"; }}
            >
              <Plus style={{ display: "inline", width: "13px", height: "13px", marginRight: "5px", verticalAlign: "middle" }} />
              {L.ui.form.addProduct}
            </button>
          </div>
        </Card>

      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, height: "56px",
        background: "var(--cream-card)", borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", zIndex: 50,
      }}>
        <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
          <strong style={{ color: "var(--ink)" }}>{itemCount} {L.ui.form.productUnit}</strong>
          {"  ·  "}
          {L.ui.form.footerNote}
          {"  ·  "}
          <code style={{ fontSize: "11px", fontFamily: "monospace" }}>
            {form.soOdoo.trim() || L.ui.form.footerSoEmpty}
          </code>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button type="button" onClick={() => router.push("/dashboard/orders")}
            className="psx-btn-secondary">
            {L.ui.form.cancel}
          </button>
          {soCheck === "taken" ? (
            <span style={{ fontSize: "11px", color: "var(--s-gold)", fontWeight: 500 }}>
              Dùng nút &quot;Thêm sản phẩm&quot; bên trên SO#
            </span>
          ) : (
            <button type="submit" disabled={isSubmitting}
              className="psx-btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {isSubmitting && <Loader2 className="animate-spin" style={{ width: "13px", height: "13px" }} />}
              {isSubmitting ? L.ui.form.saving : L.ui.form.save}
            </button>
          )}
        </div>
      </div>

    </form>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({
  index, item, errors, canRemove, isPre, onChange, onDuplicate, onRemove,
}: {
  index: number;
  item: ItemDraft;
  errors: Record<string, string>;
  canRemove: boolean;
  isPre: boolean;
  onChange: (patch: Partial<ItemDraft>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const L   = useLabels();
  const err = (k: string) => errors[`items.${index}.${k}`];

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)" }}>

      {/* Item header */}
      <div style={{
        background: "var(--cream-dark)", borderBottom: "1px solid var(--border)",
        padding: "6px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          background: "var(--ink)", color: "var(--cream)",
          fontSize: "10px", fontWeight: 700, padding: "2px 10px",
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          {L.ui.form.productLabel} #{index + 1}
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button type="button" onClick={onDuplicate}
            className="psx-btn-secondary"
            style={{ height: "26px", fontSize: "10px", padding: "0 10px", display: "flex", alignItems: "center", gap: "4px" }}>
            <Copy style={{ width: "11px", height: "11px" }} />
            {L.ui.form.duplicate}
          </button>
          {canRemove && (
            <button type="button" onClick={onRemove}
              style={{
                height: "26px", fontSize: "10px", padding: "0 10px",
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--ink-muted)", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--s-red)"; e.currentTarget.style.color = "var(--s-red)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--ink-muted)"; }}>
              {L.ui.form.remove}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>

        {/* MO# + Số lượng */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "10px" }}>
          <div style={{ gridColumn: "span 4" }}>
            <VField label="MO#" required error={err("moId")}>
              <VInput value={item.moId} onChange={(v) => onChange({ moId: v })}
                placeholder="VD: 26.10680" hasError={!!err("moId")} />
              <span style={{ fontSize: "10px", color: "var(--ink-muted)", lineHeight: "1.3" }}>
                {L.ui.form.moHint}
              </span>
            </VField>
          </div>
          {/* Số lượng luôn = 1 (mỗi MO là 1 sản phẩm custom) — ẩn field, không cho sửa */}
        </div>

        {/* Hàng 1: Tên SP | NVL */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "10px" }}>
          <div style={{ gridColumn: "span 7" }}>
            <VField label={L.ui.form.tenSp} required error={err("tenSp")}>
              <VSelect value={item.tenSp} onChange={(v) => onChange({ tenSp: v })}
                hasError={!!err("tenSp")}
                options={[{ value: "", label: L.ui.form.select },
                  ...TEN_SP_OPTIONS.map((canonical, i) => ({ value: canonical, label: L.tenSp[i] ?? canonical }))]} />
            </VField>
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <VField label={L.ui.form.nvl} required error={err("nvl")}>
              <NvlSelect value={item.nvl} onChange={(v) => onChange({ nvl: v })}
                hasError={!!err("nvl")} className="psx-input" />
            </VField>
          </div>
        </div>

        {/* Hàng 2: Size | Xi mạ | TL | Loại đá chủ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "10px" }}>
          <div style={{ gridColumn: "span 2" }}>
            <VField label="Size">
              <VInput value={item.size} onChange={(v) => onChange({ size: v })} placeholder="VD: 10" />
            </VField>
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <VField label={L.ui.form.plating}>
              <PlatingSelect value={item.xiMa} onChange={(v) => onChange({ xiMa: v })}
                className="psx-input" />
            </VField>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <VField label={L.ui.form.weightReq} required={false} error={err("trongLuongYc")}>
              <VInput type="number" value={item.trongLuongYc}
                onChange={(v) => onChange({ trongLuongYc: v })}
                placeholder="0.00" step="0.01" hasError={!!err("trongLuongYc")} />
            </VField>
          </div>
          <div style={{ gridColumn: "span 5" }}>
            <VField label={L.ui.form.mainStone}>
              <VSelect value={item.loaiHotChu} onChange={(v) => onChange({ loaiHotChu: v })}
                options={[{ value: "", label: L.ui.form.select },
                  ...LOAI_HOT_CHU_OPTIONS.map((canonical, i) => ({ value: canonical, label: L.stoneTypes[i] ?? canonical }))]} />
            </VField>
          </div>
        </div>

        {/* Hàng 3: Đá chủ | Đá tấm */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <VField label={L.ui.form.mainStoneSpec}>
            <VInput value={item.thongSoDaChu} onChange={(v) => onChange({ thongSoDaChu: v })}
              placeholder="VD: 5.4mm × 1v" />
          </VField>
          <VField label={L.ui.form.slabStoneSpec}>
            <VInput value={item.thongSoDaTam} onChange={(v) => onChange({ thongSoDaTam: v })}
              placeholder="VD: 1.2mm × 12v" />
          </VField>
        </div>

        {/* Hàng 4: File 3D — hàng riêng, không ghép textarea */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "10px" }}>
          <div style={{ gridColumn: "span 5" }}>
            <VField label={L.ui.form.designFile} error={err("file3d")}>
              <VInput value={item.file3d} onChange={(v) => onChange({ file3d: v })}
                placeholder="https://drive.google.com/..." hasError={!!err("file3d")} />
            </VField>
          </div>
        </div>

        {/* Hàng 5: Diễn giải | Ghi chú SP — 2 textarea cùng chiều cao */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <VField label={L.ui.form.productDesc}>
            <VTextarea value={item.dienGiai} onChange={(v) => onChange({ dienGiai: v })}
              placeholder={L.ui.form.phProductDesc} />
          </VField>
          <VField label={L.ui.form.productNote}>
            <VTextarea value={item.ghiChuSp} onChange={(v) => onChange({ ghiChuSp: v })}
              placeholder={L.ui.form.phProductNote} />
          </VField>
        </div>

      </div>
    </div>
  );
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)" }}>
      <div style={{ padding: "8px 16px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }}>
        <span className="psx-label">{title}</span>
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}

function VField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }} data-error={error ? "" : undefined}>
      <label className="psx-label">
        {label}{required && <span style={{ color: "var(--s-red)", marginLeft: "2px" }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: "10px", color: "var(--s-red)" }}>{error}</span>}
    </div>
  );
}

function VInput({ type = "text", value, onChange, placeholder, hasError, step, disabled }: {
  type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hasError?: boolean; step?: string; disabled?: boolean;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} step={step} disabled={disabled}
      className="psx-input"
      style={{
        ...(hasError ? { borderBottomColor: "var(--s-red)", borderBottomWidth: "2px" } : {}),
        ...(disabled ? { opacity: 0.6, cursor: "not-allowed", background: "var(--cream-dark)" } : {}),
      }}
    />
  );
}

function VTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className="psx-input"
      style={{ resize: "vertical", minHeight: "56px", lineHeight: "1.5" }}
    />
  );
}

function VDateInput({ value, onChange, hasError }: {
  value: string; onChange: (v: string) => void; hasError?: boolean;
}) {
  // Dùng chung DateInput (dd/mm/yyyy cố định) — trước đây <input type="date"> gốc hiển thị
  // theo locale hệ thống (VD máy để tiếng Anh ra mm/dd/yyyy), lệch với quy ước toàn app.
  return (
    <DateInput value={value} onChange={onChange}
      className="psx-input"
      style={hasError ? { borderBottomColor: "var(--s-red)", borderBottomWidth: "2px" } : undefined}
    />
  );
}

function VSelect({ value, onChange, options, hasError, disabled }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hasError?: boolean; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="psx-input"
      style={{
        ...(hasError ? { borderBottomColor: "var(--s-red)", borderBottomWidth: "2px" } : {}),
        ...(disabled ? { opacity: 0.6, cursor: "not-allowed", background: "var(--cream-dark)" } : {}),
      }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
