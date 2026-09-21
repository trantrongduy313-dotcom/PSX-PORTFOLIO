"use client";

import React from "react";

// Simple skeleton placeholder mimicking the layout of CreateOrderForm.
// Uses the existing `.psx-shimmer` class (defined in global CSS) for the loading animation.
export function SkeletonForm() {
  return (
    <div style={{ padding: "16px", background: "var(--cream-card)" }}>
      {/* Header */}
      <div style={{ height: "24px", width: "120px", marginBottom: "16px" }} className="psx-shimmer" />

      {/* Grid of fields – mimic the 4‑column layout of the real form */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
        {[...Array(12)].map((_, i) => (
          <div key={i} style={{ height: "20px" }} className="psx-shimmer" />
        ))}
      </div>

      {/* Section title placeholder */}
      <div style={{ height: "18px", width: "200px", margin: "24px 0 12px", }} className="psx-shimmer" />

      {/* Items list placeholder – 2 items default */}
      {[...Array(2)].map((_, idx) => (
        <div key={idx} style={{ border: "1px solid var(--border)", background: "var(--cream-card)", marginBottom: "12px", padding: "12px" }}>
          <div style={{ height: "16px", width: "80%", marginBottom: "8px" }} className="psx-shimmer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: "10px" }}>
            {[...Array(3)].map((__, j) => (
              <div key={j} style={{ height: "14px" }} className="psx-shimmer" />
            ))}
          </div>
        </div>
      ))}

      {/* Footer button placeholder */}
      <div style={{ height: "36px", width: "120px", marginTop: "24px" }} className="psx-shimmer" />
    </div>
  );
}
