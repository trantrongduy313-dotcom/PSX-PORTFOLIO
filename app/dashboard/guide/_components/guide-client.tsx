"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, BookOpen, Languages, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import {
  DESIGNER_3D_CHAPTERS,
  EMPLOYEE_CHAPTERS,
  MANAGER_CHAPTERS,
  type GuideLang,
  type GuideRole,
} from "@/app/lib/guide/content";
import { allowedGuideRoles, clampGuideRole } from "@/app/lib/guide/guide-role";
import { docStaleness, stalenessNotice } from "@/app/lib/business/docs/staleness";
import {
  getGuideStateServerSnapshot,
  getGuideStateSnapshot,
  mergeGuideState,
  subscribeGuideState,
  writeGuideState,
  type GuideState,
} from "./guide-state-store";

/**
 * Vai trò → bộ chương. Switch VÉT CẠN: thêm vai trò thứ tư vào `GuideRole` mà quên ở đây thì
 * BUILD ĐỎ, không phải chờ ai đó mở trang ra thấy nội dung của vai trò khác.
 */
function chaptersFor(role: GuideRole) {
  switch (role) {
    case "employee": return EMPLOYEE_CHAPTERS;
    case "manager":  return MANAGER_CHAPTERS;
    case "design3d": return DESIGNER_3D_CHAPTERS;
    default:         return assertNeverRole(role);
  }
}

function assertNeverRole(role: never): never {
  throw new Error(`Vai trò hướng dẫn chưa được xử lý: ${String(role)}`);
}

// ── Guide Page ─────────────────────────────────────────────────────────────────
export function GuideClient({
  defaultRole,
  changelogPublishedAt,
}: {
  defaultRole: GuideRole;
  /**
   * Mốc đăng của các mục "Có gì mới" — để đếm "bao nhiêu thay đổi kể từ lần rà chương này".
   *
   * Truyền TỪ SERVER vì chỉ server đọc được DB, và dùng CHUNG helper với Sidebar
   * (app/lib/changelog/published-dates.ts) để hai màn không đếm ra hai con số.
   */
  changelogPublishedAt: string[];
}) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);

  // Trạng thái đọc nằm ở localStorage — trạng thái NGOÀI React. Snapshot là CHUỖI THÔ (so được
  // bằng Object.is); việc dựng object là bước phái sinh. Xem guide-state-store.ts.
  //
  // `null` = bản server, chưa hydrate → không vẽ gì, giữ đúng hành vi của cờ `mounted` cũ.
  const raw = useSyncExternalStore(subscribeGuideState, getGuideStateSnapshot, getGuideStateServerSnapshot);
  // ⚠️ KẸP vai đã lưu về tập được phép NGAY Ở ĐÂY, không phải ở chỗ vẽ tab. Người dùng có thể đã
  // lưu một bộ mà nay họ không còn được mở (xem clampGuideRole) — chỉ ẩn nút thì họ vẫn mở ra
  // đúng bộ đó và không có đường quay lại.
  const state = useMemo(() => {
    const merged = mergeGuideState(raw, defaultRole);
    const role = clampGuideRole(merged.role, defaultRole);
    // Bị kẹp nghĩa là bộ đổi → số chương đổi theo, nên đưa về chương đầu thay vì giữ một chỉ số
    // trỏ vào bộ cũ (chương 8 của bộ Quản lý không tồn tại trong một bộ 7 chương).
    return role === merged.role ? merged : { ...merged, role, chapter: 0, maxReached: 0 };
  }, [raw, defaultRole]);
  const mounted = raw !== null;
  const roleTabs = allowedGuideRoles(defaultRole);

  function update(patch: Partial<GuideState>) {
    // Ghi thẳng vào store rồi để sự kiện kéo render — KHÔNG giữ một bản sao trong state React.
    // Hai nơi giữ cùng một sự thật thì sớm muộn lệch, và ở đây "sự thật" là localStorage.
    writeGuideState({ ...state, ...patch });
  }

  function goTo(idx: number) {
    update({ chapter: idx, maxReached: Math.max(state.maxReached, idx) });
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const chapters = chaptersFor(state.role);
  const chapter  = chapters[state.chapter];
  const content  = chapter?.[state.lang];
  const total    = chapters.length;
  const progress = Math.round(((state.maxReached + 1) / total) * 100);

  const vi = state.lang === "vi";

  // ─── Độ cũ của chương đang mở ───────────────────────────────────────────────
  //
  // `now` dựng MỘT LẦN cho mỗi lượt tính, không gọi Date.now() bên trong vòng lặp: hai mốc lệch
  // nhau vài mili giây có thể rơi hai bên ranh giới tháng ở đúng nửa đêm 31 rạng 01.
  //
  // Chỉ tính cho chương ĐANG MỞ, không tính cả 23 chương: danh sách bên trái không hiện cờ độ cũ
  // (một danh sách mà chương nào cũng gắn cờ thì vô dụng như không gắn cờ nào — xem
  // compareByStaleness, dành cho trang sức khoẻ tài liệu về sau).
  // KHÔNG useMemo: phép này chạy trên tối đa 200 mốc cho ĐÚNG MỘT chương — rẻ hơn nhiều so với
  // chi phí giữ một bộ nhớ đệm, và eslint chặn đúng (`preserve-manual-memoization`) vì `chapter`
  // không phải một tham chiếu ổn định.
  const staleness = chapter
    ? docStaleness(chapter.lastReviewed, changelogPublishedAt, new Date())
    : null;
  const notice = staleness ? stalenessNotice(staleness, vi ? "vi" : "en") : null;

  if (!mounted) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--cream)",
      overflow: "hidden",
    }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
      }}>
        {/* Row 1: breadcrumb + title + controls */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 24px 10px",
          borderBottom: "1px solid var(--border)",
        }}>
          <button
            onClick={() => router.back()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
              color: "var(--ink-muted)",
              textDecoration: "none",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "color 0.12s",
            }}
          >
            <ArrowLeft size={13} />
            {vi ? "Quay lại" : "Back"}
          </button>

          <span style={{ color: "var(--border-md)", fontSize: "12px" }}>/</span>

          <div style={{ display: "flex", alignItems: "center", gap: "7px", flex: 1 }}>
            <BookOpen size={15} style={{ color: "var(--pink)" }} />
            <span style={{
              fontFamily: "var(--font-cormorant, 'Cormorant Garamond', Georgia, serif)",
              fontSize: "17px",
              color: "var(--ink)",
              letterSpacing: "0.02em",
            }}>
              {vi ? "Hướng dẫn Sử dụng" : "User Guide"}
            </span>
          </div>

          {/* Language toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Languages size={13} style={{ color: "var(--ink-muted)" }} />
            {(["vi", "en"] as GuideLang[]).map(l => (
              <button key={l} onClick={() => update({ lang: l })} style={{
                padding: "3px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                cursor: "pointer",
                border: "1px solid",
                background: state.lang === l ? "var(--ink)" : "transparent",
                color: state.lang === l ? "#fff" : "var(--ink-muted)",
                borderColor: state.lang === l ? "var(--ink)" : "var(--border)",
                transition: "all 0.12s",
                fontFamily: "var(--font-body, sans-serif)",
              }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: role tabs + progress */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: "24px",
        }}>
          {/* Role tabs */}
          <div style={{ display: "flex", gap: "0" }}>
            {/* ⚠️ NHÃN PHẢI HỨA ĐÚNG THỨ BỘ ĐÓ CHỨA. Tab đầu từng tên là "Hướng dẫn Nhân Viên"
                trong khi nội dung viết riêng cho SALES — một cái tên rộng hơn nội dung. KHOÁ
                `employee` giữ nguyên (nằm trong localStorage và guide-role.ts); chỉ chữ đổi.

                Và chỉ vẽ những bộ người này ĐƯỢC PHÉP mở (allowedGuideRoles). Còn đúng MỘT bộ
                thì hiện TÊN chứ không hiện NÚT: một hàng tab có mỗi một nút trông như một lựa
                chọn, mà lựa chọn thì phải có ít nhất hai — bấm vào không đi đâu cả. */}
            {([
              { role: "employee" as GuideRole, vi: "Nhân Viên Bán Hàng (Sales)", en: "Sales Guide" },
              { role: "manager"  as GuideRole, vi: "Hướng dẫn Quản Lý",           en: "Manager Guide" },
              { role: "design3d" as GuideRole, vi: "Hướng dẫn NV 3D",             en: "3D Designer Guide" },
            ]).filter(({ role }) => roleTabs.includes(role)).map(({ role, vi: labelVi, en: labelEn }) => {
              if (roleTabs.length === 1) {
                return (
                  <span key={role} style={{
                    padding: "11px 16px", fontSize: "11.5px", fontWeight: 600,
                    letterSpacing: "0.08em", textTransform: "uppercase" as const,
                    color: "var(--ink)", borderBottom: "2px solid var(--pink)", marginBottom: "-1px",
                  }}>{vi ? labelVi : labelEn}</span>
                );
              }
              const active = state.role === role;
              return (
                <button key={role} onClick={() => update({ role, chapter: 0, maxReached: 0 })} style={{
                  padding: "11px 16px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  color: active ? "var(--ink)" : "var(--ink-muted)",
                  borderBottom: active ? "2px solid var(--pink)" : "2px solid transparent",
                  marginBottom: "-1px",
                  transition: "all 0.12s",
                  fontFamily: "var(--font-body, sans-serif)",
                }}>
                  {vi ? labelVi : labelEn}
                </button>
              );
            })}
          </div>

          {/* Progress */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", paddingBottom: "2px" }}>
            <span style={{ fontSize: "11px", color: "var(--ink-muted)", whiteSpace: "nowrap", letterSpacing: "0.05em" }}>
              {vi ? "CHƯƠNG" : "CHAPTER"} {state.chapter + 1} / {total}
            </span>
            <div style={{ flex: 1, height: "3px", borderRadius: "99px", background: "var(--cream-dark)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                borderRadius: "99px",
                background: "var(--pink)",
                width: `${progress}%`,
                transition: "width 0.35s ease",
              }} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--ink-muted)", fontWeight: 600, width: "30px", textAlign: "right" }}>
              {progress}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Body: left nav + right content ─────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left: chapter list ─────────────────────────────────────────────── */}
        <div style={{
          width: "240px",
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          padding: "16px 0",
          background: "var(--cream-card)",
        }}>
          {chapters.map((ch, idx) => {
            const active  = idx === state.chapter;
            const reached = idx <= state.maxReached;
            return (
              <button key={ch.id} onClick={() => goTo(idx)} style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "10px 16px",
                textAlign: "left" as const,
                cursor: "pointer",
                border: "none",
                borderLeft: active ? "2px solid var(--pink)" : "2px solid transparent",
                background: active ? "var(--cream-dark)" : "transparent",
                transition: "background 0.12s",
                fontFamily: "var(--font-body, sans-serif)",
              }}>
                {/* Circle indicator */}
                <span style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  fontWeight: 700,
                  marginTop: "1px",
                  background: active
                    ? "var(--pink)"
                    : reached
                    ? "var(--cream-dark)"
                    : "transparent",
                  color: active ? "#fff" : reached ? "var(--ink-body)" : "var(--ink-muted)",
                  border: active ? "none" : `1px solid ${reached ? "var(--border-md)" : "var(--border)"}`,
                }}>
                  {reached && !active
                    ? <CheckCircle2 size={12} style={{ color: "var(--s-green)" }} />
                    : ch.id
                  }
                </span>
                <span style={{
                  fontSize: "12.5px",
                  lineHeight: 1.4,
                  color: active ? "var(--ink)" : reached ? "var(--ink-body)" : "var(--ink-muted)",
                  fontWeight: active ? 600 : 400,
                }}>
                  {ch[state.lang].title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: content ─────────────────────────────────────────────────── */}
        <div
          ref={contentRef}
          key={`${state.role}-${state.chapter}-${state.lang}`}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "36px 48px 40px",
          }}
        >
          {/* Content wrapper — max width for readability */}
          <div style={{ maxWidth: "740px", margin: "0 auto" }}>

            {/* Chapter badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                color: "var(--pink)",
              }}>
                {vi ? "Chương" : "Chapter"} {state.chapter + 1}
              </span>
              <span style={{ width: "32px", height: "1px", background: "var(--pink)", opacity: 0.4 }} />
            </div>

            {/* Chapter title */}
            <h1 style={{
              fontFamily: "var(--font-cormorant, 'Cormorant Garamond', Georgia, serif)",
              fontSize: "32px",
              fontWeight: 400,
              color: "var(--ink)",
              marginBottom: "28px",
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}>
              {content?.title}
            </h1>

            {/* ── Độ cũ của chương — CHỈ HIỆN KHI CÓ GÌ ĐỂ NÓI ────────────────────
                🔴 BẢN TRƯỚC LÀ MỘT CÂU VÔ ĐIỀU KIỆN:

                  "Chương này rà lần cuối {mốc}. Hệ thống cập nhật liên tục nên một số chi tiết
                   CÓ THỂ đã thay đổi — xem Có gì mới."

                Nó hiện y hệt trên chương vừa rà hôm qua và chương bỏ quên tám tháng. Một cảnh báo
                bật vĩnh viễn thì không phải cảnh báo — người đọc học cách bỏ qua sau ba lần.

                Bằng chứng nó đã vô dụng: content.tsx dạy sai định dạng số MO suốt 717 commit MÀ
                CÂU NÀY VẪN ĐANG HIỆN ngay trên chương đó.

                Nay là một CON SỐ ĐO ĐƯỢC — "đã có 12 thay đổi hệ thống kể từ đó" — và IM LẶNG khi
                không có thay đổi nào. Có im lặng thì lúc lên tiếng mới có nghĩa.

                Luật ở business/docs/staleness.ts (thuần, có test). `notice === null` = chương còn
                tươi, không vẽ gì cả. */}
            {notice && (
              <p style={{
                fontSize: "11px",
                color: staleness?.level === "STALE" ? "#92400e" : "var(--ink-muted)",
                margin: "-18px 0 26px",
                lineHeight: 1.6,
              }}>
                {notice}{" "}
                <Link href="/dashboard/whats-new" style={{ color: "var(--pink)", textDecoration: "underline" }}>
                  {vi ? "Xem có gì mới" : "See what's new"}
                </Link>
                .
              </p>
            )}

            {/* Chapter content */}
            <div className="guide-page-content">
              {content?.content}
            </div>

            {/* Navigation */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "48px",
              paddingTop: "24px",
              borderTop: "1px solid var(--border)",
            }}>
              <button
                onClick={() => state.chapter > 0 && goTo(state.chapter - 1)}
                disabled={state.chapter === 0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 18px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: state.chapter === 0 ? "not-allowed" : "pointer",
                  opacity: state.chapter === 0 ? 0.3 : 1,
                  border: "1px solid var(--border)",
                  background: "var(--cream-card)",
                  color: "var(--ink-body)",
                  transition: "all 0.12s",
                  fontFamily: "var(--font-body, sans-serif)",
                }}
              >
                <ChevronLeft size={15} />
                <span>
                  {vi ? "Chương trước" : "Previous"}
                  {state.chapter > 0 && (
                    <span style={{ display: "block", fontSize: "11px", color: "var(--ink-muted)", fontWeight: 400 }}>
                      {chapters[state.chapter - 1]?.[state.lang].title}
                    </span>
                  )}
                </span>
              </button>

              {/* Dot indicators */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {chapters.map((_, idx) => (
                  <button key={idx} onClick={() => goTo(idx)} style={{
                    width: idx === state.chapter ? "20px" : "7px",
                    height: "7px",
                    borderRadius: "99px",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    transition: "all 0.2s",
                    background: idx === state.chapter
                      ? "var(--pink)"
                      : idx <= state.maxReached
                      ? "var(--ink-muted)"
                      : "var(--border)",
                  }} />
                ))}
              </div>

              <button
                onClick={() => state.chapter < total - 1 && goTo(state.chapter + 1)}
                disabled={state.chapter === total - 1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 18px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: state.chapter === total - 1 ? "not-allowed" : "pointer",
                  opacity: state.chapter === total - 1 ? 0.3 : 1,
                  border: "1px solid transparent",
                  background: "var(--pink)",
                  color: "#fff",
                  transition: "all 0.12s",
                  fontFamily: "var(--font-body, sans-serif)",
                  textAlign: "right" as const,
                }}
              >
                <span>
                  {vi ? "Chương tiếp" : "Next"}
                  {state.chapter < total - 1 && (
                    <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.75)", fontWeight: 400 }}>
                      {chapters[state.chapter + 1]?.[state.lang].title}
                    </span>
                  )}
                </span>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Global content styles ───────────────────────────────────────────── */}
      <style>{`
        .guide-page-content {
          font-size: 14.5px;
          line-height: 1.72;
          color: var(--ink-body);
        }
        .guide-page-content h4 {
          font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
          font-size: 18px;
          font-weight: 500;
          color: var(--ink);
          margin: 24px 0 8px;
          letter-spacing: 0.01em;
        }
        .guide-page-content p {
          margin: 0 0 14px;
        }
        .guide-page-content ul, .guide-page-content ol {
          padding-left: 20px;
          margin: 0 0 14px;
        }
        .guide-page-content li {
          margin-bottom: 6px;
        }
        .guide-page-content ol { list-style: decimal; }
        .guide-page-content ul { list-style: disc; }

        /* Larger image placeholders on guide page */
        .guide-page-content > div > div[style*="border: 1px dashed"] {
          padding: 48px 32px !important;
        }
      `}</style>
    </div>
  );
}
