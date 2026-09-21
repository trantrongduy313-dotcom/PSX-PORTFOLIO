export default function GuideLoading() {
  return (
    <div style={{ display: "flex", height: "100%", background: "var(--cream)" }}>
      {/* Chapter list sidebar skeleton */}
      <div style={{ width: "220px", flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--cream-card)", padding: "16px 0" }}>
        <div style={{ height: "11px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", margin: "0 16px 12px" }} className="psx-shimmer" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: "10px 16px", display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ height: "12px", width: i === 0 ? "140px" : `${90 + i * 10}px`, background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
          </div>
        ))}
      </div>

      {/* Content area skeleton */}
      <div style={{ flex: 1, padding: "32px 40px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Chapter title */}
        <div style={{ height: "28px", width: "260px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />

        {/* Content blocks */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ height: "13px", width: "100%", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "13px", width: "90%", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "13px", width: "75%", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
          </div>
        ))}

        {/* Nav buttons */}
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <div style={{ height: "36px", width: "100px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
          <div style={{ height: "36px", width: "100px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        </div>
      </div>
    </div>
  );
}
