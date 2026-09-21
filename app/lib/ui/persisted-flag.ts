// ─── Cờ bật/tắt nhớ được qua localStorage, đọc bằng useSyncExternalStore ─────
//
// VÌ SAO TÁCH RA: `ActionDock` (thanh hành động nổi) vừa có một store như thế này, và phần
// Sidebar gập được cần ĐÚNG cùng một thứ. Viết bản thứ hai là tự tạo ra bản sao mà đợt trước
// vừa mất công dẹp ở hai nút nổi — không lặp lại trong cùng một tuần.
//
// ⚠️ BA CÁI BẪY ĐÃ TRẢ GIÁ, gói hết vào đây để chỗ gọi không phải nhớ:
//
//   1. `storage` event KHÔNG BẮN CHO TAB ĐÃ GÂY RA THAY ĐỔI. Chỉ nghe `storage` thì bấm nút xong
//      màn hình không đổi gì. Store phải TỰ gọi các listener sau khi ghi.
//   2. try/catch quanh CẢ việc đọc, không chỉ việc ghi: ở chế độ riêng tư / khi trình duyệt chặn
//      dữ liệu site, chính việc TRUY CẬP `localStorage` ném lỗi — kiểm `typeof` không đỡ được.
//   3. `getSnapshot` phải trả GIÁ TRỊ NGUYÊN THUỶ. Một object mới mỗi lần render sẽ làm React
//      lặp vô hạn.
//
// `getServerSnapshot` trả về `defaultValue`, nhờ đó khung hydrate vẽ đúng trạng thái mặc định
// rồi mới nhận giá trị thật — không có nhịp nháy ở mọi lần tải trang.
//
// File THUẦN: không React. Chỗ gọi tự truyền vào `useSyncExternalStore`.

export type PersistedFlagStore = {
  /** Truyền thẳng vào `useSyncExternalStore` — đã bind, không cần arrow ở chỗ gọi. */
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
  getServerSnapshot: () => boolean;
  set: (next: boolean) => void;
  toggle: () => void;
};

/**
 * Tạo một store cho MỘT khoá localStorage.
 *
 * Gọi ở TẦM MODULE (ngoài component), không gọi trong thân render: mỗi lần gọi tạo một tập
 * listener mới, nên gọi trong render là mỗi lần vẽ lại một store khác và `useSyncExternalStore`
 * sẽ hủy-đăng-ký rồi đăng-ký lại liên tục.
 */
export function createPersistedFlag(key: string, defaultValue = false): PersistedFlagStore {
  const listeners = new Set<() => void>();

  const getSnapshot = (): boolean => {
    try {
      const raw = window.localStorage.getItem(key);
      // Chưa từng ghi → dùng mặc định. Phân biệt "chưa chọn" với "đã chọn false".
      return raw === null ? defaultValue : raw === "1";
    } catch {
      return defaultValue;
    }
  };

  const set = (next: boolean): void => {
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Không lưu được thì thôi — lựa chọn chỉ mất sau khi tải lại trang. KHÔNG được để việc
      // này làm gãy cú bấm, nên vẫn phát tín hiệu ở dưới.
    }
    listeners.forEach((l) => l());
  };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      window.addEventListener("storage", onChange);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    getSnapshot,
    getServerSnapshot: () => defaultValue,
    set,
    toggle: () => set(!getSnapshot()),
  };
}

// ─── Biến thể GIÁ TRỊ CHUỖI ─────────────────────────────────────────────────
//
// Cùng ba cái bẫy ở trên, nên KHÔNG viết bản thứ hai của phần cơ chế — chỉ khác kiểu dữ liệu.
//
// Dùng cho: "người dùng đã xem lời nhắc việc có vân tay nào rồi". Không thể dùng cờ boolean,
// vì câu hỏi không phải "đã xem chưa" mà là "đã xem CÁI NÀO" — nội dung đổi thì phải hỏi lại.

export type PersistedStringStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => string;
  getServerSnapshot: () => string;
  set: (next: string) => void;
};

/** Tạo store cho MỘT khoá localStorage kiểu chuỗi. Gọi ở TẦM MODULE, không trong thân render. */
export function createPersistedString(key: string, defaultValue = ""): PersistedStringStore {
  const listeners = new Set<() => void>();

  const getSnapshot = (): string => {
    try {
      return window.localStorage.getItem(key) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      window.addEventListener("storage", onChange);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    getSnapshot,
    getServerSnapshot: () => defaultValue,
    set: (next) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Không lưu được thì lời nhắc sẽ mở lại ở lần tải sau — phiền, nhưng không mất gì.
      }
      // `storage` KHÔNG bắn cho chính tab vừa ghi — phải tự gọi, nếu không popup không đóng.
      listeners.forEach((l) => l());
    },
  };
}
