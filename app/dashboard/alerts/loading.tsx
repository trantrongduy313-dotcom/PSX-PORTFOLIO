export default function AlertsLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--cream)" }}>
      {/* Header skeleton */}
      <div style={{ flexShrink: 0, padding: "18px 32px 14px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
        <div style={{ height: "26px", width: "130px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        <div style={{ height: "12px", width: "180px", background: "var(--cream-dark)", borderRadius: "2px", marginTop: "6px" }} className="psx-shimmer" />
      </div>

      {/* Filter bar skeleton */}
      <div style={{ flexShrink: 0, padding: "10px 32px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)", display: "flex", gap: "8px", alignItems: "center" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: "28px", width: i === 0 ? "90px" : "80px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        ))}
      </div>

      {/* Alert rows skeleton */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            padding: "14px 32px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
            background: "var(--cream-card)",
          }}>
            {/* Severity dot */}
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--cream-dark)", marginTop: "4px", flexShrink: 0 }} className="psx-shimmer" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={{ height: "13px", width: "200px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
                <div style={{ height: "18px", width: "60px", background: "var(--cream-dark)", borderRadius: "10px" }} className="psx-shimmer" />
              </div>
              <div style={{ height: "11px", width: "140px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            </div>
            <div style={{ height: "11px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", flexShrink: 0 }} className="psx-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
