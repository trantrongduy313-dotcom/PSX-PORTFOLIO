export default function Kpi3dLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--cream)" }}>
      <div style={{ flexShrink: 0, padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
        <div style={{ height: "24px", width: "160px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        <div style={{ height: "11px", width: "200px", background: "var(--cream-dark)", borderRadius: "2px", marginTop: "6px" }} className="psx-shimmer" />
      </div>

      {/* Period filter bar */}
      <div style={{ flexShrink: 0, padding: "10px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px", alignItems: "center" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: "28px", width: i === 0 ? "90px" : "70px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        ))}
      </div>

      {/* Table header */}
      <div style={{ flexShrink: 0, height: "36px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }} />

      {/* Rows */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: "20px", padding: "11px 24px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
            <div style={{ height: "12px", width: "130px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", marginLeft: "auto" }} className="psx-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
