export default function UsersLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--cream)" }}>
      <div style={{ flexShrink: 0, padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--cream-card)" }}>
        <div style={{ height: "24px", width: "170px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        <div style={{ height: "11px", width: "150px", background: "var(--cream-dark)", borderRadius: "2px", marginTop: "6px" }} className="psx-shimmer" />
      </div>

      {/* Toolbar */}
      <div style={{ flexShrink: 0, padding: "10px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px" }}>
        <div style={{ height: "32px", width: "160px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        <div style={{ height: "32px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", marginLeft: "auto" }} className="psx-shimmer" />
      </div>

      {/* Table header */}
      <div style={{ flexShrink: 0, height: "36px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }} />

      {/* Rows */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: "20px", padding: "11px 24px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
            {/* Avatar placeholder */}
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--cream-dark)", flexShrink: 0 }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "150px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "12px", width: "200px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
            <div style={{ height: "20px", width: "70px", background: "var(--cream-dark)", borderRadius: "10px", marginLeft: "auto" }} className="psx-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
