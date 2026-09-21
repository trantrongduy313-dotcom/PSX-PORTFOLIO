import { requireRole } from "@/app/lib/auth-helpers";
import { StageReviewsClient } from "./_components/stage-reviews-client";

export const metadata = { title: "Đánh giá Khâu Nguội — PSX" };

export default async function StageReviewsPage() {
  await requireRole(["ADMIN", "ORDER"]);

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear  = now.getFullYear();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--cream)" }}>
      <div style={{
        flexShrink: 0,
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
      }}>
        <h1 style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: "22px", fontWeight: 400, color: "var(--ink)", margin: 0,
        }}>
          Đánh giá Khâu Nguội
        </h1>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <StageReviewsClient defaultMonth={defaultMonth} defaultYear={defaultYear} />
      </div>
    </div>
  );
}
