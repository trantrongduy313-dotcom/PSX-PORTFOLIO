export default function NewOrderLoading() {
  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--cream)" }}>
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Page title */}
        <div>
          <div style={{ height: "26px", width: "200px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
          <div style={{ height: "12px", width: "260px", background: "var(--cream-dark)", borderRadius: "2px", marginTop: "6px" }} className="psx-shimmer" />
        </div>

        {/* Form card */}
        <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", padding: "24px" }}>
          {/* Section label */}
          <div style={{ height: "10px", width: "100px", background: "var(--cream-dark)", borderRadius: "2px", marginBottom: "16px" }} className="psx-shimmer" />

          {/* 2-col fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div style={{ height: "10px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", marginBottom: "6px" }} className="psx-shimmer" />
                <div style={{ height: "34px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
              </div>
            ))}
          </div>

          {/* Full-width field */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ height: "10px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", marginBottom: "6px" }} className="psx-shimmer" />
            <div style={{ height: "34px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: "var(--border)", margin: "16px 0" }} />

          {/* Items section */}
          <div style={{ height: "10px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px", marginBottom: "14px" }} className="psx-shimmer" />
          <div style={{ border: "1px solid var(--border)" }}>
            <div style={{ height: "36px", background: "var(--cream-dark)", borderBottom: "1px solid var(--border)" }} />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: "16px", padding: "10px 16px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <div style={{ height: "12px", width: "120px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
                <div style={{ height: "12px", width: "80px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
                <div style={{ height: "12px", width: "60px", background: "var(--cream-dark)", borderRadius: "2px", marginLeft: "auto" }} className="psx-shimmer" />
              </div>
            ))}
          </div>
        </div>

        {/* Submit button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ height: "38px", width: "140px", background: "var(--cream-dark)", borderRadius: "2px" }} className="psx-shimmer" />
        </div>
      </div>
    </div>
  );
}
