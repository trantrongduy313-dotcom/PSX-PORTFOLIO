export default function DashboardLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--cream)" }}>
      {/* Header skeleton */}
      <div style={{ flexShrink: 0, padding: "18px 32px 14px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
        <div style={{ height: "26px", width: "120px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        <div style={{ height: "12px", width: "200px", background: "var(--cream-dark)", borderRadius: "2px", marginTop: "6px" }} className="psx-shimmer" />
      </div>

      <div style={{ flex: 1, padding: "28px 32px", display: "flex", flexDirection: "column", gap: "28px", maxWidth: "960px" }}>
        {/* Stat cards skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: "var(--cream-card)", border: "1px solid var(--border)", padding: "20px 24px" }}>
              <div style={{ height: "10px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", marginBottom: "10px" }} className="psx-shimmer" />
              <div style={{ height: "40px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            </div>
          ))}
        </div>

        {/* Widget skeleton */}
        <div style={{ border: "1px solid var(--border)" }}>
          <div style={{ height: "40px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }} className="psx-shimmer" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: "20px" }}>
              <div style={{ height: "12px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
              <div style={{ height: "12px", width: "40px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
              <div style={{ height: "12px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px", marginLeft: "auto" }} className="psx-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
