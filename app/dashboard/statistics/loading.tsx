export default function StatisticsLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--cream)" }}>
      {/* Header skeleton */}
      <div style={{ flexShrink: 0, padding: "18px 32px 14px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
        <div style={{ height: "26px", width: "140px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        <div style={{ height: "12px", width: "220px", background: "var(--cream-dark)", borderRadius: "2px", marginTop: "6px" }} className="psx-shimmer" />
      </div>

      <div style={{ flex: 1, padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px", overflowY: "auto" }}>
        {/* Summary stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: "var(--cream-card)", border: "1px solid var(--border)", padding: "20px 24px" }}>
              <div style={{ height: "10px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", marginBottom: "10px" }} className="psx-shimmer" />
              <div style={{ height: "36px", width: "56px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            </div>
          ))}
        </div>

        {/* Tab bar skeleton */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: "34px", width: i === 0 ? "100px" : "90px", background: "var(--cream-dark)", borderRadius: "2px 2px 0 0" }} className="psx-shimmer" />
          ))}
        </div>

        {/* Cross-tab table skeleton */}
        <div style={{ border: "1px solid var(--border)", background: "var(--cream-card)" }}>
          <div style={{ height: "36px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }} className="psx-shimmer" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: "20px", padding: "10px 16px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
              <div style={{ height: "12px", width: "100px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} style={{ height: "12px", width: "40px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
              ))}
              <div style={{ height: "12px", width: "40px", background: "var(--cream-dark)", borderRadius: "2px", marginLeft: "auto" }} className="psx-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
