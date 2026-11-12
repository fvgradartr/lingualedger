import { ImageResponse } from "next/og";

export const alt = "LinguaLedger — Paste the text. The floor is on chain.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#12100E",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            color: "#C4845A",
            fontSize: 18,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex", width: 36, height: 36, background: "#12100E", border: "1px solid #C4845A" }}>
            <div style={{ display: "flex", margin: "7px 0 7px 8px", width: 7, height: 22, background: "#F3EBDD" }} />
            <div style={{ display: "flex", margin: "7px 0 7px 4px", width: 7, height: 22, background: "#F3EBDD" }} />
          </div>
          Translation house · TR · EN · ES
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              lineHeight: 1.02,
              color: "#F3EBDD",
              fontFamily: "Georgia, Times New Roman, serif",
              fontStyle: "italic",
            }}
          >
            Paste the text.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              lineHeight: 1.02,
              color: "#F3EBDD",
              fontFamily: "Georgia, Times New Roman, serif",
            }}
          >
            The floor is on chain.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#C4845A",
            fontSize: 28,
            fontFamily: "Georgia, Times New Roman, serif",
            fontStyle: "italic",
          }}
        >
          <span>LinguaLedger</span>
          <span style={{ fontSize: 18, fontStyle: "normal", letterSpacing: "0.08em" }}>lingualedger.vercel.app</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
