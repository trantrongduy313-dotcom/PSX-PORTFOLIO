// Thang z-index của toàn ứng dụng. Code mới KHÔNG đặt z-index bằng số — thêm tên vào đây.
// Thứ tự giữa các lớp là bất biến có test: __tests__/ui-z-index.test.ts
// Vì sao có file này: docs/04_ENGINEERING_GUIDELINES.md § Thang z-index

export const Z = {
  /** Nền mờ của OrderDetailPanel (`fixed inset-0 z-30`). */
  ORDER_PANEL_BACKDROP: 30,
  /** OrderDetailPanel (`fixed top-0 right-0 z-40 h-screen w-[520px]`). */
  ORDER_PANEL: 40,

  /** Thanh hành động nổi cạnh phải — Hỏi trợ lý · Góp ý · Việc cần xử lý. */
  ACTION_DOCK: 35,

  SYNC_NOTICE_DIALOG_BACKDROP: 1140,
  SYNC_NOTICE_DIALOG: 1141,

  ASK_AI_DIALOG_BACKDROP: 1150,
  ASK_AI_DIALOG: 1151,

  FEEDBACK_DIALOG_BACKDROP: 1200,
  FEEDBACK_DIALOG: 1201,
} as const;
