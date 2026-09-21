export default function OrdersLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--cream)" }}>
      {/* Toolbar skeleton */}
      <div style={{ flexShrink: 0, height: "48px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px", padding: "0 20px" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: "26px", width: i === 0 ? "70px" : "80px", background: "var(--cream-card)", border: "1px solid var(--border)", borderRadius: "2px" }} />
        ))}
      </div>

      {/* Stats bar skeleton */}
      <div style={{ flexShrink: 0, display: "flex", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ flex: 1, padding: "14px 20px", borderRight: i < 4 ? "1px solid var(--border)" : "none" }}>
            <div style={{ height: "28px", width: "40px", background: "var(--cream-dark)", borderRadius: "2px", marginBottom: "6px" }} className="psx-shimmer" />
            <div style={{ height: "10px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
          </div>
        ))}
      </div>

      {/* Table header skeleton */}
      <div style={{ flexShrink: 0, height: "36px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }} />

      {/* Rows skeleton */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: "24px", padding: "12px 20px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
            <div style={{ height: "12px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "120px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "100px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px", marginLeft: "auto" }} className="psx-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
